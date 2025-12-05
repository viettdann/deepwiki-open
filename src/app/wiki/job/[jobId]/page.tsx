'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
// import { useLanguage } from '@/contexts/LanguageContext';
import { FaPause, FaPlay, FaTimes, FaCheck, FaExclamationTriangle, FaSpinner, FaClock, FaRedo } from 'react-icons/fa';

const WikiIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
  </svg>
);


const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
    <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
  </svg>
);

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
  const wsRef = useRef<WebSocket | null>(null);
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
  }, [jobId, router]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!jobDetail || ['completed', 'failed', 'cancelled'].includes(jobDetail.job.status)) {
      return;
    }

    // Connect directly to backend WebSocket
    const serverBaseUrl = process.env.NEXT_PUBLIC_SERVER_BASE_URL || 'http://localhost:8001';
    const wsBaseUrl = serverBaseUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const wsUrl = `${wsBaseUrl}/api/wiki/jobs/${jobId}/progress`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.error) {
        setError(data.error);
        return;
      }

      if (!data.heartbeat) {
        setProgress(data);

        // Refresh job detail when status changes
        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          fetchJob();
        }

        // Refresh job detail when page statuses change (completed/failed count changes)
        if (data.completed_pages !== undefined || data.failed_pages !== undefined) {
          const completed = data.completed_pages ?? 0;
          const failed = data.failed_pages ?? 0;

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
    };

    ws.onerror = () => {
      console.error('WebSocket error');
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    return () => {
      ws.close();
      wsRef.current = null;
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
  }, [progress?.current_phase, progress?.status, jobDetail?.job.current_phase, jobDetail?.job.status, jobDetail?.pages.length, fetchJob]);

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
        fetchJob();
      }
    } catch (e) {
      console.error('Failed to retry page:', e);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheck className="text-(--accent-success)" />;
      case 'in_progress':
        return <FaSpinner className="text-(--accent-primary) animate-spin" />;
      case 'failed':
      case 'permanent_failed':
        return <FaExclamationTriangle className="text-(--accent-danger)" />;
      case 'pending':
        return <FaClock className="text-(--foreground-muted)" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <FaSpinner className="text-4xl text-(--accent-primary) animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <FaExclamationTriangle className="text-6xl text-(--accent-danger) mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Error</h1>
        <p className="text-(--foreground-muted) mb-4">{error}</p>
        <Link href="/jobs" className="text-(--accent-primary) hover:underline">
          Back to Jobs
        </Link>
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
  const isFinished = ['completed', 'failed', 'cancelled'].includes(currentStatus);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-(--surface) border-b border-(--glass-border)">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-linear-to-r from-(--gradient-from) to-(--gradient-to) rounded-lg blur opacity-50"></div>
                <div className="relative bg-linear-to-r from-(--gradient-from) to-(--gradient-to) p-2 rounded-lg">
                  <WikiIcon />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold font-display gradient-text">
                  DeepWiki
                </h1>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-(--foreground-muted) hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/wiki/projects" className="text-sm font-medium text-(--accent-primary) hover:text-foreground transition-colors flex items-center gap-2">
                Indexed Wiki
              </Link>
              <Link href="/jobs" className="text-sm font-medium text-(--foreground-muted) hover:text-foreground transition-colors flex items-center gap-2">
                Jobs
                <span className="w-2 h-2 bg-(--accent-emerald) rounded-full pulse-glow"></span>
              </Link>
            </nav>

            {/* CTA Button */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/jobs')}
                className="hidden md:flex items-center gap-2 btn-japanese text-sm px-6 py-2"
              >
                <RocketIcon />
                All Jobs
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Badge */}
        <div className="mb-6 flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            currentStatus === 'completed' ? 'bg-(--accent-success)/10 text-(--accent-success) border-(--accent-success)/30' :
            currentStatus === 'failed' ? 'bg-(--accent-danger)/10 text-(--accent-danger) border-(--accent-danger)/30' :
            currentStatus === 'cancelled' ? 'bg-(--foreground-muted)/10 text-(--foreground-muted) border-(--foreground-muted)/30' :
            currentStatus === 'paused' ? 'bg-(--accent-warning)/10 text-(--accent-warning) border-(--accent-warning)/30' :
            'bg-(--accent-primary)/10 text-(--accent-primary) border-(--accent-primary)/30'
          }`}>
            {currentStatus.replace(/_/g, ' ').toUpperCase()}
          </span>
          {jobDetail.job.provider && (
            <span className="px-3 py-1.5 rounded-full bg-(--surface)/50 border border-(--glass-border) text-xs text-(--foreground-muted)">
              {jobDetail.job.provider} / {jobDetail.job.model || 'default'}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{currentMessage}</span>
            <span className="text-sm font-medium text-(--accent-primary)">{Math.round(currentProgress)}%</span>
          </div>
          <div className="w-full bg-(--surface)/50 border border-(--glass-border) rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                currentStatus === 'completed' ? 'bg-linear-to-r from-(--accent-success) to-(--accent-emerald)' :
                currentStatus === 'failed' ? 'bg-(--accent-danger)' :
                currentStatus === 'paused' ? 'bg-(--accent-warning)' :
                'bg-linear-to-r from-(--gradient-from) to-(--gradient-to)'
              }`}
              style={{ width: `${currentProgress}%` }}
            />
          </div>
        </div>

        {/* Phase Indicators */}
        <div className="flex justify-between mb-8 gap-2">
          {phaseNames.map((phase, idx) => (
            <div key={phase} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                currentPhase > idx
                  ? 'bg-linear-to-r from-(--accent-success) to-(--accent-emerald) text-white shadow-lg'
                  : currentPhase === idx && isRunning
                    ? 'bg-linear-to-r from-(--gradient-from) to-(--gradient-to) text-white animate-pulse ring-4 ring-(--accent-primary)/20'
                    : 'bg-(--surface) text-(--foreground-muted) border border-(--glass-border)'
              }`}>
                {currentPhase > idx ? <FaCheck /> : idx + 1}
              </div>
              <span className="text-xs mt-2 text-(--foreground-muted) text-center">{phase}</span>
              {currentPhase === idx && isRunning && (
                <span className="text-xs text-(--accent-primary) mt-1 text-center">{phaseDescriptions[idx]}</span>
              )}
            </div>
          ))}
        </div>

        {/* Page Progress */}
        {totalPages > 0 && (
          <div className="mb-8 p-4 rounded-lg bg-(--surface)/50 border border-(--glass-border)">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-foreground">Page Generation</h2>
              {isRunning && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-(--foreground-muted) hidden sm:inline">AI Provider:</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    progress?.page_status === 'failed' || progress?.error
                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                      : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      progress?.page_status === 'failed' || progress?.error
                        ? 'bg-(--accent-danger)'
                        : 'bg-(--accent-success) animate-pulse'
                    }`} />
                    {progress?.page_status === 'failed' || progress?.error ? 'Issues Detected' : 'Operational'}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-(--foreground-muted)">
              <span className="flex items-center gap-1">
                <FaCheck className="text-(--accent-success)" /> {completedPages} completed
              </span>
              {failedPages > 0 && (
                <span className="flex items-center gap-1">
                  <FaExclamationTriangle className="text-(--accent-danger)" /> {failedPages} failed
                </span>
              )}
              <span className="flex items-center gap-1">
                <FaClock className="text-(--foreground-muted)" /> {totalPages - completedPages - failedPages} pending
              </span>
            </div>

            {/* Current page being generated */}
            {progress?.page_title && isRunning && (
              <div className="mt-3 p-2.5 rounded-lg bg-(--accent-primary)/10 border border-(--accent-primary)/30">
                <span className="text-sm text-(--accent-primary)">
                  <FaSpinner className="inline animate-spin mr-2" />
                  Currently generating: {progress.page_title}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Pages List */}
        {jobDetail.pages.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-foreground">Pages</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
              {jobDetail.pages.map((page) => (
                <div
                  key={page.id}
                  className={`p-3 rounded-lg border flex items-center justify-between transition-all ${
                    page.status === 'completed'
                      ? 'bg-(--accent-success)/10 border-(--accent-success)/30'
                      : page.status === 'in_progress'
                        ? 'bg-(--accent-primary)/10 border-(--accent-primary)/30'
                        : page.status === 'failed' || page.status === 'permanent_failed'
                          ? 'bg-(--accent-danger)/10 border-(--accent-danger)/30'
                          : 'bg-(--surface)/30 border-(--glass-border)'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(page.status)}
                    <div>
                      <span className="text-sm font-medium text-foreground">{page.title}</span>
                      {page.last_error && (
                        <p className="text-xs text-(--accent-danger) mt-1">{page.last_error}</p>
                      )}
                    </div>
                  </div>
                  {(page.status === 'failed' || page.status === 'permanent_failed') && (
                    <button
                      onClick={() => handleRetryPage(page.id)}
                      className="flex items-center gap-1 text-sm text-(--accent-primary) hover:text-(--accent-primary)/80 transition-colors"
                    >
                      <FaRedo /> Retry
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          {isRunning && (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-4 py-2 bg-(--accent-warning) text-white rounded-lg hover:bg-(--accent-warning)/90 transition-all shadow-lg hover:shadow-xl"
            >
              <FaPause /> Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-4 py-2 bg-(--accent-success) text-white rounded-lg hover:bg-(--accent-success)/90 transition-all shadow-lg hover:shadow-xl"
            >
              <FaPlay /> Resume
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-(--accent-danger) text-white rounded-lg hover:bg-(--accent-danger)/90 transition-all shadow-lg hover:shadow-xl"
            >
              <FaTimes /> Cancel
            </button>
          )}
          {currentStatus === 'failed' && (
            <button
              onClick={handleRetryJob}
              className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-(--gradient-from) to-(--gradient-to) text-white rounded-lg hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
            >
              <FaRedo /> Retry Job
            </button>
          )}
          {currentStatus === 'completed' && (
            <Link
              href={`/${jobDetail.job.owner}/${jobDetail.job.repo}?type=${jobDetail.job.repo_type}`}
              className="flex items-center gap-2 px-4 py-2 bg-linear-to-r from-(--gradient-from) to-(--gradient-to) text-white rounded-lg hover:opacity-90 transition-all shadow-lg hover:shadow-xl"
            >
              View Wiki
            </Link>
          )}
        </div>

        {/* Error Message */}
        {jobDetail.job.error_message && (
          <div className="mt-6 p-4 rounded-lg bg-(--accent-danger)/10 border border-(--accent-danger)/30">
            <h3 className="text-sm font-semibold text-(--accent-danger) mb-1">Error</h3>
            <p className="text-sm text-(--accent-danger)/90">{jobDetail.job.error_message}</p>
          </div>
        )}

        {/* Info Message */}
        {isRunning && (
          <p className="mt-8 text-sm text-(--foreground-muted) text-center p-4 rounded-lg bg-(--surface)/30 border border-(--glass-border)">
            You can close this page and return later. Your wiki will continue generating in the background.
            <br />
            Bookmark this URL to check progress from any device.
          </p>
        )}

        {/* Stats */}
        {isFinished && jobDetail.job.total_tokens_used > 0 && (
          <div className="mt-8 p-5 rounded-lg bg-(--surface)/50 border border-(--glass-border)">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-(--foreground-muted)">
              <div className="text-center">
                <span className="block text-2xl font-bold text-(--accent-primary)">{totalPages}</span>
                <span className="text-xs">Total Pages</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-(--accent-primary)">{jobDetail.job.total_tokens_used.toLocaleString()}</span>
                <span className="text-xs">Tokens Used</span>
              </div>
              <div className="text-center">
                <span className="block text-2xl font-bold text-(--accent-primary)">
                  {jobDetail.job.started_at && jobDetail.job.completed_at
                    ? Math.round((new Date(jobDetail.job.completed_at).getTime() - new Date(jobDetail.job.started_at).getTime()) / 60000)
                    : '-'}
                </span>
                <span className="text-xs">Minutes</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
