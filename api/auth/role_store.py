import json
import os
from typing import Optional, List
from pathlib import Path
from pydantic import BaseModel


class RoleConfig(BaseModel):
    display_name: str
    allowed_models: Optional[List[str]] = None
    budget_monthly_usd: Optional[float] = None
    requests_per_minute: Optional[int] = None


class RoleStoreService:
    """Service for managing role configurations with hot-reload support."""

    def __init__(self, config_path: str):
        self.config_path = config_path
        self._config = None
        self._mtime = None
        self._load_config()

    def _load_config(self):
        """Load config from file."""
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Role config not found: {self.config_path}")

        with open(self.config_path, 'r') as f:
            data = json.load(f)

        self._config = {
            name: RoleConfig(**config)
            for name, config in data.get("roles", {}).items()
        }
        self._mtime = os.path.getmtime(self.config_path)

    def _maybe_reload(self):
        """Check mtime and reload if changed."""
        if not os.path.exists(self.config_path):
            return

        current_mtime = os.path.getmtime(self.config_path)
        if current_mtime != self._mtime:
            self._load_config()

    def get_role(self, role_name: str) -> Optional[RoleConfig]:
        """Get role config by name."""
        self._maybe_reload()
        return self._config.get(role_name)

    def validate_role(self, role_name: str) -> bool:
        """Check if role exists."""
        self._maybe_reload()
        return role_name in self._config

    def get_allowed_models(self, role_name: str) -> Optional[List[str]]:
        """Get allowed models for role."""
        role = self.get_role(role_name)
        return role.allowed_models if role else None

    def get_budget(self, role_name: str) -> Optional[float]:
        """Get monthly budget for role."""
        role = self.get_role(role_name)
        return role.budget_monthly_usd if role else None

    def get_requests_per_minute(self, role_name: str) -> Optional[int]:
        """Get requests per minute limit for role."""
        role = self.get_role(role_name)
        return role.requests_per_minute if role else None


# Singleton instance
_role_store_instance: Optional[RoleStoreService] = None


def get_role_store() -> RoleStoreService:
    """Get or create role store singleton."""
    global _role_store_instance
    if _role_store_instance is None:
        config_path = os.getenv(
            "DEEPWIKI_AUTH_ROLES_PATH",
            "api/config/roles.json"
        )
        _role_store_instance = RoleStoreService(config_path)
    return _role_store_instance
