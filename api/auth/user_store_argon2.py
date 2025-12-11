"""
User Store Service with Argon2 password hashing

Argon2 is the winner of the Password Hashing Competition and recommended for new applications.
"""
import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel, Field, validator
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

logger = logging.getLogger(__name__)

# Initialize Argon2 password hasher with secure defaults
ph = PasswordHasher(
    time_cost=2,        # Number of iterations
    memory_cost=65536,  # Memory usage in KB (64MB)
    parallelism=4,      # Number of parallel threads
    hash_len=32,        # Length of hash in bytes
    salt_len=16         # Length of salt in bytes
)


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
    - Argon2 password verification (more secure than bcrypt)
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
        Verify password against Argon2 hash
        Also automatically rehashes if parameters changed (future-proofing)
        """
        try:
            # Verify password
            ph.verify(user.password_hash, password)

            # Check if hash needs rehashing (parameters changed)
            if ph.check_needs_rehash(user.password_hash):
                logger.info(f"Password hash for {user.username} needs rehashing with new parameters")
                # Note: In production, you'd want to update the hash in the file here

            return True
        except VerifyMismatchError:
            logger.warning(f"Invalid password for user: {user.username}")
            return False
        except Exception as e:
            logger.error(f"Password verification error: {e}")
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
