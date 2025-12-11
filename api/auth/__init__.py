"""
Authentication Module for DeepWiki

Provides JWT-based user authentication with role-based access control.
"""
from api.auth.user_store import User, UserStoreService, get_user_store
from api.auth.dependencies import (
    create_access_token,
    decode_access_token,
    get_current_user,
    require_admin,
    require_auth,
    optional_auth,
    UserInfo,
    TokenData,
    LOGIN_REQUIRED,
    JWT_EXPIRES_SECONDS
)

__all__ = [
    'User',
    'UserStoreService',
    'get_user_store',
    'create_access_token',
    'decode_access_token',
    'get_current_user',
    'require_admin',
    'require_auth',
    'optional_auth',
    'UserInfo',
    'TokenData',
    'LOGIN_REQUIRED',
    'JWT_EXPIRES_SECONDS'
]
