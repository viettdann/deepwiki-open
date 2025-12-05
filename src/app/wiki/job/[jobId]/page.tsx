'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
// import { useLanguage } from '@/contexts/LanguageContext';
import ThemeToggle from '@/components/theme-toggle';
import { FaHome, FaPause, FaPlay, FaTimes, FaCheck, FaExclamationTriangle, FaSpinner, FaClock, FaRedo } from 'react-icons/fa';

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

      // If completed, redirect to wiki page after a short delay
      if (data.job.status === 'completed') {
        setTimeout(() => {
          router.push(`/${data.job.owner}/${data.job.repo}?type=${data.job.repo_type}`);
        }, 2000);
      }

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
        return <FaCheck className="text-green-500" />;
      case 'in_progress':
        return <FaSpinner className="text-blue-500 animate-spin" />;
      case 'failed':
      case 'permanent_failed':
        return <FaExclamationTriangle className="text-red-500" />;
      case 'pending':
        return <FaClock className="text-gray-400" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <FaSpinner className="text-4xl text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4">
        <FaExclamationTriangle className="text-6xl text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">Error</h1>
        <p className="text-[var(--muted-foreground)] mb-4">{error}</p>
        <Link href="/jobs" className="text-blue-500 hover:underline">
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
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-[var(--background)]/80 border-b border-[var(--border-color)]">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--foreground)] hover:text-[var(--accent-primary)]">
              <FaHome className="text-xl" />
            </Link>
            <h1 className="text-lg font-semibold text-[var(--foreground)]">
              Wiki Generation: {jobDetail.job.owner}/{jobDetail.job.repo}
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/jobs" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              All Jobs
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Badge */}
        <div className="mb-6 flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            currentStatus === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
            currentStatus === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
            currentStatus === 'cancelled' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
            currentStatus === 'paused' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
          }`}>
            {currentStatus.replace(/_/g, ' ').toUpperCase()}
          </span>
          {jobDetail.job.provider && (
            <span className="px-2 py-1 rounded bg-[var(--background)] border border-[var(--border-color)] text-xs text-[var(--muted-foreground)]">
              {jobDetail.job.provider} / {jobDetail.job.model || 'default'}
            </span>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-[var(--foreground)]">{currentMessage}</span>
            <span className="text-sm font-medium text-[var(--foreground)]">{Math.round(currentProgress)}%</span>
          </div>
          <div className="w-full bg-[var(--background)] border border-[var(--border-color)] rounded-full h-4 overflow-hidden">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                currentStatus === 'completed' ? 'bg-green-500' :
                currentStatus === 'failed' ? 'bg-red-500' :
                currentStatus === 'paused' ? 'bg-yellow-500' :
                'bg-blue-500'
              }`}
              style={{ width: `${currentProgress}%` }}
            />
          </div>
        </div>

        {/* Phase Indicators */}
        <div className="flex justify-between mb-8">
          {phaseNames.map((phase, idx) => (
            <div key={phase} className="flex flex-col items-center flex-1">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold transition-colors ${
                currentPhase > idx
                  ? 'bg-green-500'
                  : currentPhase === idx && isRunning
                    ? 'bg-blue-500 animate-pulse ring-4 ring-blue-500/20'
                    : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
              }`}>
                {currentPhase > idx ? <FaCheck /> : idx + 1}
              </div>
              <span className="text-sm mt-2 text-[var(--muted-foreground)]">{phase}</span>
              {currentPhase === idx && isRunning && (
                <span className="text-xs text-blue-500 mt-1">{phaseDescriptions[idx]}</span>
              )}
            </div>
          ))}
        </div>

        {/* Page Progress */}
        {totalPages > 0 && (
          <div className="mb-8 p-4 rounded-lg bg-[var(--background)] border border-[var(--border-color)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Page Generation</h2>
              {isRunning && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)] hidden sm:inline">AI Provider:</span>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    progress?.page_status === 'failed' || progress?.error
                      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                      : 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      progress?.page_status === 'failed' || progress?.error
                        ? 'bg-red-500' 
                        : 'bg-green-500 animate-pulse'
                    }`} />
                    {progress?.page_status === 'failed' || progress?.error ? 'Issues Detected' : 'Operational'}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
              <span className="flex items-center gap-1">
                <FaCheck className="text-green-500" /> {completedPages} completed
              </span>
              {failedPages > 0 && (
                <span className="flex items-center gap-1">
                  <FaExclamationTriangle className="text-red-500" /> {failedPages} failed
                </span>
              )}
              <span className="flex items-center gap-1">
                <FaClock className="text-gray-400" /> {totalPages - completedPages - failedPages} pending
              </span>
            </div>

            {/* Current page being generated */}
            {progress?.page_title && isRunning && (
              <div className="mt-3 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <span className="text-sm text-blue-700 dark:text-blue-300">
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
            <h2 className="text-lg font-semibold mb-3 text-[var(--foreground)]">Pages</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {jobDetail.pages.map((page) => (
                <div
                  key={page.id}
                  className={`p-3 rounded-lg border flex items-center justify-between ${
                    page.status === 'completed'
                      ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                      : page.status === 'in_progress'
                        ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                        : page.status === 'failed' || page.status === 'permanent_failed'
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                          : 'bg-[var(--background)] border-[var(--border-color)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(page.status)}
                    <div>
                      <span className="text-sm font-medium text-[var(--foreground)]">{page.title}</span>
                      {page.last_error && (
                        <p className="text-xs text-red-500 mt-1">{page.last_error}</p>
                      )}
                    </div>
                  </div>
                  {(page.status === 'failed' || page.status === 'permanent_failed') && (
                    <button
                      onClick={() => handleRetryPage(page.id)}
                      className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-700"
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
        <div className="flex gap-3">
          {isRunning && (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
            >
              <FaPause /> Pause
            </button>
          )}
          {isPaused && (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <FaPlay /> Resume
            </button>
          )}
          {(isRunning || isPaused) && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <FaTimes /> Cancel
            </button>
          )}
          {currentStatus === 'failed' && (
            <button
              onClick={handleRetryJob}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <FaRedo /> Retry Job
            </button>
          )}
          {currentStatus === 'completed' && (
            <Link
              href={`/${jobDetail.job.owner}/${jobDetail.job.repo}?type=${jobDetail.job.repo_type}`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              View Wiki
            </Link>
          )}
        </div>

        {/* Error Message */}
        {jobDetail.job.error_message && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Error</h3>
            <p className="text-sm text-red-600 dark:text-red-400">{jobDetail.job.error_message}</p>
          </div>
        )}

        {/* Info Message */}
        {isRunning && (
          <p className="mt-8 text-sm text-[var(--muted-foreground)] text-center">
            You can close this page and return later. Your wiki will continue generating in the background.
            <br />
            Bookmark this URL to check progress from any device.
          </p>
        )}

        {/* Stats */}
        {isFinished && jobDetail.job.total_tokens_used > 0 && (
          <div className="mt-8 p-4 rounded-lg bg-[var(--background)] border border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Statistics</h3>
            <div className="grid grid-cols-3 gap-4 text-sm text-[var(--muted-foreground)]">
              <div>
                <span className="block text-lg font-bold text-[var(--foreground)]">{totalPages}</span>
                Total Pages
              </div>
              <div>
                <span className="block text-lg font-bold text-[var(--foreground)]">{jobDetail.job.total_tokens_used.toLocaleString()}</span>
                Tokens Used
              </div>
              <div>
                <span className="block text-lg font-bold text-[var(--foreground)]">
                  {jobDetail.job.started_at && jobDetail.job.completed_at
                    ? Math.round((new Date(jobDetail.job.completed_at).getTime() - new Date(jobDetail.job.started_at).getTime()) / 60000)
                    : '-'} min
                </span>
                Duration
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
