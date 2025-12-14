from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from api.core.database import get_db


class BudgetCheckResult(BaseModel):
    allowed: bool
    used: float
    limit: float
    remaining: float


class MonthlyUsage(BaseModel):
    budget_usd: Optional[float]
    used_usd: float
    request_count: int
    remaining: float


class BudgetTracker:
    """Tracks user budget usage across models."""

    @staticmethod
    def get_month_year() -> str:
        """Get current month-year string in format YYYY-MM."""
        return datetime.now().strftime("%Y-%m")

    @staticmethod
    async def check_budget(
        user_id: str,
        estimated_cost: float,
        budget_limit: Optional[float]
    ) -> BudgetCheckResult:
        """Check if user has budget available.

        Args:
            user_id: User identifier
            estimated_cost: Estimated cost of next request in USD
            budget_limit: Monthly budget limit in USD (None = unlimited)

        Returns:
            BudgetCheckResult with allowed flag and usage info
        """
        if budget_limit is None or budget_limit <= 0:
            # Unlimited budget (None or negative values like -1)
            return BudgetCheckResult(
                allowed=True,
                used=0.0,
                limit=-1.0,  # Use -1 to indicate unlimited
                remaining=-1.0
            )

        db = await get_db()
        month_year = BudgetTracker.get_month_year()

        # Get current usage
        usage = await db.fetch_one(
            """
            SELECT used_usd FROM user_monthly_budget
            WHERE user_id = ? AND month_year = ?
            """,
            (user_id, month_year)
        )

        current_used = usage["used_usd"] if usage else 0.0
        new_total = current_used + estimated_cost

        return BudgetCheckResult(
            allowed=new_total <= budget_limit,
            used=current_used,
            limit=budget_limit,
            remaining=max(0.0, budget_limit - current_used)
        )

    @staticmethod
    async def log_usage(
        user_id: str,
        model: str,
        provider: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        budget_limit: Optional[float] = None
    ) -> None:
        """Log usage after a request completes.

        Args:
            user_id: User identifier
            model: Model name
            provider: Provider name
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens
            cost_usd: Actual cost in USD
        """
        db = await get_db()
        month_year = BudgetTracker.get_month_year()

        # Insert usage log
        await db.execute_insert(
            """
            INSERT INTO chat_usage_logs (user_id, model, provider, input_tokens, output_tokens, cost_usd)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, model, provider, input_tokens, output_tokens, cost_usd)
        )

        # Update or insert monthly budget entry
        existing = await db.fetch_one(
            """
            SELECT * FROM user_monthly_budget
            WHERE user_id = ? AND month_year = ?
            """,
            (user_id, month_year)
        )

        if existing:
            # If we now know the budget limit and it was previously unset/zero, update it
            if budget_limit is not None and budget_limit > 0 and (existing.get("budget_usd") or 0) <= 0:
                await db.execute(
                    """
                    UPDATE user_monthly_budget
                    SET budget_usd = ?
                    WHERE user_id = ? AND month_year = ?
                    """,
                    (budget_limit, user_id, month_year)
                )

            await db.execute(
                """
                UPDATE user_monthly_budget
                SET used_usd = used_usd + ?,
                    request_count = request_count + 1
                WHERE user_id = ? AND month_year = ?
                """,
                (cost_usd, user_id, month_year)
            )
        else:
            # Persist the current known limit (0 or None implies unlimited)
            stored_budget = budget_limit if budget_limit is not None else 0
            await db.execute_insert(
                """
                INSERT INTO user_monthly_budget (user_id, month_year, budget_usd, used_usd, request_count)
                VALUES (?, ?, ?, ?, 1)
                """,
                (user_id, month_year, stored_budget, cost_usd)
            )

    @staticmethod
    async def get_monthly_usage(user_id: str) -> MonthlyUsage:
        """Get current month's usage stats.

        Args:
            user_id: User identifier

        Returns:
            MonthlyUsage with budget and usage info
        """
        db = await get_db()
        month_year = BudgetTracker.get_month_year()

        usage = await db.fetch_one(
            """
            SELECT budget_usd, used_usd, request_count FROM user_monthly_budget
            WHERE user_id = ? AND month_year = ?
            """,
            (user_id, month_year)
        )

        if not usage:
            return MonthlyUsage(
                budget_usd=None,
                used_usd=0.0,
                request_count=0,
                remaining=0.0
            )

        remaining = 0.0
        if usage["budget_usd"] is not None and usage["budget_usd"] > 0:
            remaining = max(0.0, usage["budget_usd"] - usage["used_usd"])

        return MonthlyUsage(
            budget_usd=usage["budget_usd"],
            used_usd=usage["used_usd"],
            request_count=usage["request_count"],
            remaining=remaining
        )

    @staticmethod
    async def reset_monthly_budget(user_id: str) -> None:
        """Manual override to reset monthly budget (admin only).

        Args:
            user_id: User identifier
        """
        db = await get_db()
        month_year = BudgetTracker.get_month_year()

        await db.execute(
            """
            DELETE FROM user_monthly_budget
            WHERE user_id = ? AND month_year = ?
            """,
            (user_id, month_year)
        )
