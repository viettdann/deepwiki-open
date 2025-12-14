import time
from typing import Optional

from api.core.database import get_db


class RateLimiter:
    """Simple per-user sliding window rate limiter backed by SQLite."""

    WINDOW_MS = 60 * 1000  # 1 minute window

    @staticmethod
    async def check_rate_limit(user_id: str, limit: Optional[int]) -> bool:
        """Return True if the request is allowed, False if rate limited.

        Args:
            user_id: Identifier for the requesting user.
            limit: Allowed requests per minute. None or <=0 means unlimited.
        """
        # Unlimited or no limit configured
        if limit is None or limit <= 0:
            return True

        now_ms = int(time.time() * 1000)
        window_start = now_ms - RateLimiter.WINDOW_MS
        db = await get_db()

        # Drop timestamps outside the window for this user
        await db.execute(
            """
            DELETE FROM rate_limit_tracker
            WHERE user_id = ? AND request_timestamp < ?
            """,
            (user_id, window_start)
        )

        # Count requests in the current window
        count_row = await db.fetch_one(
            """
            SELECT COUNT(*) AS count
            FROM rate_limit_tracker
            WHERE user_id = ?
            """,
            (user_id,)
        )
        current_count = count_row["count"] if count_row else 0

        if current_count >= limit:
            return False

        # Record the new request; handle rare primary key collision by nudging the timestamp
        try:
            await db.execute_insert(
                """
                INSERT INTO rate_limit_tracker (user_id, request_timestamp)
                VALUES (?, ?)
                """,
                (user_id, now_ms)
            )
        except Exception:
            await db.execute_insert(
                """
                INSERT OR IGNORE INTO rate_limit_tracker (user_id, request_timestamp)
                VALUES (?, ?)
                """,
                (user_id, now_ms + 1)
            )

        return True
