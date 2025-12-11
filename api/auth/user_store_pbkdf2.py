"""
User Store Service with PBKDF2-HMAC password hashing

PBKDF2 is built into Python's standard library - no external dependencies!
Part of NIST recommendations, widely used and trusted.
"""
import os
import json
import logging
import hashlib
import secrets
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)

# PBKDF2 parameters (NIST recommendations)
PBKDF2_ITERATIONS = 600000  # OWASP 2023 recommendation
HASH_ALGORITHM = 'sha256'
SALT_LENGTH = 32  # bytes


def hash_password(password: str) -> str:
    """
    Hash password using PBKDF2-HMAC-SHA256
    Returns hash in format: algorithm$iterations$salt$hash
    """
    salt = secrets.token_bytes(SALT_LENGTH)
    pwd_hash = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM,
        password.encode('utf-8'),
        salt,
        PBKDF2_ITERATIONS
    )

    # Encode as base64-like string (hex for simplicity)
    salt_hex = salt.hex()
    hash_hex = pwd_hash.hex()

    return f"pbkdf2_{HASH_ALGORITHM}${PBKDF2_ITERATIONS}${salt_hex}${hash_hex}"


def verify_password(password_hash: str, password: str) -> bool:
    """
    Verify password against PBKDF2 hash
    """
    try:
        # Parse hash format: algorithm$iterations$salt$hash
        parts = password_hash.split('$')
        if len(parts) != 4:
            raise ValueError("Invalid hash format")

        algorithm_part = parts[0]
        iterations = int(parts[1])
        salt_hex = parts[2]
        stored_hash_hex = parts[3]

        # Extract algorithm name (pbkdf2_sha256 -> sha256)
        algorithm = algorithm_part.split('_')[1] if '_' in algorithm_part else HASH_ALGORITHM

        # Verify password
        salt = bytes.fromhex(salt_hex)
        pwd_hash = hashlib.pbkdf2_hmac(
            algorithm,
            password.encode('utf-8'),
            salt,
            iterations
        )

        return pwd_hash.hex() == stored_hash_hex

    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


class User(BaseModel):
    """User model matching JSON schema"""
    id: str
    username: str
    password_hash: str
    role: str  # 'admin' or 'readonly'
    created_at: str
    updated_at: str
    disabled: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)

    @validator('role')
    def validate_role(cls, v):
        if v not in ['admin', 'readonly']:
            raise ValueError('role must be "admin" or "readonly"')
        return v


class UserStore(BaseModel):
    """User store model matching JSON schema"""
    rev: int
    users: list[User]


class UserStoreService:
    """
    Service for managing user data from JSON file

    Features:
    - Per-worker global with mtime check on every get_user() call
    - Hot reload when file changes (concurrency-safe reads)
    - PBKDF2 password verification (no external dependencies)
    """

    def __init__(self, store_path: str):
        self.store_path = Path(store_path)
        self._store: Optional[UserStore] = None
        self._last_mtime: Optional[float] = None
        self._users_by_username: Dict[str, User] = {}

        # Initial load
        self._reload_if_needed()

    def _reload_if_needed(self) -> None:
        """
        Check file mtime and reload if changed
        Thread-safe for concurrent reads
        """
        try:
            if not self.store_path.exists():
                logger.warning(f"User store file not found: {self.store_path}")
                self._store = None
                self._users_by_username = {}
                return

            current_mtime = self.store_path.stat().st_mtime

            # Reload if first load or file changed
            if self._last_mtime is None or current_mtime != self._last_mtime:
                logger.info(f"Loading user store from {self.store_path}")

                with open(self.store_path, 'r') as f:
                    data = json.load(f)

                # Validate with Pydantic
                self._store = UserStore(**data)

                # Build username index
                self._users_by_username = {
                    user.username: user
                    for user in self._store.users
                }

                self._last_mtime = current_mtime
                logger.info(f"Loaded {len(self._store.users)} users (rev {self._store.rev})")

        except Exception as e:
            logger.error(f"Error loading user store: {e}")
            raise

    def get_user(self, username: str) -> Optional[User]:
        """
        Get user by username
        Checks for file changes on every call
        """
        self._reload_if_needed()

        if not self._users_by_username:
            return None

        return self._users_by_username.get(username)

    def verify_password(self, user: User, password: str) -> bool:
        """
        Verify password against PBKDF2 hash
        """
        return verify_password(user.password_hash, password)

    def authenticate(self, username: str, password: str) -> Optional[User]:
        """
        Authenticate user by username and password
        Returns User if valid, None otherwise
        """
        user = self.get_user(username)

        if not user:
            logger.warning(f"User not found: {username}")
            return None

        if user.disabled:
            logger.warning(f"User disabled: {username}")
            return None

        if not self.verify_password(user, password):
            logger.warning(f"Invalid password for user: {username}")
            return None

        logger.info(f"User authenticated: {username} (role: {user.role})")
        return user


# Global user store instance (per-worker)
_user_store: Optional[UserStoreService] = None


def get_user_store() -> UserStoreService:
    """
    Get global user store instance
    Initializes on first call per worker
    """
    global _user_store

    if _user_store is None:
        store_path = os.environ.get(
            'DEEPWIKI_AUTH_STORE_PATH',
            'api/config/users.json'
        )
        _user_store = UserStoreService(store_path)

    return _user_store
