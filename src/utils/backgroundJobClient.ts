/**
 * Client utilities for background job wiki generation.
 */

interface CreateJobRequest {
  repo_url: string;
  repo_type: string;
  owner: string;
  repo: string;
  access_token?: string;
  branch?: string;
  provider: string;
  model?: string;
  language: string;
  is_comprehensive: boolean;
  excluded_dirs?: string[];
  excluded_files?: string[];
  included_dirs?: string[];
  included_files?: string[];
}

interface JobResponse {
  job_id: string;
  message: string;
}

interface Job {
  id: string;
  owner: string;
  repo: string;
  repo_type: string;
  status: string;
  progress_percent: number;
  total_pages: number;
  completed_pages: number;
  failed_pages: number;
}

interface JobListResponse {
  jobs: Job[];
  total: number;
}

/**
 * Create a new wiki generation job
 */
export async function createWikiJob(request: CreateJobRequest): Promise<JobResponse> {
  const response = await fetch('/api/wiki/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.error || 'Failed to create job');
  }

  return response.json();
}

/**
 * Get job details by ID
 */
export async function getJob(jobId: string): Promise<{ job: Job } | null> {
  const response = await fetch(`/api/wiki/jobs/${jobId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || error.error || 'Failed to fetch job');
  }

  return response.json();
}

/**
 * Find existing active job for a repository
 */
export async function findActiveJob(owner: string, repo: string): Promise<Job | null> {
  const params = new URLSearchParams({
    owner,
    repo,
    limit: '1',
  });

  const response = await fetch(`/api/wiki/jobs?${params}`);

  if (!response.ok) {
    return null;
  }

  const data: JobListResponse = await response.json();

  // Find job that is not completed/failed/cancelled
  const activeJob = data.jobs.find(j =>
    !['completed', 'failed', 'cancelled'].includes(j.status)
  );

  return activeJob || null;
}

/**
 * Check if a repository has an active job or needs generation
 * Returns: 'cached' | 'active_job' | 'needs_generation'
 */
export async function checkWikiStatus(
  owner: string,
  repo: string,
  repoType: string,
  language: string
): Promise<{ status: 'cached' | 'active_job' | 'needs_generation'; jobId?: string }> {
  // Check for cached wiki first
  const cacheParams = new URLSearchParams({
    owner,
    repo,
    repo_type: repoType,
    language,
  });

  const cacheResponse = await fetch(`/api/wiki_cache?${cacheParams}`);

  if (cacheResponse.ok) {
    const cacheData = await cacheResponse.json();
    if (cacheData && cacheData.wiki_structure) {
      return { status: 'cached' };
    }
  }

  // Check for active job
  const activeJob = await findActiveJob(owner, repo);
  if (activeJob) {
    return { status: 'active_job', jobId: activeJob.id };
  }

  return { status: 'needs_generation' };
}

/**
 * Start wiki generation using background job and get redirect URL
 */
export async function startBackgroundWikiGeneration(
  repoUrl: string,
  repoType: string,
  owner: string,
  repo: string,
  provider: string,
  model: string | undefined,
  language: string,
  isComprehensive: boolean,
  accessToken?: string,
  excludedDirs?: string[],
  excludedFiles?: string[],
  includedDirs?: string[],
  includedFiles?: string[],
  branch?: string
): Promise<string> {
  const request: CreateJobRequest = {
    repo_url: repoUrl,
    repo_type: repoType,
    owner,
    repo,
    access_token: accessToken,
    branch: branch || "main",
    provider,
    model,
    language,
    is_comprehensive: isComprehensive,
    excluded_dirs: excludedDirs,
    excluded_files: excludedFiles,
    included_dirs: includedDirs,
    included_files: includedFiles,
  };

  const result = await createWikiJob(request);
  return `/wiki/job/${result.job_id}`;
}
