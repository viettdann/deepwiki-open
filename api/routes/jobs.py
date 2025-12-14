"""
API endpoints for job management.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import StreamingResponse

from api.background.models import (
    CreateJobRequest, JobResponse, JobDetailResponse, JobListResponse,
    JobStatus, JobProgressUpdate
)
from api.background.job_manager import JobManager
from api.background.worker import get_worker
from api.core.database import get_db
from api.auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wiki/jobs", tags=["jobs"])


@router.post("", response_model=dict)
async def create_job(request: CreateJobRequest, user = Depends(require_admin)):
    """
    Create a new wiki generation job.
    Returns job_id immediately, processing happens in background.
    """
    try:
        job_id = await JobManager.create_job(request)
        return {"job_id": job_id, "message": "Job created successfully"}
    except Exception as e:
        logger.error(f"Error creating job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{job_id}", response_model=JobDetailResponse)
async def get_job(job_id: str):
    """
    Get job details including all pages.
    """
    job_detail = await JobManager.get_job_detail(job_id)
    if not job_detail:
        raise HTTPException(status_code=404, detail="Job not found")

    # Fetch and attach token summary
    from api.background.token_tracker import TokenTracker
    from api.background.models import TokenSummary
    token_stats = await TokenTracker.get_job_tokens(job_id)

    if token_stats:
        job_detail.job.token_summary = TokenSummary(
            chunking_total_tokens=token_stats['chunking_total_tokens'],
            chunking_total_chunks=token_stats['chunking_total_chunks'],
            provider_prompt_tokens=token_stats['provider_prompt_tokens'],
            provider_completion_tokens=token_stats['provider_completion_tokens'],
            provider_total_tokens=token_stats['provider_total_tokens']
        )

    return job_detail


@router.get("", response_model=JobListResponse)
async def list_jobs(
    owner: Optional[str] = Query(None),
    repo: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """
    List jobs with optional filters.
    """
    status_enum = JobStatus(status) if status else None
    jobs = await JobManager.list_jobs(owner, repo, status_enum, limit, offset)
    total = await JobManager.count_jobs(owner, repo, status_enum)

    return JobListResponse(jobs=jobs, total=total)


@router.delete("/{job_id}")
async def cancel_job(job_id: str, user = Depends(require_admin)):
    """
    Cancel a running job.
    Note: This CANCELS the job (changes status to 'cancelled'), it does not delete it.
    Use POST /{job_id}/delete for permanent deletion.
    """
    success = await JobManager.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be cancelled (already completed or not found)"
        )
    return {"message": "Job cancelled successfully"}


@router.post("/{job_id}/delete")
async def delete_job_permanently(job_id: str, user = Depends(require_admin)):
    """
    Permanently delete a job and all its pages from the database.
    Only allowed for completed, failed, or cancelled jobs.
    This action is irreversible.
    """
    # Get job to check status
    job = await JobManager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Only allow deletion of completed, partially_completed, failed, or cancelled jobs
    allowed_statuses = [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]
    if job.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Job cannot be deleted in '{job.status.value}' status. Only completed, partially_completed, failed, or cancelled jobs can be deleted."
        )

    success = await JobManager.delete_job(job_id)
    if not success:
        raise HTTPException(
            status_code=500,
            detail="Failed to delete job"
        )

    return {"message": "Job permanently deleted"}


@router.post("/{job_id}/pause")
async def pause_job(job_id: str, user = Depends(require_admin)):
    """
    Pause a running job.
    """
    success = await JobManager.pause_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be paused (not running or not found)"
        )
    return {"message": "Job paused successfully"}


@router.post("/{job_id}/resume")
async def resume_job(job_id: str, user = Depends(require_admin)):
    """
    Resume a paused job.
    """
    success = await JobManager.resume_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be resumed (not paused or not found)"
        )
    return {"message": "Job resumed successfully"}


@router.post("/{job_id}/retry")
async def retry_job(job_id: str, user = Depends(require_admin)):
    """
    Retry a failed job.
    """
    success = await JobManager.retry_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be retried (not failed or not found)"
        )
    return {"message": "Job queued for retry"}


@router.post("/{job_id}/pages/{page_id}/retry")
async def retry_page(job_id: str, page_id: str, user = Depends(require_admin)):
    """
    Retry a failed page.
    """
    success = await JobManager.retry_failed_page(page_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Page cannot be retried (not failed or not found)"
        )
    return {"message": "Page queued for retry"}


@router.get("/{job_id}/token-summary")
async def get_token_summary(job_id: str):
    """
    Get detailed token usage summary for a job.
    """
    from api.background.token_tracker import TokenTracker
    from api.background.models import TokenSummary

    # Verify job exists
    job = await JobManager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Fetch token stats
    token_stats = await TokenTracker.get_job_tokens(job_id)

    if not token_stats:
        return TokenSummary()

    return TokenSummary(
        chunking_total_tokens=token_stats['chunking_total_tokens'],
        chunking_total_chunks=token_stats['chunking_total_chunks'],
        provider_prompt_tokens=token_stats['provider_prompt_tokens'],
        provider_completion_tokens=token_stats['provider_completion_tokens'],
        provider_total_tokens=token_stats['provider_total_tokens']
    )


@router.get("/{job_id}/progress/stream")
async def job_progress_stream(job_id: str, request: Request):
    """
    HTTP streaming endpoint for real-time job progress updates.
    Replaces WebSocket with simpler HTTP streaming architecture.
    """
    from api.config import API_KEY_AUTH_ENABLED, API_KEYS

    # Validate API key if auth is enabled
    if API_KEY_AUTH_ENABLED:
        api_key = request.headers.get('x-api-key')
        if not api_key:
            raise HTTPException(status_code=401, detail="Missing API key")
        if api_key not in API_KEYS:
            raise HTTPException(status_code=401, detail="Invalid API key")

    # Get current job status
    job = await JobManager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def get_status_message(current_job):
        """Generate a meaningful status message based on job state."""
        # If generating pages, try to get the current page being processed
        if current_job.status == JobStatus.GENERATING_PAGES:
            db = await get_db()
            # Get the most recently started in-progress page
            page = await db.fetch_one(
                """SELECT title FROM job_pages
                   WHERE job_id = ? AND status = ?
                   ORDER BY started_at DESC LIMIT 1""",
                (job_id, "in_progress")
            )
            if page:
                return f"Generating: {page['title']}"

        # Default message for other statuses
        status_messages = {
            JobStatus.PENDING: "Waiting to start",
            JobStatus.PREPARING_EMBEDDINGS: "Preparing repository embeddings",
            JobStatus.GENERATING_STRUCTURE: "Generating wiki structure",
            JobStatus.GENERATING_PAGES: "Generating pages",
            JobStatus.PAUSED: "Job paused",
            JobStatus.COMPLETED: "Job completed",
            JobStatus.PARTIALLY_COMPLETED: "Job partially completed (some pages failed)",
            JobStatus.FAILED: "Job failed",
            JobStatus.CANCELLED: "Job cancelled"
        }
        return status_messages.get(current_job.status, f"Status: {current_job.status.value}")

    async def stream_progress():
        """Generator function that streams job progress updates."""
        try:
            from api.background.token_tracker import TokenTracker

            # Send initial status
            initial_message = await get_status_message(job)

            # Fetch token stats
            token_stats = await TokenTracker.get_job_tokens(job_id)
            token_summary_dict = None
            if token_stats:
                token_summary_dict = {
                    "chunking_total_tokens": token_stats['chunking_total_tokens'],
                    "chunking_total_chunks": token_stats['chunking_total_chunks'],
                    "provider_prompt_tokens": token_stats['provider_prompt_tokens'],
                    "provider_completion_tokens": token_stats['provider_completion_tokens'],
                    "provider_total_tokens": token_stats['provider_total_tokens']
                }

            initial_update = {
                "job_id": job_id,
                "status": job.status.value,
                "current_phase": job.current_phase,
                "progress_percent": job.progress_percent,
                "message": initial_message,
                "total_pages": job.total_pages,
                "completed_pages": job.completed_pages,
                "failed_pages": job.failed_pages,
                "token_summary": token_summary_dict
            }
            yield json.dumps(initial_update) + "\n"

            # If job is already complete, close stream
            if job.status in [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                return

            # Register for progress updates
            worker = await get_worker()
            update_queue = asyncio.Queue()

            async def progress_callback(update: JobProgressUpdate):
                """Callback that receives progress updates and queues them."""
                try:
                    # Convert token_summary to dict if present
                    token_summary_dict = None
                    if update.token_summary:
                        token_summary_dict = {
                            "chunking_total_tokens": update.token_summary.chunking_total_tokens,
                            "chunking_total_chunks": update.token_summary.chunking_total_chunks,
                            "provider_prompt_tokens": update.token_summary.provider_prompt_tokens,
                            "provider_completion_tokens": update.token_summary.provider_completion_tokens,
                            "provider_total_tokens": update.token_summary.provider_total_tokens
                        }

                    await update_queue.put({
                        "job_id": update.job_id,
                        "status": update.status.value,
                        "current_phase": update.current_phase,
                        "progress_percent": update.progress_percent,
                        "message": update.message,
                        "page_id": update.page_id,
                        "page_title": update.page_title,
                        "page_status": update.page_status.value if update.page_status else None,
                        "total_pages": update.total_pages,
                        "completed_pages": update.completed_pages,
                        "failed_pages": update.failed_pages,
                        "error": update.error,
                        "token_summary": token_summary_dict
                    })
                except Exception as e:
                    logger.error(f"Error in progress callback: {e}")

            worker.register_progress_callback(job_id, progress_callback)

            try:
                # Stream updates until job completes or client disconnects
                while True:
                    try:
                        # Wait for updates with timeout for heartbeat
                        update = await asyncio.wait_for(update_queue.get(), timeout=30)

                        # Send the update
                        yield json.dumps(update) + "\n"

                        # Check if job completed
                        if update["status"] in ["completed", "partially_completed", "failed", "cancelled"]:
                            break

                    except asyncio.TimeoutError:
                        # Send heartbeat and check job status
                        current_job = await JobManager.get_job(job_id)
                        if current_job and current_job.status in [JobStatus.COMPLETED, JobStatus.PARTIALLY_COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                            # Send final status update
                            final_message = await get_status_message(current_job)

                            # Fetch token stats for final update
                            final_token_stats = await TokenTracker.get_job_tokens(job_id)
                            final_token_summary_dict = None
                            if final_token_stats:
                                final_token_summary_dict = {
                                    "chunking_total_tokens": final_token_stats['chunking_total_tokens'],
                                    "chunking_total_chunks": final_token_stats['chunking_total_chunks'],
                                    "provider_prompt_tokens": final_token_stats['provider_prompt_tokens'],
                                    "provider_completion_tokens": final_token_stats['provider_completion_tokens'],
                                    "provider_total_tokens": final_token_stats['provider_total_tokens']
                                }

                            final_update = {
                                "job_id": job_id,
                                "status": current_job.status.value,
                                "current_phase": current_job.current_phase,
                                "progress_percent": current_job.progress_percent,
                                "message": final_message,
                                "total_pages": current_job.total_pages,
                                "completed_pages": current_job.completed_pages,
                                "failed_pages": current_job.failed_pages,
                                "token_summary": final_token_summary_dict
                            }
                            yield json.dumps(final_update) + "\n"
                            break

                        # Send heartbeat with current status (including current page if generating)
                        if current_job:
                            heartbeat_message = await get_status_message(current_job)
                            yield json.dumps({
                                "heartbeat": True,
                                "message": heartbeat_message,
                                "status": current_job.status.value,
                                "progress_percent": current_job.progress_percent
                            }) + "\n"
                        else:
                            yield json.dumps({"heartbeat": True}) + "\n"

            finally:
                # Cleanup: unregister callback
                worker.unregister_progress_callback(job_id)
                logger.debug(f"[Job {job_id}] Client disconnected from progress stream (normal)")

        except Exception as e:
            logger.error(f"Error in progress stream for job {job_id}: {e}")
            yield json.dumps({"error": str(e)}) + "\n"

    return StreamingResponse(
        stream_progress(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"  # Disable buffering in nginx
        }
    )
