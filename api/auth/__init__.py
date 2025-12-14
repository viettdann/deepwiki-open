"""
Authentication Module for DeepWiki

Provides JWT-based user authentication with role-based access control.
"""
from api.auth.user_store import User, UserStoreService, get_user_store
from api.auth.role_store import RoleStoreService, RoleConfig, get_role_store
from api.auth.model_pricing import ModelPricingService, PriceInfo, get_model_pricing
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
    JWT_EXPIRES_SECONDS,
    get_user_allowed_models,
    get_user_budget_limit,
    get_user_requests_per_minute,
    is_model_allowed,
    check_user_budget,
    log_user_usage
)

__all__ = [
    # User store
    'User',
    'UserStoreService',
    'get_user_store',
    # Role store
    'RoleStoreService',
    'RoleConfig',
    'get_role_store',
    # Model pricing
    'ModelPricingService',
    'PriceInfo',
    'get_model_pricing',
    # Dependencies and JWT
    'create_access_token',
    'decode_access_token',
    'get_current_user',
    'require_admin',
    'require_auth',
    'optional_auth',
    'UserInfo',
    'TokenData',
    'LOGIN_REQUIRED',
    'JWT_EXPIRES_SECONDS',
    # Helper functions
    'get_user_allowed_models',
    'get_user_budget_limit',
    'get_user_requests_per_minute',
    'is_model_allowed',
    'check_user_budget',
    'log_user_usage'
]
