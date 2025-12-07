"""
API Key Authentication Middleware for DeepWiki

Validates X-API-Key header (REST) or api_key query param (WebSocket)
"""
import os
import logging
from typing import Set
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# Load configuration from environment
raw_api_key_auth = os.environ.get('DEEPWIKI_API_KEY_AUTH_ENABLED', 'False')
API_KEY_AUTH_ENABLED = raw_api_key_auth.lower() in ['true', '1', 't']

API_KEYS_RAW = os.environ.get('DEEPWIKI_BACKEND_API_KEYS', '')
VALID_API_KEYS: Set[str] = set(k.strip() for k in API_KEYS_RAW.split(',') if k.strip())

# Paths exempt from authentication
EXEMPT_PATHS = {
    '/',
    '/health',
    '/auth/status',
}


class APIKeyMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate API keys for incoming requests
    
    - Checks X-API-Key header for REST endpoints
    - Allows api_key query param for WebSocket (handled separately)
    - Skips authentication if disabled
    - Exempts certain paths from authentication
    """
    
    async def dispatch(self, request: Request, call_next):
        # Skip if auth disabled
        if not API_KEY_AUTH_ENABLED:
            return await call_next(request)
        
        # Skip exempt paths
        if request.url.path in EXEMPT_PATHS:
            return await call_next(request)
        
        # Skip OPTIONS requests (CORS preflight)
        if request.method == "OPTIONS":
            return await call_next(request)
        
        # Skip WebSocket endpoints (auth handled in endpoint)
        if request.url.path.startswith('/ws/'):
            return await call_next(request)
        
        # Extract API key from header or query param
        api_key = request.headers.get('X-API-Key') or request.query_params.get('api_key')
        
        # Check if API key is missing
        if not api_key:
            logger.warning(f"Missing API key for {request.method} {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Missing API key",
                    "error": "API key required in X-API-Key header or api_key query parameter"
                }
            )
        
        # Validate API key
        if api_key not in VALID_API_KEYS:
            logger.warning(f"Invalid API key attempted for {request.method} {request.url.path}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "detail": "Invalid API key",
                    "error": "The provided API key is not valid"
                }
            )
        
        # API key is valid, proceed with request
        return await call_next(request)


def log_auth_config():
    """Log authentication configuration at startup"""
    if API_KEY_AUTH_ENABLED:
        key_count = len(VALID_API_KEYS)
        if key_count == 0:
            logger.warning(
                "⚠️  API key authentication ENABLED but NO KEYS configured! "
                "Set DEEPWIKI_BACKEND_API_KEYS environment variable."
            )
        else:
            logger.info(
                f"🔒 API key authentication ENABLED with {key_count} valid key(s)"
            )
            logger.info(f"   Exempt paths: {', '.join(EXEMPT_PATHS)}")
    else:
        logger.info("🔓 API key authentication DISABLED")
