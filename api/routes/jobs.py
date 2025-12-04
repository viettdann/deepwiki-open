"""
API endpoints for job management.
"""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from api.background.models import (
    CreateJobRequest, JobResponse, JobDetailResponse, JobListResponse,
    JobStatus, JobProgressUpdate
)
from api.background.job_manager import JobManager
from api.background.worker import get_worker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wiki/jobs", tags=["jobs"])


@router.post("", response_model=dict)
async def create_job(request: CreateJobRequest):
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
async def cancel_job(job_id: str):
    """
    Cancel a running job.
    """
    success = await JobManager.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job cannot be cancelled (already completed or not found)"
        )
    return {"message": "Job cancelled successfully"}


@router.post("/{job_id}/pause")
async def pause_job(job_id: str):
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
async def resume_job(job_id: str):
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
async def retry_job(job_id: str):
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
async def retry_page(job_id: str, page_id: str):
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


@router.websocket("/{job_id}/progress")
async def job_progress_websocket(websocket: WebSocket, job_id: str):
    """
    WebSocket endpoint for real-time job progress updates.
    """
    await websocket.accept()

    # Get current job status
    job = await JobManager.get_job(job_id)
    if not job:
        await websocket.send_json({"error": "Job not found"})
        await websocket.close()
        return

    # Send current status
    await websocket.send_json({
        "job_id": job_id,
        "status": job.status.value,
        "current_phase": job.current_phase,
        "progress_percent": job.progress_percent,
        "message": f"Status: {job.status.value}",
        "total_pages": job.total_pages,
        "completed_pages": job.completed_pages,
        "failed_pages": job.failed_pages
    })

    # If job is already complete, close connection
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
        await websocket.close()
        return

    # Register for progress updates
    worker = await get_worker()

    async def progress_callback(update: JobProgressUpdate):
        try:
            await websocket.send_json({
                "job_id": update.job_id,
                "status": update.status.value,
                "current_phase": update.current_phase,
                "progress_percent": update.progress_percent,
                "message": update.message,
                "page_id": update.page_id,
                "page_title": update.page_title,
                "total_pages": update.total_pages,
                "completed_pages": update.completed_pages,
                "failed_pages": update.failed_pages,
                "error": update.error
            })

            # Close if job completed
            if update.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                await websocket.close()
        except Exception:
            pass

    worker.register_progress_callback(job_id, progress_callback)

    try:
        # Keep connection alive until job completes or client disconnects
        while True:
            try:
                # Wait for any message from client (mostly for detecting disconnects)
                # We don't expect data from client, but we need to listen to detect closure
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send heartbeat and check job status
                job = await JobManager.get_job(job_id)
                if job and job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED]:
                    break
                await websocket.send_json({"heartbeat": True})

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from job {job_id} progress")
    except Exception as e:
        logger.error(f"WebSocket error for job {job_id}: {e}")
    finally:
        worker.unregister_progress_callback(job_id)
