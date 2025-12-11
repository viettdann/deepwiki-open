"""
User Store Service for JSON-backed authentication

Handles loading, validation, and querying of user data from JSON file.
Implements per-worker mtime-based hot reloading for multi-worker safety.
Uses PBKDF2 from Python's standard library (no external dependencies).
"""
import os
import json
import logging
import hashlib
import hmac
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)


class User(BaseModel):
    """User model matching JSON schema"""
    id: str
    username: str
    password_hash: str
    role: str  # 'admin' or 'readonly'
    token_version: int = 1  # Version for token invalidation (default 1)
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
    - bcrypt password verification
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

        Format: pbkdf2:sha256:iterations$salt$hash
        Example: pbkdf2:sha256:600000$salt_here$hash_here
        """
        try:
            # Support both PBKDF2 and legacy bcrypt format
            if user.password_hash.startswith('pbkdf2:'):
                return self._verify_pbkdf2(password, user.password_hash)
            elif user.password_hash.startswith('$2b$'):
                # Legacy bcrypt format (for backward compatibility)
                logger.warning("Using legacy bcrypt hash - please migrate to PBKDF2")
                try:
                    import bcrypt
                    return bcrypt.checkpw(
                        password.encode('utf-8'),
                        user.password_hash.encode('utf-8')
                    )
                except ImportError:
                    logger.error("bcrypt not installed, cannot verify legacy hash")
                    return False
            else:
                logger.error(f"Unknown password hash format: {user.password_hash[:10]}...")
                return False
        except Exception as e:
            logger.error(f"Password verification error: {e}")
            return False

    def _verify_pbkdf2(self, password: str, password_hash: str) -> bool:
        """
        Verify password against PBKDF2 hash

        Format: pbkdf2:sha256:iterations$salt$hash
        """
        try:
            parts = password_hash.split(':')
            if len(parts) != 3 or parts[0] != 'pbkdf2':
                return False

            algorithm = parts[1]
            if algorithm != 'sha256':
                logger.error(f"Unsupported PBKDF2 algorithm: {algorithm}")
                return False

            hash_parts = parts[2].split('$')
            if len(hash_parts) != 3:
                return False

            iterations = int(hash_parts[0])
            salt = hash_parts[1]
            stored_hash = hash_parts[2]

            # Compute hash for provided password
            computed_hash = hashlib.pbkdf2_hmac(
                'sha256',
                password.encode('utf-8'),
                salt.encode('utf-8'),
                iterations
            ).hex()

            # Constant-time comparison
            return hmac.compare_digest(computed_hash, stored_hash)

        except Exception as e:
            logger.error(f"PBKDF2 verification error: {e}")
            return False

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
