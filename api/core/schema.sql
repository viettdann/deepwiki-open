-- DeepWiki Background Jobs Schema
-- SQLite with WAL mode for concurrent read/write access

-- Enable WAL mode for concurrent reads/writes
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

-- Jobs table - Main job tracking
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,  -- UUID v4

    -- Repository information
    repo_url TEXT NOT NULL,
    repo_type TEXT NOT NULL DEFAULT 'github',  -- github, gitlab, bitbucket, azure, local
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,

    -- Authentication (encrypted in production)
    access_token TEXT,  -- Optional for private repos

    -- Configuration
    provider TEXT NOT NULL DEFAULT 'google',
    model TEXT,
    language TEXT NOT NULL DEFAULT 'en',
    is_comprehensive INTEGER NOT NULL DEFAULT 1,  -- SQLite uses INTEGER for boolean

    -- File filters (JSON arrays)
    excluded_dirs TEXT,  -- JSON array
    excluded_files TEXT,  -- JSON array
    included_dirs TEXT,  -- JSON array
    included_files TEXT,  -- JSON array

    -- Wiki structure (populated after Phase 1)
    wiki_structure TEXT,  -- Full JSON wiki structure

    -- Status and progress
    -- pending, preparing_embeddings, generating_structure, generating_pages, paused, completed, failed, cancelled
    status TEXT NOT NULL DEFAULT 'pending',
    current_phase INTEGER NOT NULL DEFAULT 0,  -- 0-2
    progress_percent REAL NOT NULL DEFAULT 0.0,  -- 0.0-100.0
    error_message TEXT,

    -- Statistics
    total_pages INTEGER DEFAULT 0,
    completed_pages INTEGER DEFAULT 0,
    failed_pages INTEGER DEFAULT 0,
    total_tokens_used INTEGER DEFAULT 0,

    -- Timestamps (ISO 8601 format)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    -- Metadata for multi-device access
    client_id TEXT  -- Optional: track which client started the job
);

-- Job pages table - Per-page tracking
CREATE TABLE IF NOT EXISTS job_pages (
    id TEXT PRIMARY KEY,  -- UUID v4
    job_id TEXT NOT NULL,

    -- Page information from wiki structure
    page_id TEXT NOT NULL,  -- Original page ID from structure (e.g., "page-1")
    title TEXT NOT NULL,
    description TEXT,
    importance TEXT DEFAULT 'medium',  -- high, medium, low
    file_paths TEXT,  -- JSON array of relevant file paths
    related_pages TEXT,  -- JSON array of related page IDs
    parent_section TEXT,  -- Section ID if applicable

    -- Generation status
    -- pending, in_progress, completed, failed, permanent_failed
    status TEXT NOT NULL DEFAULT 'pending',
    content TEXT,  -- Generated markdown content

    -- Retry tracking
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,

    -- Statistics
    tokens_used INTEGER DEFAULT 0,
    generation_time_ms INTEGER DEFAULT 0,

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT,

    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_owner_repo ON jobs(owner, repo);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_pages_job_id ON job_pages(job_id);
CREATE INDEX IF NOT EXISTS idx_job_pages_status ON job_pages(status);
CREATE INDEX IF NOT EXISTS idx_job_pages_job_status ON job_pages(job_id, status);
