"""Statistics API routes."""

from fastapi import APIRouter, Depends
from typing import List, Dict, Any

from api.auth.dependencies import require_auth
from api.auth.user_store import User
from api.services.statistics_service import StatisticsService

router = APIRouter(prefix="/api/statistics", tags=["statistics"])


@router.get("/overview", response_model=Dict[str, Any])
async def get_overview(current_user: User = Depends(require_auth)):
    """Get sitewide overview statistics."""
    return await StatisticsService.get_overview()


@router.get("/tokens", response_model=Dict[str, Any])
async def get_token_breakdown(
    period: str = "all",
    current_user: User = Depends(require_auth)
):
    """Get token breakdown by type."""
    return await StatisticsService.get_token_breakdown(period)


@router.get("/by-role", response_model=List[Dict[str, Any]])
async def get_by_role(current_user: User = Depends(require_auth)):
    """Get statistics grouped by role."""
    return await StatisticsService.get_by_role()


@router.get("/by-user", response_model=List[Dict[str, Any]])
async def get_by_user(
    sort: str = "tokens",
    order: str = "desc",
    limit: int = 50,
    current_user: User = Depends(require_auth)
):
    """Get statistics for individual users."""
    return await StatisticsService.get_by_user(sort=sort, order=order, limit=limit)


@router.get("/models", response_model=List[Dict[str, Any]])
async def get_models(current_user: User = Depends(require_auth)):
    """Get statistics by model."""
    return await StatisticsService.get_models()


@router.get("/trends", response_model=List[Dict[str, Any]])
async def get_trends(
    period: str = "day",
    days: int = 30,
    current_user: User = Depends(require_auth)
):
    """Get usage trends over time."""
    return await StatisticsService.get_trends(period=period, days=days)


@router.get("/top-repos", response_model=List[Dict[str, Any]])
async def get_top_repos(
    limit: int = 10,
    current_user: User = Depends(require_auth)
):
    """Get top repositories by token usage."""
    return await StatisticsService.get_top_repos(limit=limit)
