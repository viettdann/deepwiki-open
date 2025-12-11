"""
JWT Service and FastAPI Dependencies for Authentication

Provides JWT token generation/validation and dependency injection for route protection.
Supports both cookie-based auth (browsers) and Authorization header (CLI/debug).
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from jwt.exceptions import InvalidTokenError as JWTError
from pydantic import BaseModel

from api.auth.user_store import get_user_store, User

logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET = os.environ.get('DEEPWIKI_AUTH_JWT_SECRET', '')
JWT_ALGORITHM = 'HS256'
# Fixed 30-day expiration for internal tool (ignore env var, always use 30 days)
JWT_EXPIRES_SECONDS = 2592000  # 30 days

# Check if login is required
LOGIN_REQUIRED = os.environ.get('DEEPWIKI_AUTH_LOGIN_REQUIRED', 'false').lower() in ['true', '1', 't']

# HTTP Bearer scheme for Authorization header
security = HTTPBearer(auto_error=False)


class TokenData(BaseModel):
    """JWT token payload data"""
    sub: str  # username
    role: str
    ver: int  # token version
    exp: int


class UserInfo(BaseModel):
    """Public user info (no password hash)"""
    id: str
    username: str
    role: str


def create_access_token(user: User) -> str:
    """
    Generate JWT access token for user
    Fixed 30-day expiration
    Includes token version for invalidation on password/role changes
    """
    if not JWT_SECRET:
        raise ValueError("DEEPWIKI_AUTH_JWT_SECRET not configured")

    expire = datetime.utcnow() + timedelta(seconds=JWT_EXPIRES_SECONDS)

    payload = {
        'sub': user.username,
        'role': user.role,
        'ver': getattr(user, 'token_version', 1),  # Default to 1 for backward compatibility
        'exp': expire
    }

    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    logger.info(f"Created token for user: {user.username} (ver={payload['ver']}, expires in 30 days)")

    return token


def decode_access_token(token: str) -> TokenData:
    """
    Decode and validate JWT token
    Returns TokenData if valid
    Raises HTTPException on invalid/expired tokens
    Verifies token version matches current user version
    """
    if not JWT_SECRET:
        raise ValueError("DEEPWIKI_AUTH_JWT_SECRET not configured")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get('sub')
        role = payload.get('role')
        ver = payload.get('ver', 1)  # Default to 1 for backward compatibility
        exp = payload.get('exp')

        if not username or not role:
            logger.error("Token missing required fields")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token format"
            )

        token_data = TokenData(sub=username, role=role, ver=ver, exp=exp)

        # Verify token version matches current user version
        user_store = get_user_store()
        user = user_store.get_user(username)

        if user:
            current_version = getattr(user, 'token_version', 1)
            if current_version != ver:
                logger.warning(
                    f"Token version mismatch for {username}: "
                    f"token={ver}, current={current_version}"
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token has been invalidated. Please login again."
                )

        return token_data

    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


def _create_virtual_admin() -> User:
    """Helper to create virtual admin user when auth is disabled"""
    return User(
        id='system',
        username='system',
        password_hash='',
        role='admin',
        token_version=1,
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat(),
        disabled=False
    )


async def get_current_user(
    request: Request,
    dw_token: Optional[str] = Cookie(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> User:
    """
    FastAPI dependency: Extract and validate JWT from:
    1. Cookie (dw_token) - preferred for browsers
    2. Authorization: Bearer header - fallback for CLI/debug

    Returns User if authenticated
    Raises 401 if not authenticated or invalid token
    """
    # If login not required, skip auth (return admin-like user)
    if not LOGIN_REQUIRED:
        return _create_virtual_admin()

    # Extract token from cookie or Authorization header
    token = None
    auth_source = None

    # Priority 1: Cookie (browser auth)
    if dw_token:
        token = dw_token
        auth_source = "cookie"
    # Priority 2: Authorization header (CLI/debug)
    elif credentials:
        token = credentials.credentials
        auth_source = "header"

    if not token:
        logger.debug("No authentication token found in cookie or header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"}
        )

    logger.debug(f"Authenticating via {auth_source}")

    # Decode and validate token (includes version check)
    token_data = decode_access_token(token)

    # Get user from store
    user_store = get_user_store()
    user = user_store.get_user(token_data.sub)

    if not user:
        logger.error(f"User not found in store: {token_data.sub}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if user.disabled:
        logger.warning(f"Disabled user attempted access: {user.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )

    logger.debug(f"User authenticated: {user.username} (role={user.role})")
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency: Require admin role
    Returns User if admin
    Raises 403 if not admin
    """
    if user.role != 'admin':
        logger.warning(f"User {user.username} attempted admin action (role: {user.role})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    return user


async def require_auth(user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency: Require valid authentication (any role)
    Returns User if authenticated
    Raises 401 if not authenticated
    """
    return user


async def optional_auth(
    request: Request,
    dw_token: Optional[str] = Cookie(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[User]:
    """
    FastAPI dependency: Optional authentication
    Returns User if authenticated, None if not
    Raises on malformed token (don't hide errors)

    Reads from:
    1. Cookie (dw_token) - preferred
    2. Authorization header - fallback
    """
    # If login not required, return virtual admin user
    if not LOGIN_REQUIRED:
        return _create_virtual_admin()

    # Extract token from cookie or header
    token = None
    if dw_token:
        token = dw_token
    elif credentials:
        token = credentials.credentials

    if not token:
        return None

    try:
        token_data = decode_access_token(token)  # Raises on malformed/invalid

        # Get user from store
        user_store = get_user_store()
        user = user_store.get_user(token_data.sub)

        if not user or user.disabled:
            return None

        return user
    except HTTPException:
        # Token is malformed or expired - raise to surface the error
        raise
