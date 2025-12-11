'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import ConfigurationModal from '@/components/ConfigurationModal';
import { RoleBasedButton } from '@/components/RoleBasedButton';
import { FaCheck, FaExclamationTriangle, FaSpinner, FaClock, FaPause, FaTimes, FaPlay, FaEye, FaGithub, FaGitlab, FaBitbucket, FaTrash } from 'react-icons/fa';
import Header from '@/components/Header';

interface Job {
  id: string;
  repo_url: string;
  repo_type: string;
  owner: string;
  repo: string;
  provider: string;
  model?: string;
  language: string;
  is_comprehensive: boolean;
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
}

interface JobListResponse {
  jobs: Job[];
  total: number;
}

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing_embeddings', label: 'Preparing' },
  { value: 'generating_structure', label: 'Structure' },
  { value: 'generating_pages', label: 'Generating' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'partially_completed', label: 'Partial' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function JobsPage() {
  const router = useRouter();
  const { language, setLanguage, supportedLanguages } = useLanguage();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  // Modal state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [repositoryInput, setRepositoryInput] = useState('http://github.com/viettdann/deepwiki-open');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [isComprehensiveView, setIsComprehensiveView] = useState<boolean>(true);
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModel, setCustomModel] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<'github' | 'gitlab' | 'bitbucket' | 'azure'>('github');
  const [accessToken, setAccessToken] = useState('');
  const [branch, setBranch] = useState('main');
  const [excludedDirs, setExcludedDirs] = useState('');
  const [excludedFiles, setExcludedFiles] = useState('');
  const [includedDirs, setIncludedDirs] = useState('');
  const [includedFiles, setIncludedFiles] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authCode, setAuthCode] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', limit.toString());
      params.append('offset', (page * limit).toString());

      const response = await fetch(`/api/wiki/jobs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch jobs');

      const data: JobListResponse = await response.json();
      setJobs(data.jobs);
      setTotal(data.total);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    setLanguage(selectedLanguage);
  }, [selectedLanguage, setLanguage]);

  // Fetch authentication status
  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        setIsAuthLoading(true);
        const response = await fetch('/api/auth/status');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        setAuthRequired(data.auth_required);
      } catch (err) {
        console.error("Failed to fetch auth status:", err);
        setAuthRequired(true);
      } finally {
        setIsAuthLoading(false);
      }
    };
    fetchAuthStatus();
  }, []);

  // Auto-refresh for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(j =>
      ['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(j.status)
    );

    if (hasActiveJobs) {
      const interval = setInterval(fetchJobs, 10000);
      return () => clearInterval(interval);
    }
  }, [jobs, fetchJobs]);

  const handlePause = async (jobId: string) => {
    try {
      await fetch(`/api/wiki/jobs/${jobId}/pause`, { method: 'POST' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to pause job:', e);
    }
  };

  const handleResume = async (jobId: string) => {
    try {
      await fetch(`/api/wiki/jobs/${jobId}/resume`, { method: 'POST' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to resume job:', e);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('Cancel this job?')) return;
    try {
      await fetch(`/api/wiki/jobs/${jobId}`, { method: 'DELETE' });
      fetchJobs();
    } catch (e) {
      console.error('Failed to cancel job:', e);
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to permanently delete this job? This action cannot be undone.')) return;
    try {
      const response = await fetch(`/api/wiki/jobs/${jobId}/delete`, { method: 'POST' });
      if (response.ok) {
        fetchJobs();
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
        return <FaCheck className="text-green-500" />;
      case 'pending':
      case 'preparing_embeddings':
      case 'generating_structure':
      case 'generating_pages':
        return <FaSpinner className="text-blue-500 animate-spin" />;
      case 'paused':
        return <FaPause className="text-yellow-500" />;
      case 'failed':
        return <FaExclamationTriangle className="text-red-500" />;
      case 'cancelled':
        return <FaTimes className="text-gray-500" />;
      default:
        return <FaClock className="text-gray-400" />;
    }
  };

  const getRepoIcon = (type: string) => {
    switch (type) {
      case 'github':
        return <FaGithub />;
      case 'gitlab':
        return <FaGitlab />;
      case 'bitbucket':
        return <FaBitbucket />;
      default:
        return <FaGithub />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'partially_completed':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / limit);

  const validateAuthCode = async () => {
    try {
      if(authRequired) {
        if(!authCode) return false;
        const response = await fetch('/api/auth/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({'code': authCode})
        });
        if (!response.ok) return false;
        const data = await response.json();
        return data.success || false;
      }
    } catch {
      return false;
    }
    return true;
  };

  const handleGenerateWiki = async () => {
    const validation = await validateAuthCode();
    if(!validation) {
      console.error(`Failed to validate the authorization code`);
      setIsConfigModalOpen(false);
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    const parseRepositoryInput = (input: string): {
      owner: string,
      repo: string,
      type: string,
      fullPath?: string,
      localPath?: string
    } | null => {
      input = input.trim();
      let owner = '', repo = '', type = 'github', fullPath;
      let localPath: string | undefined;

      const windowsPathRegex = /^[a-zA-Z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*$/;
      const customGitRegex = /^(?:https?:\/\/)?([^\/]+)\/(.+?)\/([^\/]+)(?:\.git)?\/?$/;

      if (windowsPathRegex.test(input)) {
        type = 'local';
        localPath = input;
        repo = input.split('\\').pop() || 'local-repo';
        owner = 'local';
      } else if (input.startsWith('/')) {
        type = 'local';
        localPath = input;
        repo = input.split('/').filter(Boolean).pop() || 'local-repo';
        owner = 'local';
      } else if (customGitRegex.test(input)) {
        const domain = input.match(/(?:https?:\/\/)?([^\/]+)/)?.[1] || '';
        if (domain.includes('github.com')) {
          type = 'github';
        } else if (domain.includes('gitlab.com') || domain.includes('gitlab.')) {
          type = 'gitlab';
        } else if (domain.includes('bitbucket.org') || domain.includes('bitbucket.')) {
          type = 'bitbucket';
        } else if (domain.includes('dev.azure.com') || domain.includes('visualstudio.com')) {
          type = 'azure';
        } else {
          type = 'web';
        }

        // Extract path from URL
        const pathMatch = input.match(/(?:https?:\/\/)?[^\/]+\/(.+?)(?:\.git)?\/?$/);
        fullPath = pathMatch?.[1] || '';
        const parts = fullPath.split('/');

        // Special handling for Azure DevOps URLs
        // Format: {organization}/{project}/_git/{repository}
        if (type === 'azure' && parts.includes('_git')) {
          const gitIndex = parts.indexOf('_git');
          if (gitIndex >= 1 && gitIndex + 1 < parts.length) {
            owner = parts[gitIndex - 1]; // project name
            repo = parts[gitIndex + 1]; // repository name
          }
        } else if (parts.length >= 2) {
          repo = parts[parts.length - 1] || '';
          owner = parts[parts.length - 2] || '';
        }
      } else {
        return null;
      }

      if (!owner || !repo) return null;

      owner = owner.trim();
      repo = repo.trim();

      if (repo.endsWith('.git')) {
        repo = repo.slice(0, -4);
      }

      return { owner, repo, type, fullPath, localPath };
    };

    const parsedRepo = parseRepositoryInput(repositoryInput);
    if (!parsedRepo) {
      setIsSubmitting(false);
      return;
    }

    const { owner, repo } = parsedRepo;
    const params = new URLSearchParams();
    if (accessToken) params.append('token', accessToken);
    params.append('type', selectedPlatform || 'github');
    params.append('repo_url', encodeURIComponent(repositoryInput));
    params.append('provider', provider);
    params.append('model', model);
    if (isCustomModel && customModel) params.append('custom_model', customModel);
    if (branch && branch !== 'main') params.append('branch', branch);
    if (excludedDirs) params.append('excluded_dirs', excludedDirs);
    if (excludedFiles) params.append('excluded_files', excludedFiles);
    if (includedDirs) params.append('included_dirs', includedDirs);
    if (includedFiles) params.append('included_files', includedFiles);
    params.append('language', selectedLanguage);
    params.append('comprehensive', isComprehensiveView.toString());

    const queryString = params.toString() ? `?${params.toString()}` : '';
    router.push(`/${owner}/${repo}${queryString}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        currentPage="jobs"
        statusLabel="SYSTEM.JOBS"
        showRefresh={true}
        onRefreshClick={() => window.location.reload()}
        actionLabel="Generate Wiki"
        onActionClick={() => setIsConfigModalOpen(true)}
      />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Filters */}
        <div className="mb-6 flex items-center gap-4">
          <label className="text-sm font-medium text-[var(--foreground)]">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="input-glass px-3 py-2.5 rounded-lg bg-[var(--surface)]/50 border border-[var(--glass-border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/20 transition-colors"
          >
            {statusFilters.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
          <span className="text-sm text-[var(--foreground-muted)] ml-auto">
            {total} job{total !== 1 ? 's' : ''} found
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Jobs List */}
        {isLoading && jobs.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <FaSpinner className="text-4xl text-blue-500 animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--muted-foreground)]">No jobs found</p>
            <Link href="/" className="text-blue-500 hover:underline mt-2 inline-block">
              Generate a new wiki
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => router.push(`/wiki/job/${job.id}`)}
                className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border-color)] hover:border-[var(--accent-primary)] cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[var(--muted-foreground)]">
                      {getRepoIcon(job.repo_type)}
                    </span>
                    <div>
                      <h3 className="font-medium text-[var(--foreground)]">
                        {job.owner}/{job.repo}
                      </h3>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {job.provider} / {job.model || 'default'} &bull; {job.language.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}>
                      {job.status.replace(/_/g, ' ')}
                    </span>
                    {getStatusIcon(job.status)}
                  </div>
                </div>

                {/* Progress */}
                {['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(job.status) && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-1">
                      <span>Phase {job.current_phase + 1}/3</span>
                      <span>{Math.round(job.progress_percent)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${job.progress_percent}%` }}
                      />
                    </div>
                    {job.total_pages > 0 && (
                      <p className="text-xs text-[var(--muted-foreground)] mt-1">
                        {job.completed_pages}/{job.total_pages} pages
                        {job.failed_pages > 0 && ` (${job.failed_pages} failed)`}
                      </p>
                    )}
                  </div>
                )}

                {/* Error */}
                {job.error_message && (
                  <p className="mt-2 text-xs text-red-500 truncate">{job.error_message}</p>
                )}

                {/* Actions & Meta */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {formatDate(job.created_at)}
                  </span>
                  <div className="flex items-center gap-2">
                    {['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(job.status) && (
                      <RoleBasedButton
                        onAdminClick={(e) => { e.stopPropagation(); handlePause(job.id); }}
                        actionDescription={`pause job "${job.repo}"`}
                        className="p-1.5 text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded"
                        title="Pause"
                      >
                        <FaPause className="text-sm" />
                      </RoleBasedButton>
                    )}
                    {job.status === 'paused' && (
                      <RoleBasedButton
                        onAdminClick={(e) => { e.stopPropagation(); handleResume(job.id); }}
                        actionDescription={`resume job "${job.repo}"`}
                        className="p-1.5 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                        title="Resume"
                      >
                        <FaPlay className="text-sm" />
                      </RoleBasedButton>
                    )}
                    {!['completed', 'partially_completed', 'failed', 'cancelled'].includes(job.status) && (
                      <RoleBasedButton
                        onAdminClick={(e) => { e.stopPropagation(); handleCancel(job.id); }}
                        actionDescription={`cancel job "${job.repo}"`}
                        className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                        title="Cancel"
                      >
                        <FaTimes className="text-sm" />
                      </RoleBasedButton>
                    )}
                    {(job.status === 'completed' || job.status === 'partially_completed') && (
                      <Link
                        href={`/${job.owner}/${job.repo}?type=${job.repo_type}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                        title={job.status === 'partially_completed' ? 'View Partial Wiki (some pages failed)' : 'View Wiki'}
                      >
                        <FaEye className="text-sm" />
                      </Link>
                    )}
                    {['completed', 'partially_completed', 'failed', 'cancelled'].includes(job.status) && (
                      <RoleBasedButton
                        onAdminClick={(e) => { e.stopPropagation(); handleDelete(job.id); }}
                        actionDescription={`permanently delete job "${job.repo}"`}
                        className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                        title="Delete Job"
                      >
                        <FaTrash className="text-sm" />
                      </RoleBasedButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border border-[var(--border-color)] text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-[var(--muted-foreground)]">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border border-[var(--border-color)] text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
        </div>
      </main>

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        repositoryInput={repositoryInput}
        setRepositoryInput={setRepositoryInput}
        selectedLanguage={selectedLanguage}
        setSelectedLanguage={setSelectedLanguage}
        supportedLanguages={supportedLanguages}
        isComprehensiveView={isComprehensiveView}
        setIsComprehensiveView={setIsComprehensiveView}
        provider={provider}
        setProvider={setProvider}
        model={model}
        setModel={setModel}
        isCustomModel={isCustomModel}
        setIsCustomModel={setIsCustomModel}
        customModel={customModel}
        setCustomModel={setCustomModel}
        selectedPlatform={selectedPlatform}
        setSelectedPlatform={setSelectedPlatform}
        accessToken={accessToken}
        setAccessToken={setAccessToken}
        branch={branch}
        setBranch={setBranch}
        excludedDirs={excludedDirs}
        setExcludedDirs={setExcludedDirs}
        excludedFiles={excludedFiles}
        setExcludedFiles={setExcludedFiles}
        includedDirs={includedDirs}
        setIncludedDirs={setIncludedDirs}
        includedFiles={includedFiles}
        setIncludedFiles={setIncludedFiles}
        onSubmit={handleGenerateWiki}
        isSubmitting={isSubmitting}
        authRequired={authRequired}
        authCode={authCode}
        setAuthCode={setAuthCode}
        isAuthLoading={isAuthLoading}
      />

      {/* Footer */}
      <footer className="bg-[var(--surface)] border-t border-[var(--glass-border)] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              © 2024 DeepWiki. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/viettdann/deepwiki-open"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--foreground-muted)] hover:text-[var(--accent-primary)] transition-colors"
              >
                <FaGithub />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
