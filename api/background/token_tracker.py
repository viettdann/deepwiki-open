"""
Token tracking service for job token statistics.
Provides methods to track chunking and provider tokens for jobs.
"""
import logging
from typing import Optional, Dict, Any

from api.core.database import get_db

logger = logging.getLogger(__name__)


class TokenTracker:
    """Service layer for token tracking operations."""

    @staticmethod
    async def initialize_job_tokens(job_id: str) -> bool:
        """
        Create initial token stats record for a job.

        Args:
            job_id: Job ID to initialize tokens for

        Returns:
            True if successful, False otherwise
        """
        try:
            db = await get_db()
            await db.execute(
                """INSERT OR IGNORE INTO job_token_stats (job_id)
                   VALUES (?)""",
                (job_id,)
            )
            logger.debug(f"Initialized token stats for job {job_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize tokens for job {job_id}: {e}")
            return False

    @staticmethod
    async def update_chunking_tokens(
        job_id: str,
        total_tokens: int,
        total_chunks: int
    ) -> bool:
        """
        Update chunking/embedding token statistics.

        Args:
            job_id: Job ID
            total_tokens: Total tokens in all chunks
            total_chunks: Total number of chunks

        Returns:
            True if successful, False otherwise
        """
        try:
            db = await get_db()
            await db.execute(
                """UPDATE job_token_stats
                   SET chunking_total_tokens = ?,
                       chunking_total_chunks = ?,
                       updated_at = datetime('now')
                   WHERE job_id = ?""",
                (total_tokens, total_chunks, job_id)
            )
            logger.debug(
                f"Updated chunking tokens for job {job_id}: "
                f"{total_chunks} chunks, {total_tokens} tokens"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update chunking tokens for job {job_id}: {e}")
            return False

    @staticmethod
    async def update_provider_tokens(
        job_id: str,
        prompt_tokens: int,
        completion_tokens: int
    ) -> bool:
        """
        Increment provider LLM token usage (atomic operation).

        Args:
            job_id: Job ID
            prompt_tokens: Prompt tokens used
            completion_tokens: Completion tokens used

        Returns:
            True if successful, False otherwise
        """
        try:
            db = await get_db()
            total_tokens = prompt_tokens + completion_tokens
            await db.execute(
                """UPDATE job_token_stats
                   SET provider_prompt_tokens = provider_prompt_tokens + ?,
                       provider_completion_tokens = provider_completion_tokens + ?,
                       provider_total_tokens = provider_total_tokens + ?,
                       updated_at = datetime('now')
                   WHERE job_id = ?""",
                (prompt_tokens, completion_tokens, total_tokens, job_id)
            )
            logger.debug(
                f"Updated provider tokens for job {job_id}: "
                f"+{prompt_tokens} prompt, +{completion_tokens} completion"
            )
            return True
        except Exception as e:
            logger.error(f"Failed to update provider tokens for job {job_id}: {e}")
            return False

    @staticmethod
    async def get_job_tokens(job_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch token summary for a job.

        Args:
            job_id: Job ID

        Returns:
            Dictionary with token stats, or None if not found
        """
        try:
            db = await get_db()
            result = await db.fetch_one(
                """SELECT
                       chunking_total_tokens,
                       chunking_total_chunks,
                       provider_prompt_tokens,
                       provider_completion_tokens,
                       provider_total_tokens,
                       created_at,
                       updated_at
                   FROM job_token_stats
                   WHERE job_id = ?""",
                (job_id,)
            )
            return result
        except Exception as e:
            logger.error(f"Failed to get tokens for job {job_id}: {e}")
            return None

    @staticmethod
    async def reset_job_tokens(job_id: str) -> bool:
        """
        Reset all token counters for a job (used in retry scenarios).

        Args:
            job_id: Job ID

        Returns:
            True if successful, False otherwise
        """
        try:
            db = await get_db()
            await db.execute(
                """UPDATE job_token_stats
                   SET chunking_total_tokens = 0,
                       chunking_total_chunks = 0,
                       provider_prompt_tokens = 0,
                       provider_completion_tokens = 0,
                       provider_total_tokens = 0,
                       updated_at = datetime('now')
                   WHERE job_id = ?""",
                (job_id,)
            )
            logger.info(f"Reset token stats for job {job_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to reset tokens for job {job_id}: {e}")
            return False
