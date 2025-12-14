"""Statistics service for aggregating usage data."""

from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import sqlite3
from pathlib import Path

from api.core.database import DB_PATH
from api.auth.user_store import get_user_store
from api.auth.role_store import get_role_store


class StatisticsService:
    """Service for gathering statistics from various data sources."""

    @staticmethod
    def _get_connection():
        """Get database connection."""
        return sqlite3.connect(DB_PATH)

    @staticmethod
    async def get_overview() -> Dict[str, Any]:
        """Get sitewide overview statistics."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()

        try:
            # Total completed repos
            cursor.execute(
                "SELECT COUNT(*) FROM jobs WHERE status = 'completed'"
            )
            total_repos = cursor.fetchone()[0]

            # Total unique users from chat logs
            cursor.execute(
                "SELECT COUNT(DISTINCT user_id) FROM chat_usage_logs WHERE user_id IS NOT NULL"
            )
            total_users = cursor.fetchone()[0] or 0

            # Total tokens from job stats
            cursor.execute("""
                SELECT
                    COALESCE(SUM(chunking_total_tokens), 0) as chunking_tokens,
                    COALESCE(SUM(provider_prompt_tokens), 0) as prompt_tokens,
                    COALESCE(SUM(provider_completion_tokens), 0) as completion_tokens,
                    COALESCE(SUM(chunking_total_chunks), 0) as total_chunks
                FROM job_token_stats
            """)
            job_stats = cursor.fetchone()

            # Total tokens from chat logs
            cursor.execute("""
                SELECT
                    COALESCE(SUM(input_tokens), 0) as chat_prompt,
                    COALESCE(SUM(output_tokens), 0) as chat_completion,
                    COALESCE(SUM(cost_usd), 0) as total_cost,
                    COUNT(*) as total_requests
                FROM chat_usage_logs
            """)
            chat_stats = cursor.fetchone()

            # Requests today
            cursor.execute("""
                SELECT COUNT(*)
                FROM chat_usage_logs
                WHERE DATE(created_at) = DATE('now')
            """)
            requests_today = cursor.fetchone()[0]

            # Requests this week
            cursor.execute("""
                SELECT COUNT(*)
                FROM chat_usage_logs
                WHERE created_at >= DATE('now', '-7 days')
            """)
            requests_week = cursor.fetchone()[0]

            # Requests this month
            cursor.execute("""
                SELECT COUNT(*)
                FROM chat_usage_logs
                WHERE created_at >= DATE('now', 'start of month')
            """)
            requests_month = cursor.fetchone()[0]

            return {
                "total_repos": total_repos,
                "total_users": total_users,
                "total_embedding_chunks": job_stats[3],
                "total_embedding_tokens": job_stats[0],
                "total_prompt_tokens": job_stats[1] + chat_stats[0],
                "total_completion_tokens": job_stats[2] + chat_stats[1],
                "total_tokens": job_stats[0] + job_stats[1] + job_stats[2] + chat_stats[0] + chat_stats[1],
                "total_cost": chat_stats[2],
                "total_requests": chat_stats[3],
                "requests_today": requests_today,
                "requests_week": requests_week,
                "requests_month": requests_month,
            }
        finally:
            conn.close()

    @staticmethod
    async def get_token_breakdown(period: str = "all") -> Dict[str, Any]:
        """Get token breakdown by type."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()

        date_filter = StatisticsService._get_date_filter(period)

        try:
            # Job tokens
            query = f"""
                SELECT
                    COALESCE(SUM(chunking_total_tokens), 0) as embedding_tokens,
                    COALESCE(SUM(chunking_total_chunks), 0) as embedding_chunks,
                    COALESCE(SUM(provider_prompt_tokens), 0) as job_prompt,
                    COALESCE(SUM(provider_completion_tokens), 0) as job_completion
                FROM job_token_stats jts
                JOIN jobs j ON jts.job_id = j.job_id
                {f"WHERE j.created_at >= {date_filter}" if date_filter else ""}
            """
            cursor.execute(query)
            job_stats = cursor.fetchone()

            # Chat tokens
            query = f"""
                SELECT
                    COALESCE(SUM(input_tokens), 0) as chat_prompt,
                    COALESCE(SUM(output_tokens), 0) as chat_completion
                FROM chat_usage_logs
                {f"WHERE created_at >= {date_filter}" if date_filter else ""}
            """
            cursor.execute(query)
            chat_stats = cursor.fetchone()

            return {
                "embedding_chunks": job_stats[1],
                "embedding_tokens": job_stats[0],
                "prompt_tokens": job_stats[2] + chat_stats[0],
                "completion_tokens": job_stats[3] + chat_stats[1],
            }
        finally:
            conn.close()

    @staticmethod
    async def get_by_role() -> List[Dict[str, Any]]:
        """Get statistics grouped by role."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()
        user_store = get_user_store()
        role_store = get_role_store()

        try:
            # Get all chat usage with user info
            cursor.execute("""
                SELECT
                    user_id,
                    SUM(input_tokens + output_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost,
                    COUNT(*) as request_count
                FROM chat_usage_logs
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            """)
            user_stats = cursor.fetchall()

            # Build user -> role mapping from user store
            user_role_map = {}
            for user in user_store._store.users if user_store._store else []:
                user_role_map[user.id] = user.role

            # Aggregate by role
            role_aggregates = {}
            for user_id, tokens, cost, requests in user_stats:
                role = user_role_map.get(user_id)
                if not role:
                    continue

                if role not in role_aggregates:
                    role_config = role_store.get_role(role)
                    role_aggregates[role] = {
                        "role": role,
                        # RoleConfig is a Pydantic model, not a dict
                        "display_name": role_config.display_name if role_config and getattr(role_config, "display_name", None) else role.upper(),
                        "user_count": 0,
                        "total_tokens": 0,
                        "total_cost": 0.0,
                        "total_requests": 0,
                        "users": set(),
                    }

                role_aggregates[role]["users"].add(user_id)
                role_aggregates[role]["total_tokens"] += tokens or 0
                role_aggregates[role]["total_cost"] += cost or 0.0
                role_aggregates[role]["total_requests"] += requests or 0

            # Calculate user counts and averages
            result = []
            for role_data in role_aggregates.values():
                role_data["user_count"] = len(role_data["users"])
                role_data["avg_tokens_per_user"] = (
                    role_data["total_tokens"] / role_data["user_count"]
                    if role_data["user_count"] > 0 else 0
                )
                role_data["avg_cost_per_user"] = (
                    role_data["total_cost"] / role_data["user_count"]
                    if role_data["user_count"] > 0 else 0.0
                )
                del role_data["users"]  # Remove set (not JSON serializable)
                result.append(role_data)

            # Sort by total cost descending
            result.sort(key=lambda x: x["total_cost"], reverse=True)
            return result

        finally:
            conn.close()

    @staticmethod
    async def get_by_user(
        sort: str = "tokens",
        order: str = "desc",
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get statistics for individual users."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()
        user_store = get_user_store()
        role_store = get_role_store()

        try:
            # Get chat usage per user
            cursor.execute("""
                SELECT
                    user_id,
                    SUM(input_tokens + output_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost,
                    COUNT(*) as request_count,
                    MAX(created_at) as last_active
                FROM chat_usage_logs
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            """)
            user_stats = cursor.fetchall()

            # Get monthly budget info
            cursor.execute("""
                SELECT
                    user_id,
                    used_usd,
                    budget_usd
                FROM user_monthly_budget
                WHERE month_year = strftime('%Y-%m', 'now')
            """)
            budget_data = {row[0]: {"used": row[1], "budget": row[2]} for row in cursor.fetchall()}

            # Build user map from user store
            user_map = {}
            if user_store._store:
                for user in user_store._store.users:
                    user_map[user.id] = user

            # Build user list
            result = []
            for user_id, tokens, cost, requests, last_active in user_stats:
                user = user_map.get(user_id)
                if not user:
                    continue

                budget_info = budget_data.get(user_id, {"used": 0, "budget": None})
                budget_limit = user.budget_monthly_usd
                if budget_limit is None:
                    role_config = role_store.get_role(user.role)
                    if role_config:
                        budget_limit = role_config.get("budget_monthly_usd")

                result.append({
                    "user_id": user_id,
                    "username": user.username,
                    "role": user.role,
                    "access": user.access,
                    "total_tokens": tokens or 0,
                    "total_cost": cost or 0.0,
                    "request_count": requests or 0,
                    "budget_used": budget_info["used"] or 0.0,
                    "budget_limit": budget_limit,
                    "last_active": last_active,
                })

            # Sort
            sort_key_map = {
                "tokens": "total_tokens",
                "cost": "total_cost",
                "username": "username",
                "requests": "request_count",
            }
            sort_key = sort_key_map.get(sort, "total_tokens")
            reverse = (order == "desc")
            result.sort(key=lambda x: x[sort_key], reverse=reverse)

            return result[:limit]

        finally:
            conn.close()

    @staticmethod
    async def get_models() -> List[Dict[str, Any]]:
        """Get statistics by model."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("""
                SELECT
                    model,
                    provider,
                    COUNT(*) as request_count,
                    SUM(input_tokens + output_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost
                FROM chat_usage_logs
                WHERE model IS NOT NULL
                GROUP BY model, provider
                ORDER BY total_cost DESC
            """)

            return [
                {
                    "model": row[0],
                    "provider": row[1],
                    "request_count": row[2],
                    "total_tokens": row[3] or 0,
                    "total_cost": row[4] or 0.0,
                }
                for row in cursor.fetchall()
            ]

        finally:
            conn.close()

    @staticmethod
    async def get_trends(period: str = "day", days: int = 30) -> List[Dict[str, Any]]:
        """Get usage trends over time."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()

        try:
            # Determine date grouping
            if period == "day":
                date_format = "%Y-%m-%d"
            elif period == "week":
                date_format = "%Y-W%W"
            elif period == "month":
                date_format = "%Y-%m"
            else:
                date_format = "%Y-%m-%d"

            cursor.execute(f"""
                SELECT
                    strftime('{date_format}', created_at) as period,
                    SUM(input_tokens + output_tokens) as total_tokens,
                    SUM(cost_usd) as total_cost,
                    COUNT(*) as request_count
                FROM chat_usage_logs
                WHERE created_at >= DATE('now', '-{days} days')
                GROUP BY period
                ORDER BY period ASC
            """)

            return [
                {
                    "date": row[0],
                    "tokens": row[1] or 0,
                    "cost": row[2] or 0.0,
                    "requests": row[3] or 0,
                }
                for row in cursor.fetchall()
            ]

        finally:
            conn.close()

    @staticmethod
    async def get_top_repos(limit: int = 10) -> List[Dict[str, Any]]:
        """Get top repositories by token usage."""
        conn = StatisticsService._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(f"""
                SELECT
                    j.job_id,
                    j.repo_name,
                    jts.chunking_total_tokens + jts.provider_total_tokens as total_tokens,
                    jts.chunking_total_chunks,
                    j.created_at
                FROM job_token_stats jts
                JOIN jobs j ON jts.job_id = j.job_id
                WHERE j.status = 'completed'
                ORDER BY total_tokens DESC
                LIMIT {limit}
            """)

            return [
                {
                    "job_id": row[0],
                    "repo_name": row[1],
                    "total_tokens": row[2] or 0,
                    "chunks": row[3] or 0,
                    "created_at": row[4],
                }
                for row in cursor.fetchall()
            ]

        finally:
            conn.close()

    @staticmethod
    def _get_date_filter(period: str) -> Optional[str]:
        """Get SQL date filter for period."""
        if period == "day":
            return "DATE('now', '-1 day')"
        elif period == "week":
            return "DATE('now', '-7 days')"
        elif period == "month":
            return "DATE('now', '-30 days')"
        else:
            return None
