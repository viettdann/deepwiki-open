"""
Job CRUD operations and state management.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any

from api.core.database import get_db
from api.background.models import (
    JobStatus, PageStatus, CreateJobRequest,
    JobResponse, JobPageResponse, JobDetailResponse
)

logger = logging.getLogger(__name__)


class JobManager:
    """Manages job lifecycle and persistence."""

    @staticmethod
    async def create_job(request: CreateJobRequest) -> str:
        """Create a new job and return its ID."""
        db = await get_db()
        job_id = str(uuid.uuid4())

        # Check for existing active job with same parameters
        existing = await db.fetch_one(
            """SELECT id, status FROM jobs
               WHERE owner = ? AND repo = ? AND language = ?
               AND provider = ? AND (model = ? OR (model IS NULL AND ? IS NULL))
               AND status NOT IN (?, ?, ?)""",
            (request.owner, request.repo, request.language,
             request.provider, request.model, request.model,
             JobStatus.COMPLETED.value, JobStatus.FAILED.value, JobStatus.CANCELLED.value)
        )

        if existing:
            # Return existing active job_id
            logger.info(f"Returning existing job {existing['id']} for {request.owner}/{request.repo}")
            return existing['id']

        async with db.connection() as conn:
            await conn.execute(
                """INSERT INTO jobs (
                    id, repo_url, repo_type, owner, repo, access_token,
                    provider, model, language, is_comprehensive,
                    excluded_dirs, excluded_files, included_dirs, included_files,
                    status, current_phase, progress_percent, client_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    job_id, request.repo_url, request.repo_type, request.owner, request.repo,
                    request.access_token, request.provider, request.model, request.language,
                    1 if request.is_comprehensive else 0,
                    json.dumps(request.excluded_dirs) if request.excluded_dirs else None,
                    json.dumps(request.excluded_files) if request.excluded_files else None,
                    json.dumps(request.included_dirs) if request.included_dirs else None,
                    json.dumps(request.included_files) if request.included_files else None,
                    JobStatus.PENDING.value, 0, 0.0, request.client_id
                )
            )
            await conn.commit()

        logger.info(f"Created job {job_id} for {request.owner}/{request.repo}")
        return job_id

    @staticmethod
    async def get_job(job_id: str) -> Optional[JobResponse]:
        """Get job by ID."""
        db = await get_db()
        row = await db.fetch_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if row:
            return JobManager._row_to_job_response(row)
        return None

    @staticmethod
    async def get_job_raw(job_id: str) -> Optional[Dict[str, Any]]:
        """Get raw job data by ID."""
        db = await get_db()
        return await db.fetch_one("SELECT * FROM jobs WHERE id = ?", (job_id,))

    @staticmethod
    async def get_job_detail(job_id: str) -> Optional[JobDetailResponse]:
        """Get job with all pages."""
        db = await get_db()

        job_row = await db.fetch_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if not job_row:
            return None

        page_rows = await db.fetch_all(
            "SELECT * FROM job_pages WHERE job_id = ? ORDER BY created_at",
            (job_id,)
        )

        job = JobManager._row_to_job_response(job_row)
        pages = [JobManager._row_to_page_response(row) for row in page_rows]

        wiki_structure = None
        if job_row['wiki_structure']:
            try:
                wiki_structure = json.loads(job_row['wiki_structure'])
            except json.JSONDecodeError:
                pass

        return JobDetailResponse(job=job, pages=pages, wiki_structure=wiki_structure)

    @staticmethod
    async def update_job_status(
        job_id: str,
        status: JobStatus,
        phase: Optional[int] = None,
        progress: Optional[float] = None,
        error: Optional[str] = None
    ):
        """Update job status and progress."""
        db = await get_db()

        updates = ["status = ?", "updated_at = datetime('now')"]
        params: List[Any] = [status.value]

        if phase is not None:
            updates.append("current_phase = ?")
            params.append(phase)

        if progress is not None:
            updates.append("progress_percent = ?")
            params.append(progress)

        if error is not None:
            updates.append("error_message = ?")
            params.append(error)

        if status == JobStatus.PREPARING_EMBEDDINGS:
            updates.append("started_at = datetime('now')")
        elif status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
            updates.append("completed_at = datetime('now')")

        params.append(job_id)

        await db.execute(
            f"UPDATE jobs SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )

    @staticmethod
    async def set_wiki_structure(job_id: str, structure: Dict[str, Any], pages: List[Dict[str, Any]]):
        """Set wiki structure and create page records."""
        db = await get_db()

        async with db.connection() as conn:
            # Update job with structure
            await conn.execute(
                """UPDATE jobs SET
                   wiki_structure = ?, total_pages = ?, updated_at = datetime('now')
                   WHERE id = ?""",
                (json.dumps(structure), len(pages), job_id)
            )

            # Create page records
            for page in pages:
                page_uuid = str(uuid.uuid4())
                await conn.execute(
                    """INSERT INTO job_pages (
                        id, job_id, page_id, title, description, importance,
                        file_paths, related_pages, parent_section, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        page_uuid, job_id, page['id'], page['title'],
                        page.get('description'), page.get('importance', 'medium'),
                        json.dumps(page.get('file_paths', [])),
                        json.dumps(page.get('related_pages', [])),
                        page.get('parent_section'),
                        PageStatus.PENDING.value
                    )
                )

            await conn.commit()

        logger.info(f"Set wiki structure for job {job_id} with {len(pages)} pages")

    @staticmethod
    async def get_next_pending_page(job_id: str) -> Optional[Dict[str, Any]]:
        """Get next pending page for generation."""
        db = await get_db()
        return await db.fetch_one(
            """SELECT * FROM job_pages
               WHERE job_id = ? AND status = ?
               ORDER BY created_at LIMIT 1""",
            (job_id, PageStatus.PENDING.value)
        )

    @staticmethod
    async def get_failed_pages(job_id: str) -> List[Dict[str, Any]]:
        """Get all failed pages for a job."""
        db = await get_db()
        return await db.fetch_all(
            """SELECT * FROM job_pages
               WHERE job_id = ? AND status = ?
               ORDER BY created_at""",
            (job_id, PageStatus.FAILED.value)
        )

    @staticmethod
    async def update_page_status(
        page_id: str,
        status: PageStatus,
        content: Optional[str] = None,
        tokens: Optional[int] = None,
        time_ms: Optional[int] = None,
        error: Optional[str] = None
    ):
        """Update page generation status."""
        db = await get_db()

        updates = ["status = ?"]
        params: List[Any] = [status.value]

        if content is not None:
            updates.append("content = ?")
            params.append(content)

        if tokens is not None:
            updates.append("tokens_used = ?")
            params.append(tokens)

        if time_ms is not None:
            updates.append("generation_time_ms = ?")
            params.append(time_ms)

        if error is not None:
            updates.append("last_error = ?")
            params.append(error)
            updates.append("retry_count = retry_count + 1")

        if status == PageStatus.IN_PROGRESS:
            updates.append("started_at = datetime('now')")
        elif status in [PageStatus.COMPLETED, PageStatus.FAILED, PageStatus.PERMANENT_FAILED]:
            updates.append("completed_at = datetime('now')")

        params.append(page_id)

        await db.execute(
            f"UPDATE job_pages SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )

    @staticmethod
    async def increment_job_page_count(
        job_id: str,
        completed: bool = False,
        failed: bool = False,
        tokens: int = 0
    ):
        """Increment job page counters atomically."""
        db = await get_db()

        updates = ["updated_at = datetime('now')"]
        params: List[Any] = []

        if completed:
            updates.append("completed_pages = completed_pages + 1")
        if failed:
            updates.append("failed_pages = failed_pages + 1")
        if tokens > 0:
            updates.append("total_tokens_used = total_tokens_used + ?")
            params.append(tokens)

        params.append(job_id)

        await db.execute(
            f"UPDATE jobs SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )

    @staticmethod
    async def get_pending_jobs() -> List[Dict[str, Any]]:
        """Get all pending/active jobs that can be processed.

        Excludes: PAUSED, CANCELLED, COMPLETED, FAILED
        Includes: PENDING, PREPARING_EMBEDDINGS, GENERATING_STRUCTURE, GENERATING_PAGES
        """
        db = await get_db()
        return await db.fetch_all(
            """SELECT * FROM jobs
               WHERE status IN (?, ?, ?, ?)
               ORDER BY created_at ASC""",
            (JobStatus.PENDING.value,
             JobStatus.PREPARING_EMBEDDINGS.value,
             JobStatus.GENERATING_STRUCTURE.value,
             JobStatus.GENERATING_PAGES.value)
        )

    @staticmethod
    async def list_jobs(
        owner: Optional[str] = None,
        repo: Optional[str] = None,
        status: Optional[JobStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[JobResponse]:
        """List jobs with optional filters."""
        db = await get_db()

        conditions = []
        params: List[Any] = []

        if owner:
            conditions.append("owner = ?")
            params.append(owner)
        if repo:
            conditions.append("repo = ?")
            params.append(repo)
        if status:
            conditions.append("status = ?")
            params.append(status.value)

        # Construct query with explicit parameter handling
        query = "SELECT * FROM jobs"
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = await db.fetch_all(query, tuple(params))

        return [JobManager._row_to_job_response(row) for row in rows]

    @staticmethod
    async def count_jobs(
        owner: Optional[str] = None,
        repo: Optional[str] = None,
        status: Optional[JobStatus] = None
    ) -> int:
        """Count jobs with optional filters."""
        db = await get_db()

        conditions = []
        params: List[Any] = []

        if owner:
            conditions.append("owner = ?")
            params.append(owner)
        if repo:
            conditions.append("repo = ?")
            params.append(repo)
        if status:
            conditions.append("status = ?")
            params.append(status.value)

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        result = await db.fetch_one(
            f"SELECT COUNT(*) as count FROM jobs {where_clause}",
            tuple(params)
        )
        return result['count'] if result else 0

    @staticmethod
    async def pause_job(job_id: str) -> bool:
        """Pause a running job."""
        db = await get_db()

        result = await db.execute(
            """UPDATE jobs SET status = ?, updated_at = datetime('now')
               WHERE id = ? AND status IN (?, ?, ?)""",
            (JobStatus.PAUSED.value, job_id,
             JobStatus.PREPARING_EMBEDDINGS.value,
             JobStatus.GENERATING_STRUCTURE.value,
             JobStatus.GENERATING_PAGES.value)
        )

        return result > 0

    @staticmethod
    async def resume_job(job_id: str) -> bool:
        """Resume a paused job."""
        db = await get_db()

        # Get current job state to determine which phase to resume
        job = await db.fetch_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if not job or job['status'] != JobStatus.PAUSED.value:
            return False

        # Determine resume status based on phase
        phase = job['current_phase']
        if phase == 0:
            resume_status = JobStatus.PREPARING_EMBEDDINGS.value
        elif phase == 1:
            resume_status = JobStatus.GENERATING_STRUCTURE.value
        else:
            resume_status = JobStatus.GENERATING_PAGES.value

        result = await db.execute(
            """UPDATE jobs SET status = ?, updated_at = datetime('now')
               WHERE id = ? AND status = ?""",
            (resume_status, job_id, JobStatus.PAUSED.value)
        )

        return result > 0

    @staticmethod
    async def cancel_job(job_id: str) -> bool:
        """Cancel a running job."""
        db = await get_db()

        result = await db.execute(
            """UPDATE jobs SET status = ?, completed_at = datetime('now'), updated_at = datetime('now')
               WHERE id = ? AND status NOT IN (?, ?, ?)""",
            (JobStatus.CANCELLED.value, job_id,
             JobStatus.COMPLETED.value, JobStatus.FAILED.value, JobStatus.CANCELLED.value)
        )

        return result > 0

    @staticmethod
    async def retry_job(job_id: str) -> bool:
        """Retry a failed job."""
        db = await get_db()

        # Get current job state
        job = await db.fetch_one("SELECT * FROM jobs WHERE id = ?", (job_id,))
        if not job or job['status'] != JobStatus.FAILED.value:
            return False

        # Determine resume status based on phase
        phase = job['current_phase']
        if phase == 0:
            resume_status = JobStatus.PREPARING_EMBEDDINGS.value
        elif phase == 1:
            resume_status = JobStatus.GENERATING_STRUCTURE.value
        else:
            resume_status = JobStatus.GENERATING_PAGES.value

        result = await db.execute(
            """UPDATE jobs SET status = ?, error_message = NULL, updated_at = datetime('now')
               WHERE id = ? AND status = ?""",
            (resume_status, job_id, JobStatus.FAILED.value)
        )

        return result > 0

    @staticmethod
    async def retry_failed_page(page_id: str) -> bool:
        """Reset a failed page for retry."""
        db = await get_db()

        # Check current status
        page = await db.fetch_one(
            "SELECT * FROM job_pages WHERE id = ?", (page_id,)
        )

        if not page:
            return False

        if page['status'] not in [PageStatus.FAILED.value, PageStatus.PERMANENT_FAILED.value]:
            return False

        # Get the job to check its status
        job = await db.fetch_one(
            "SELECT * FROM jobs WHERE id = ?", (page['job_id'],)
        )

        if not job:
            return False

        # Reset page to PENDING and reset retry_count to allow fresh retry
        result = await db.execute(
            """UPDATE job_pages
               SET status = ?,
                   content = NULL,
                   last_error = NULL,
                   retry_count = 0,
                   started_at = NULL,
                   completed_at = NULL
               WHERE id = ?""",
            (PageStatus.PENDING.value, page_id)
        )

        # Update the job's failed_pages count and status
        if result > 0:
            # If job is COMPLETED or FAILED, restart it to GENERATING_PAGES
            # so the worker will pick up the retried page
            if job['status'] in [JobStatus.COMPLETED.value, JobStatus.FAILED.value]:
                await db.execute(
                    """UPDATE jobs
                       SET failed_pages = failed_pages - 1,
                           status = ?,
                           current_phase = 2,
                           error_message = NULL,
                           updated_at = datetime('now')
                       WHERE id = ?""",
                    (JobStatus.GENERATING_PAGES.value, page['job_id'])
                )
            else:
                # Job is still active, just decrement failed_pages count
                await db.execute(
                    """UPDATE jobs SET failed_pages = failed_pages - 1, updated_at = datetime('now')
                       WHERE id = ?""",
                    (page['job_id'],)
                )

        return result > 0

    @staticmethod
    async def reset_stuck_pages(job_id: str) -> int:
        """Reset pages stuck in IN_PROGRESS back to PENDING."""
        db = await get_db()
        
        result = await db.execute(
            """UPDATE job_pages 
               SET status = ?, started_at = NULL
               WHERE job_id = ? AND status = ?""",
            (PageStatus.PENDING.value, job_id, PageStatus.IN_PROGRESS.value)
        )
        
        return result

    @staticmethod
    async def delete_job(job_id: str) -> bool:
        """Delete a job and its pages."""
        db = await get_db()

        result = await db.execute(
            "DELETE FROM jobs WHERE id = ?",
            (job_id,)
        )

        return result > 0

    # Helper methods
    @staticmethod
    def _row_to_job_response(row: Dict[str, Any]) -> JobResponse:
        """Convert database row to JobResponse."""
        return JobResponse(
            id=row['id'],
            repo_url=row['repo_url'],
            repo_type=row['repo_type'],
            owner=row['owner'],
            repo=row['repo'],
            provider=row['provider'],
            model=row['model'],
            language=row['language'],
            is_comprehensive=bool(row['is_comprehensive']),
            status=JobStatus(row['status']),
            current_phase=row['current_phase'],
            progress_percent=row['progress_percent'],
            error_message=row['error_message'],
            total_pages=row['total_pages'] or 0,
            completed_pages=row['completed_pages'] or 0,
            failed_pages=row['failed_pages'] or 0,
            total_tokens_used=row['total_tokens_used'] or 0,
            created_at=datetime.fromisoformat(row['created_at']),
            started_at=datetime.fromisoformat(row['started_at']) if row['started_at'] else None,
            completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None,
            updated_at=datetime.fromisoformat(row['updated_at'])
        )

    @staticmethod
    def _row_to_page_response(row: Dict[str, Any]) -> JobPageResponse:
        """Convert database row to JobPageResponse."""
        return JobPageResponse(
            id=row['id'],
            job_id=row['job_id'],
            page_id=row['page_id'],
            title=row['title'],
            description=row['description'],
            importance=row['importance'],
            file_paths=json.loads(row['file_paths']) if row['file_paths'] else [],
            related_pages=json.loads(row['related_pages']) if row['related_pages'] else [],
            parent_section=row['parent_section'],
            status=PageStatus(row['status']),
            content=row['content'],
            retry_count=row['retry_count'],
            last_error=row['last_error'],
            tokens_used=row['tokens_used'] or 0,
            generation_time_ms=row['generation_time_ms'] or 0,
            created_at=datetime.fromisoformat(row['created_at']),
            started_at=datetime.fromisoformat(row['started_at']) if row['started_at'] else None,
            completed_at=datetime.fromisoformat(row['completed_at']) if row['completed_at'] else None
        )
