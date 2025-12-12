'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import { RoleBasedButton } from '@/components/RoleBasedButton';
import { FaPause, FaPlay, FaTimes, FaCheck, FaExclamationTriangle, FaSpinner, FaClock, FaRedo, FaTrash } from 'react-icons/fa';
import { createJobProgressStream, JobProgressUpdate } from '@/utils/streamingClient';

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
    <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
  </svg>
);

interface TokenSummary {
  chunking_total_tokens: number;
  chunking_total_chunks: number;
  provider_prompt_tokens: number;
  provider_completion_tokens: number;
  provider_total_tokens: number;
}

interface JobProgress {
  job_id: string;
  status: string;
  current_phase: number;
  progress_percent: number;
  message: string;
  page_id?: string;
  page_title?: string;
  total_pages?: number;
  completed_pages?: number;
  failed_pages?: number;
  error?: string;
  heartbeat?: boolean;
  page_status?: string;
  token_summary?: TokenSummary;
}

interface JobPage {
  id: string;
  job_id: string;
  page_id: string;
  title: string;
  description?: string;
  importance: string;
  file_paths: string[];
  related_pages: string[];
  status: string;
  content?: string;
  retry_count: number;
  last_error?: string;
  tokens_used: number;
  generation_time_ms: number;
}

interface JobDetail {
  job: {
    id: string;
    owner: string;
    repo: string;
    repo_type: string;
    repo_url: string;
    provider: string;
    model?: string;
    language: string;
    status: string;
    current_phase: number;
    progress_percent: number;
    error_message?: string;
    total_pages: number;
    completed_pages: number;
    failed_pages: number;
    total_tokens_used: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    token_summary?: TokenSummary;
  };
  pages: JobPage[];
  wiki_structure?: Record<string, unknown>;
}

const phaseNames = ['Embeddings', 'Structure', 'Pages'];
const phaseDescriptions = [
  'Preparing repository embeddings...',
  'Generating wiki structure...',
  'Generating page content...'
];

export default function JobProgressPage() {
  const params = useParams();
  const router = useRouter();
  // const { messages } = useLanguage();

  const jobId = params?.jobId as string;

  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const abortStreamRef = useRef<(() => void) | null>(null);
  const prevProgressRef = useRef<{ completed: number; failed: number } | null>(null);

  // Fetch initial job status
  const fetchJob = useCallback(async () => {
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`Failed to fetch job: ${response.status}`);
      }
      const data = await response.json();
      setJobDetail(data);
      setIsLoading(false);

      

      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setIsLoading(false);
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // HTTP streaming for real-time updates
  useEffect(() => {
    if (!jobDetail || ['completed', 'failed', 'cancelled'].includes(jobDetail.job.status)) {
      return;
    }

    // Start HTTP streaming for progress updates
    const abortStream = createJobProgressStream(
      jobId,
      // onUpdate callback
      (update: JobProgressUpdate) => {
        if (update.error) {
          setError(update.error);
          return;
        }

        if (!update.heartbeat) {
          setProgress(update);

          // Refresh job detail when status changes
          if (update.status === 'completed' || update.status === 'failed' || update.status === 'cancelled') {
            fetchJob();
          }

          // Refresh job detail when page statuses change (completed/failed count changes)
          if (update.completed_pages !== undefined || update.failed_pages !== undefined) {
            const completed = update.completed_pages ?? 0;
            const failed = update.failed_pages ?? 0;

            if (prevProgressRef.current) {
              if (
                prevProgressRef.current.completed !== completed ||
                prevProgressRef.current.failed !== failed
              ) {
                fetchJob();
              }
            }

            prevProgressRef.current = { completed, failed };
          }
        }
      },
      // onError callback
      (error: Error) => {
        console.error('Progress streaming error:', error);
        setError(error.message);
      },
      // onClose callback
      () => {
        console.log('Progress stream closed');
      }
    );

    abortStreamRef.current = abortStream;

    return () => {
      if (abortStreamRef.current) {
        abortStreamRef.current();
        abortStreamRef.current = null;
      }
    };
  }, [jobDetail, jobId, fetchJob]);

  // Ensure pages list appears when page generation starts
  useEffect(() => {
    const phase = progress?.current_phase ?? jobDetail?.job.current_phase;
    const status = progress?.status ?? jobDetail?.job.status;
    if (
      jobDetail &&
      (status === 'generating_pages' || phase === 2) &&
      jobDetail.pages.length === 0
    ) {
      fetchJob();
    }
  }, [progress?.current_phase, progress?.status, jobDetail, fetchJob]);

  const handlePause = async () => {
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/pause`, { method: 'POST' });
      if (response.ok) {
        fetchJob();
      }
    } catch (e) {
      console.error('Failed to pause job:', e);
    }
  };

  const handleResume = async () => {
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/resume`, { method: 'POST' });
      if (response.ok) {
        fetchJob();
      }
    } catch (e) {
      console.error('Failed to resume job:', e);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this job?')) return;
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}`, { method: 'DELETE' });
      if (response.ok) {
        router.push('/jobs');
      }
    } catch (e) {
      console.error('Failed to cancel job:', e);
    }
  };

  const handleRetryPage = async (pageId: string) => {
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/pages/${pageId}/retry`, { method: 'POST' });
      if (response.ok) {
        // Refresh job data to show updated status
        fetchJob();
        // Optional: Show success message
        console.log('Page queued for retry');
      } else {
        const error = await response.json();
        console.error('Failed to retry page:', error);
        alert(`Failed to retry page: ${error.detail || error.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to retry page:', e);
      alert('Failed to retry page. Please try again.');
    }
  };

  const handleRetryJob = async () => {
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/retry`, { method: 'POST' });
      if (response.ok) {
        fetchJob();
      }
    } catch (e) {
      console.error('Failed to retry job:', e);
    }
  };

  const handleDelete = async () => {
    const jobStatus = currentStatus.replace(/_/g, ' ');
    if (!confirm(`Are you sure you want to permanently delete this ${jobStatus} job? This action cannot be undone.`)) return;
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/delete`, { method: 'POST' });
      if (response.ok) {
        router.push('/jobs');
      } else {
        const error = await response.json();
        alert(`Failed to delete job: ${error.detail || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Failed to delete job:', e);
      alert('Failed to delete job. Please try again.');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheck className="text-[var(--accent-success)]" />;
      case 'in_progress':
        return <FaSpinner className="text-[var(--accent-primary)] animate-spin" />;
      case 'failed':
      case 'permanent_failed':
        return <FaExclamationTriangle className="text-[var(--accent-danger)]" />;
      case 'pending':
        return <FaClock className="text-[var(--foreground-muted)]" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="text-4xl text-[var(--accent-primary)] animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono text-[var(--foreground-muted)]">Loading job data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4">
        <div className="rounded-lg border-2 border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 p-8 text-center max-w-md">
          <FaExclamationTriangle className="text-6xl text-[var(--accent-danger)] mb-4 mx-auto" />
          <h1 className="text-2xl font-mono font-bold text-[var(--foreground)] mb-2">ERROR</h1>
          <p className="text-[var(--foreground-muted)] font-mono mb-4">{error}</p>
          <Link href="/jobs" className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-primary)] hover:opacity-90 transition-all terminal-btn">
            ← Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  if (!jobDetail) {
    return null;
  }

  const currentProgress = progress?.progress_percent ?? jobDetail.job.progress_percent;
  const currentStatus = progress?.status ?? jobDetail.job.status;
  const currentPhase = progress?.current_phase ?? jobDetail.job.current_phase;
  const currentMessage = progress?.message ?? `Status: ${currentStatus}`;
  const totalPages = progress?.total_pages ?? jobDetail.job.total_pages;
  const completedPages = progress?.completed_pages ?? jobDetail.job.completed_pages;
  const failedPages = progress?.failed_pages ?? jobDetail.job.failed_pages;

  const isRunning = ['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(currentStatus);
  const isPaused = currentStatus === 'paused';
  const isFinished = ['completed', 'partially_completed', 'failed', 'cancelled'].includes(currentStatus);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Header
        currentPage="jobs"
        statusLabel={`JOB.${currentStatus.toUpperCase().replace(/_/g, '.')}`}
        statusValue={`${Math.round(currentProgress)}% | ${completedPages}/${totalPages}`}
        onActionClick={() => router.push('/jobs')}
        actionLabel="All Jobs"
        actionIcon={<RocketIcon />}
      />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Badge */}
        <div className="mb-6 flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full text-sm font-mono font-medium border-2 transition-colors ${
            currentStatus === 'completed' ? 'bg-[var(--accent-success)]/10 text-[var(--accent-success)] border-[var(--accent-success)]/30' :
            currentStatus === 'partially_completed' ? 'bg-[var(--accent-warning)]/10 text-[var(--accent-warning)] border-[var(--accent-warning)]/30' :
            currentStatus === 'failed' ? 'bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] border-[var(--accent-danger)]/30' :
            currentStatus === 'cancelled' ? 'bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)] border-[var(--foreground-muted)]/30' :
            currentStatus === 'paused' ? 'bg-[var(--accent-warning)]/10 text-[var(--accent-warning)] border-[var(--accent-warning)]/30' :
            'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/30'
          }`}>
            ◆ {currentStatus.replace(/_/g, ' ').toUpperCase()}
          </span>
          {jobDetail.job.provider && (
            <span className="px-3 py-1.5 rounded-full bg-[var(--surface)]/50 border-2 border-[var(--accent-primary)]/20 text-xs text-[var(--foreground-muted)] font-mono">
              {jobDetail.job.provider} / {jobDetail.job.model || 'default'}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-8 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <span className="text-sm font-mono font-medium text-[var(--foreground)]">▸ {currentMessage}</span>
              {/* Token counter for running jobs */}
              {(isRunning && (progress?.token_summary || jobDetail?.job.token_summary)) && (
                <div className="flex items-center gap-3 mt-2 text-xs font-mono text-[var(--foreground-muted)]">
                  {(() => {
                    const tokenData = progress?.token_summary || jobDetail?.job.token_summary;
                    if (!tokenData) return null;
                    const totalTokens = tokenData.chunking_total_tokens + tokenData.provider_total_tokens;
                    return (
                      <>
                        <span className="flex items-center gap-1">
                          <span className="text-[var(--accent-emerald)]">→</span>
                          {tokenData.chunking_total_tokens.toLocaleString()} chunk
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-[var(--accent-primary)]">→</span>
                          {tokenData.provider_total_tokens.toLocaleString()} llm
                        </span>
                        <span className="flex items-center gap-1 text-[var(--accent-cyan)]">
                          [{totalTokens.toLocaleString()} total]
                        </span>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
            <span className="text-sm font-mono font-bold text-[var(--accent-cyan)]">{Math.round(currentProgress)}%</span>
          </div>
          <div className="w-full bg-[var(--surface)] border-2 border-[var(--accent-primary)]/30 rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                currentStatus === 'completed' ? 'bg-gradient-to-r from-[var(--accent-success)] to-[var(--accent-emerald)]' :
                currentStatus === 'failed' ? 'bg-[var(--accent-danger)]' :
                currentStatus === 'paused' ? 'bg-[var(--accent-warning)]' :
                'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)]'
              }`}
              style={{ width: `${currentProgress}%` }}
            />
          </div>
        </div>

        {/* Phase Indicators */}
        <div className="flex justify-between mb-8 gap-2">
          {phaseNames.map((phase, idx) => (
            <div key={phase} className="flex flex-col items-center flex-1">
              <div className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center font-mono font-bold transition-all duration-300 ${
                currentPhase > idx
                  ? 'bg-gradient-to-r from-[var(--accent-success)] to-[var(--accent-emerald)] text-white border-[var(--accent-success)] shadow-lg'
                  : currentPhase === idx && isRunning
                    ? 'bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white border-[var(--accent-primary)] animate-pulse ring-4 ring-[var(--accent-primary)]/20'
                    : 'bg-[var(--surface)] text-[var(--foreground-muted)] border-[var(--accent-primary)]/20'
              }`}>
                {currentPhase > idx ? <FaCheck /> : `0${idx + 1}`}
              </div>
              <span className="text-xs mt-2 text-[var(--foreground-muted)] font-mono text-center">{phase}</span>
              {currentPhase === idx && isRunning && (
                <span className="text-xs text-[var(--accent-cyan)] font-mono mt-1 text-center">› {phaseDescriptions[idx]}</span>
              )}
            </div>
          ))}
        </div>

        {/* Page Progress */}
        {totalPages > 0 && (
          <div className="mb-8 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                </div>
                <span className="text-xs font-mono font-semibold text-[var(--accent-cyan)]">PAGE.GENERATION</span>
              </div>
              {isRunning && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--foreground-muted)] font-mono hidden sm:inline">AI_STATUS:</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border-2 ${
                    progress?.page_status === 'failed' || progress?.error
                      ? 'bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] border-[var(--accent-danger)]/30'
                      : 'bg-[var(--accent-success)]/10 text-[var(--accent-success)] border-[var(--accent-success)]/30'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      progress?.page_status === 'failed' || progress?.error
                        ? 'bg-[var(--accent-danger)]'
                        : 'bg-[var(--accent-success)] animate-pulse'
                    }`} />
                    {progress?.page_status === 'failed' || progress?.error ? 'ERROR' : 'OK'}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-4 text-sm text-[var(--foreground-muted)] font-mono mb-3">
                <span className="flex items-center gap-1.5">
                  <FaCheck className="text-[var(--accent-success)]" /> {completedPages} completed
                </span>
                {failedPages > 0 && (
                  <span className="flex items-center gap-1.5">
                    <FaExclamationTriangle className="text-[var(--accent-danger)]" /> {failedPages} failed
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <FaClock className="text-[var(--foreground-muted)]" /> {totalPages - completedPages - failedPages} pending
                </span>
              </div>

              {/* Current page being generated */}
              {progress?.page_title && isRunning && (
                <div className="mt-3 p-3 rounded-lg bg-[var(--accent-primary)]/10 border-2 border-[var(--accent-primary)]/30">
                  <span className="text-sm text-[var(--accent-cyan)] font-mono">
                    <FaSpinner className="inline animate-spin mr-2" />
                    › {progress.page_title}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pages List */}
        {jobDetail.pages.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-mono font-semibold mb-3 text-[var(--foreground)] flex items-center gap-2">
              <span className="text-[var(--accent-primary)]">▸</span> Pages
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
              {jobDetail.pages.map((page) => (
                <div
                  key={page.id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    page.status === 'completed'
                      ? 'bg-[var(--accent-success)]/10 border-[var(--accent-success)]/30'
                      : page.status === 'in_progress'
                        ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30'
                        : page.status === 'failed' || page.status === 'permanent_failed'
                          ? 'bg-[var(--accent-danger)]/10 border-[var(--accent-danger)]/30'
                          : 'bg-[var(--surface)]/30 border-[var(--accent-primary)]/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(page.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-medium text-[var(--foreground)]">{page.title}</span>
                          {/* Token badge for completed pages */}
                          {page.status === 'completed' && page.tokens_used > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] border border-[var(--accent-cyan)]/30">
                              <span className="text-[var(--accent-cyan)]/70">→</span>
                              {page.tokens_used.toLocaleString()}
                              <span className="text-[var(--accent-cyan)]/70">tok</span>
                            </span>
                          )}
                          {/* Generation time badge for completed pages */}
                          {page.status === 'completed' && page.generation_time_ms > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)] border border-[var(--foreground-muted)]/20">
                              {Math.round(page.generation_time_ms / 1000)}s
                            </span>
                          )}
                        </div>
                        {page.last_error && (
                          <p className="text-xs font-mono text-[var(--accent-danger)] mt-1">› {page.last_error}</p>
                        )}
                      </div>
                    </div>
                    {(page.status === 'failed' || page.status === 'permanent_failed') && (
                      <RoleBasedButton
                        onAdminClick={() => handleRetryPage(page.id)}
                        actionDescription={`retry failed page "${page.title}"`}
                        className="flex items-center gap-1.5 text-sm font-mono text-[var(--accent-primary)] hover:text-[var(--accent-cyan)] transition-colors ml-3"
                      >
                        <FaRedo /> Retry
                      </RoleBasedButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          {isRunning && (
            <RoleBasedButton
              onAdminClick={handlePause}
              actionDescription={`pause job "${jobDetail.job.repo}"`}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent-warning)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-warning)] hover:bg-[var(--accent-warning)]/90 transition-all shadow-lg hover:shadow-xl terminal-btn"
            >
              <FaPause /> Pause
            </RoleBasedButton>
          )}
          {isPaused && (
            <RoleBasedButton
              onAdminClick={handleResume}
              actionDescription={`resume job "${jobDetail.job.repo}"`}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent-success)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-success)] hover:bg-[var(--accent-success)]/90 transition-all shadow-lg hover:shadow-xl terminal-btn"
            >
              <FaPlay /> Resume
            </RoleBasedButton>
          )}
          {(isRunning || isPaused) && (
            <RoleBasedButton
              onAdminClick={handleCancel}
              actionDescription={`cancel job "${jobDetail.job.repo}"`}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent-danger)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/90 transition-all shadow-lg hover:shadow-xl terminal-btn"
            >
              <FaTimes /> Cancel
            </RoleBasedButton>
          )}
          {currentStatus === 'failed' && (
            <RoleBasedButton
              onAdminClick={handleRetryJob}
              actionDescription={`retry failed job "${jobDetail.job.repo}"`}
              className="flex items-center justify-center gap-2 px-4 py-2 flex-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-primary)] hover:opacity-90 transition-all shadow-lg hover:shadow-xl terminal-btn"
            >
              <FaRedo /> Retry Job
            </RoleBasedButton>
          )}
          {(currentStatus === 'completed' || currentStatus === 'partially_completed') && (
            <Link
              href={`/${jobDetail.job.owner}/${jobDetail.job.repo}?type=${jobDetail.job.repo_type}`}
              className="flex items-center justify-center gap-2 px-4 py-2 flex-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] text-white font-mono font-medium rounded-lg border-2 border-[var(--accent-primary)] hover:opacity-90 transition-all shadow-lg hover:shadow-xl terminal-btn"
            >
              View Wiki {currentStatus === 'partially_completed' && '(Partial)'}
            </Link>
          )}
          {isFinished && (
            <RoleBasedButton
              onAdminClick={handleDelete}
              actionDescription={`permanently delete job "${jobDetail.job.repo}"`}
              className="flex items-center justify-center gap-2 px-4 py-2 flex-1 bg-[var(--foreground-muted)] text-white font-mono font-medium rounded-lg border-2 border-[var(--foreground-muted)] hover:bg-[var(--accent-danger)] hover:border-[var(--accent-danger)] transition-all shadow-lg hover:shadow-xl terminal-btn"
              title="Permanently delete this job"
            >
              <FaTrash /> Remove
            </RoleBasedButton>
          )}
        </div>

        {/* Error Message */}
        {jobDetail.job.error_message && (
          <div className="mt-6 rounded-lg border-2 border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/10 overflow-hidden">
            <div className="bg-[var(--accent-danger)]/20 border-b-2 border-[var(--accent-danger)]/30 px-4 py-2 flex items-center gap-2">
              <FaExclamationTriangle className="text-[var(--accent-danger)]" />
              <span className="text-sm font-mono font-semibold text-[var(--accent-danger)]">ERROR.LOG</span>
            </div>
            <div className="p-4">
              <p className="text-sm font-mono text-[var(--accent-danger)]/90">{jobDetail.job.error_message}</p>
            </div>
          </div>
        )}

        {/* Info Message */}
        {isRunning && (
          <p className="mt-8 text-sm text-[var(--foreground-muted)] font-mono text-center p-4 rounded-lg bg-[var(--surface)]/30 border-2 border-[var(--accent-primary)]/20">
            <span className="text-[var(--accent-cyan)]">›</span> You can close this page and return later. Your wiki will continue generating in the background.
            <br />
            <span className="text-[var(--accent-cyan)]">›</span> Bookmark this URL to check progress from any device.
          </p>
        )}

        {/* Stats */}
        {isFinished && jobDetail.job.total_tokens_used > 0 && (
          <div className="mt-8 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm overflow-hidden">
            <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-4 py-2 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
              </div>
              <span className="text-xs font-mono font-semibold text-[var(--accent-cyan)]">STATISTICS.DATA</span>
            </div>
            <div className="p-5">
              {/* Main Stats */}
              <div className="grid grid-cols-3 gap-4 text-sm text-[var(--foreground-muted)] font-mono mb-6">
                <div className="text-center p-3 rounded-lg bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20">
                  <span className="block text-2xl font-bold text-[var(--accent-cyan)] mb-1">{totalPages}</span>
                  <span className="text-xs uppercase tracking-wider">Total Pages</span>
                </div>
                <div className="text-center p-3 rounded-lg bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20">
                  <span className="block text-2xl font-bold text-[var(--accent-cyan)] mb-1">{jobDetail.job.total_tokens_used.toLocaleString()}</span>
                  <span className="text-xs uppercase tracking-wider">Total Tokens</span>
                </div>
                <div className="text-center p-3 rounded-lg bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20">
                  <span className="block text-2xl font-bold text-[var(--accent-cyan)] mb-1">
                    {jobDetail.job.started_at && jobDetail.job.completed_at
                      ? Math.round((new Date(jobDetail.job.completed_at).getTime() - new Date(jobDetail.job.started_at).getTime()) / 60000)
                      : '-'}
                  </span>
                  <span className="text-xs uppercase tracking-wider">Minutes</span>
                </div>
              </div>

              {/* Token Breakdown */}
              {jobDetail.job.token_summary && (
                <div className="border-t-2 border-[var(--accent-primary)]/20 pt-4">
                  <h3 className="text-xs font-mono font-semibold text-[var(--accent-cyan)] mb-3 uppercase tracking-wider">Token Breakdown</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm text-[var(--foreground-muted)] font-mono">
                    {/* Chunking Stats */}
                    <div className="p-3 rounded-lg bg-[var(--accent-emerald)]/5 border border-[var(--accent-emerald)]/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-wider text-[var(--accent-emerald)]">Chunking</span>
                        <span className="text-lg font-bold text-[var(--accent-emerald)]">{jobDetail.job.token_summary.chunking_total_tokens.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]/70">
                        {jobDetail.job.token_summary.chunking_total_chunks.toLocaleString()} chunks
                      </div>
                    </div>

                    {/* Provider Stats */}
                    <div className="p-3 rounded-lg bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase tracking-wider text-[var(--accent-primary)]">Provider LLM</span>
                        <span className="text-lg font-bold text-[var(--accent-primary)]">{jobDetail.job.token_summary.provider_total_tokens.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-[var(--foreground-muted)]/70 flex justify-between">
                        <span>{jobDetail.job.token_summary.provider_prompt_tokens.toLocaleString()} prompt</span>
                        <span>{jobDetail.job.token_summary.provider_completion_tokens.toLocaleString()} completion</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
