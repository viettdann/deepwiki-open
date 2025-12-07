"""
Pydantic models for background job system.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class JobStatus(str, Enum):
    """Job status enum."""
    PENDING = "pending"
    PREPARING_EMBEDDINGS = "preparing_embeddings"
    GENERATING_STRUCTURE = "generating_structure"
    GENERATING_PAGES = "generating_pages"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PageStatus(str, Enum):
    """Page generation status enum."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PERMANENT_FAILED = "permanent_failed"


# Request/Response Models
class CreateJobRequest(BaseModel):
    """Request to create a new wiki generation job."""
    repo_url: str = Field(..., description="Repository URL")
    repo_type: str = Field("github", description="Repository type")
    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")
    access_token: Optional[str] = Field(None, description="Access token for private repos")

    provider: str = Field("google", description="LLM provider")
    model: Optional[str] = Field(None, description="Model name")
    language: str = Field("en", description="Output language")
    is_comprehensive: bool = Field(True, description="Comprehensive or concise wiki")

    excluded_dirs: Optional[List[str]] = Field(None)
    excluded_files: Optional[List[str]] = Field(None)
    included_dirs: Optional[List[str]] = Field(None)
    included_files: Optional[List[str]] = Field(None)

    client_id: Optional[str] = Field(None, description="Client identifier for tracking")


class JobResponse(BaseModel):
    """Response model for job data."""
    id: str
    repo_url: str
    repo_type: str
    owner: str
    repo: str

    provider: str
    model: Optional[str]
    language: str
    is_comprehensive: bool

    status: JobStatus
    current_phase: int
    progress_percent: float
    error_message: Optional[str]

    total_pages: int
    completed_pages: int
    failed_pages: int
    total_tokens_used: int

    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: datetime


class JobPageResponse(BaseModel):
    """Response model for job page data."""
    id: str
    job_id: str
    page_id: str
    title: str
    description: Optional[str]
    importance: str
    file_paths: List[str]
    related_pages: List[str]
    parent_section: Optional[str]

    status: PageStatus
    content: Optional[str]

    retry_count: int
    last_error: Optional[str]
    tokens_used: int
    generation_time_ms: int

    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]


class JobDetailResponse(BaseModel):
    """Detailed job response with pages."""
    job: JobResponse
    pages: List[JobPageResponse]
    wiki_structure: Optional[Dict[str, Any]]


class JobListResponse(BaseModel):
    """List of jobs response."""
    jobs: List[JobResponse]
    total: int


class JobProgressUpdate(BaseModel):
    """HTTP streaming progress update message."""
    job_id: str
    status: JobStatus
    current_phase: int
    progress_percent: float
    message: str
    total_pages: Optional[int] = None
    completed_pages: Optional[int] = None
    failed_pages: Optional[int] = None
    page_id: Optional[str] = None
    page_title: Optional[str] = None
    page_status: Optional[PageStatus] = None
    error: Optional[str] = None
