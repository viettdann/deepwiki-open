"""
Backfill token data for existing jobs.

This script migrates existing jobs to the new token tracking system by:
1. Creating token stats records for all jobs
2. Populating provider tokens from existing total_tokens_used field
3. Setting chunking tokens to 0 (unknown for historical jobs)

Usage:
    python -m api.background.migrate_tokens
"""
import asyncio
import logging
from api.core.database import get_db
from api.background.token_tracker import TokenTracker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def migrate_existing_jobs():
    """One-time migration for existing jobs."""
    logger.info("Starting token migration for existing jobs...")

    db = await get_db()

    # Get all jobs
    jobs = await db.fetch_all("SELECT id, total_tokens_used FROM jobs")

    if not jobs:
        logger.info("No jobs found to migrate")
        return

    logger.info(f"Found {len(jobs)} jobs to migrate")

    success_count = 0
    error_count = 0

    for job in jobs:
        job_id = job['id']
        total_tokens = job.get('total_tokens_used', 0)

        try:
            # Initialize token stats for this job
            await TokenTracker.initialize_job_tokens(job_id)

            # Set provider tokens from existing total
            # Chunking/embedding unknown for historical jobs, so leave as 0
            if total_tokens > 0:
                await db.execute(
                    """UPDATE job_token_stats
                       SET provider_total_tokens = ?,
                           provider_completion_tokens = ?,
                           updated_at = datetime('now')
                       WHERE job_id = ?""",
                    (total_tokens, total_tokens, job_id)
                )
                logger.debug(f"Migrated job {job_id}: {total_tokens} tokens")
            else:
                logger.debug(f"Migrated job {job_id}: no token data")

            success_count += 1

        except Exception as e:
            logger.error(f"Failed to migrate job {job_id}: {e}")
            error_count += 1

    logger.info(
        f"Migration completed: {success_count} successful, {error_count} errors"
    )


if __name__ == "__main__":
    asyncio.run(migrate_existing_jobs())
