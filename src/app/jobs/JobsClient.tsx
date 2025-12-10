'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import ConfigurationModal from '@/components/ConfigurationModal';
import { FaGithub, FaGitlab, FaBitbucket, FaSync, FaPause, FaPlay, FaTimes, FaEye, FaSpinner, FaExclamationTriangle, FaClock } from 'react-icons/fa';

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

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'preparing_embeddings', label: 'Preparing' },
  { value: 'generating_structure', label: 'Structure' },
  { value: 'generating_pages', label: 'Generating' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function JobsClient({ initialJobs, initialTotal, authRequiredInitial }: { initialJobs: Job[]; initialTotal: number; authRequiredInitial: boolean }) {
  const router = useRouter();
  const { language, setLanguage, supportedLanguages } = useLanguage();

  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 20;

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [repositoryInput] = useState('http://github.com/viettdann/deepwiki-open');
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
  const [authRequired] = useState<boolean>(authRequiredInitial);
  const [authCode, setAuthCode] = useState<string>('');
  const [isAuthLoading] = useState<boolean>(false);

  useEffect(() => {
    setLanguage(selectedLanguage);
  }, [selectedLanguage, setLanguage]);

  const fetchJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', limit.toString());
      params.append('offset', (page * limit).toString());
      const response = await fetch(`/api/wiki/jobs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch jobs');
      const data = await response.json();
      setJobs(data.jobs || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    if (initialJobs.length === 0 || page !== 0 || statusFilter) {
      fetchJobs();
    }
  }, [fetchJobs, initialJobs.length, page, statusFilter]);

  const validateAuthCode = async () => {
    try {
      if (authRequired) {
        if (!authCode) return false;
        const response = await fetch('/api/auth/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: authCode })
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

  const handleGenerateWiki = async () => {
    const validation = await validateAuthCode();
    if (!validation) {
      setIsConfigModalOpen(false);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaEye className="text-blue-500" />;
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

  const handlePause = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/wiki/jobs/${jobId}/pause`, { method: 'POST' });
      fetchJobs();
    } catch {}
  };

  const handleResume = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/wiki/jobs/${jobId}/resume`, { method: 'POST' });
      fetchJobs();
    } catch {}
  };

  const handleCancel = async (jobId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Cancel this job?')) return;
    try {
      await fetch(`/api/wiki/jobs/${jobId}`, { method: 'DELETE' });
      fetchJobs();
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-[var(--surface)]/95 backdrop-blur-xl border-b-2 border-[var(--accent-primary)]/30 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Terminal status bar */}
          <div className="h-7 flex items-center justify-between border-b border-[var(--accent-primary)]/10 text-xs font-mono">
            <div className="flex items-center gap-4 text-[var(--foreground-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-emerald)] animate-pulse"></span>
                JOBS.MONITOR
              </span>
              <span className="hidden sm:block">|</span>
              <span className="hidden sm:block text-[var(--accent-cyan)]">{total} ACTIVE</span>
            </div>
            <div className="flex items-center gap-2 text-[var(--accent-primary)]">
              <span className="hidden sm:block">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
            </div>
          </div>

          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] rounded blur-sm opacity-40 group-hover:opacity-60 transition-opacity"></div>
                <div className="relative bg-[var(--accent-primary)] p-2 rounded border border-[var(--accent-primary)]/50">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white"><path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" /></svg>
                </div>
              </div>
              <div className="leading-tight">
                <p className="text-base font-bold font-mono tracking-tight text-[var(--foreground)]">
                  <span className="text-[var(--accent-cyan)]">$</span> DeepWiki
                </p>
                <p className="text-[10px] font-mono text-[var(--foreground-muted)] tracking-wider">
                  &#47;&#47; Job monitoring
                </p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium">
              <Link href="/" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors flex items-center gap-1">
                <span className="text-[var(--accent-primary)]">01</span> Home
              </Link>
              <Link href="/wiki/projects" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors flex items-center gap-1">
                <span className="text-[var(--accent-primary)]">02</span> Wiki Index
              </Link>
              <Link href="/jobs" className="text-[var(--accent-cyan)] transition-colors flex items-center gap-2">
                <span className="text-[var(--accent-primary)]">03</span> Jobs
                <span className="w-1.5 h-1.5 bg-[var(--accent-emerald)] rounded-full pulse-glow"></span>
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <button onClick={() => fetchJobs()} className="p-2 text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors rounded border border-transparent hover:border-[var(--accent-primary)]/30" title="Refresh">
                <FaSync className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setIsConfigModalOpen(true)} className="hidden md:inline-flex items-center gap-2 px-4 py-1.5 rounded border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-xs font-mono font-medium transition-all hover:border-[var(--accent-primary)] terminal-btn">
                Generate
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-6 flex items-center gap-4">
            <label className="text-sm font-medium text-[var(--foreground)]">Status:</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }} className="input-glass px-3 py-2.5 rounded-lg bg-[var(--surface)]/50 border border-[var(--glass-border)] text-[var(--foreground)] text-sm focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/20 transition-colors">
              {statusFilters.map(f => (<option key={f.value} value={f.value}>{f.label}</option>))}
            </select>
            <span className="text-sm text-[var(--foreground-muted)] ml-auto">{total} job{total !== 1 ? 's' : ''} found</span>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">{error}</div>
          )}

          {isLoading && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-12"><FaSpinner className="text-4xl text-blue-500 animate-spin" /></div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12"><p className="text-[var(--muted-foreground)]">No jobs found</p><Link href="/" className="text-blue-500 hover:underline mt-2 inline-block">Generate a new wiki</Link></div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => (
                <div key={job.id} onClick={() => router.push(`/wiki/job/${job.id}`)} className="rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm shadow-lg overflow-hidden hover:border-[var(--accent-primary)]/40 cursor-pointer transition-all">
                  {/* Terminal header */}
                  <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-4 py-2 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                        <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                      </div>
                      <span className="text-[var(--accent-cyan)]">{getRepoIcon(job.repo_type)}</span>
                      <h3 className="text-sm font-bold font-mono text-[var(--foreground)]">{job.owner}/{job.repo}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-mono ${getStatusColor(job.status)}`}>{job.status.replace(/_/g, ' ')}</span>
                      {getStatusIcon(job.status)}
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-mono text-[var(--muted-foreground)] mb-3">{job.provider} / {job.model || 'default'} • {job.language.toUpperCase()}</p>
                  {['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(job.status) && (
                    <div className="mt-3">
                      <div className="flex justify_between text-xs text-[var(--muted-foreground)] mb-1"><span>Phase {job.current_phase + 1}/3</span><span>{Math.round(job.progress_percent)}%</span></div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${job.progress_percent}%` }} /></div>
                      {job.total_pages > 0 && (<p className="text-xs text-[var(--muted-foreground)] mt-1">{job.completed_pages}/{job.total_pages} pages{job.failed_pages > 0 && ` (${job.failed_pages} failed)`}</p>)}
                    </div>
                  )}
                  {job.error_message && (<p className="mt-2 text-xs text-red-500 truncate">{job.error_message}</p>)}
                  <div className="mt-3 flex items-center justify_between">
                    <span className="text-xs text-[var(--muted-foreground)]">{formatDate(job.created_at)}</span>
                    <div className="flex items-center gap-2">
                      {['pending', 'preparing_embeddings', 'generating_structure', 'generating_pages'].includes(job.status) && (
                        <button onClick={(e) => handlePause(job.id, e)} className="p-1.5 text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded" title="Pause"><FaPause className="text-sm" /></button>
                      )}
                      {job.status === 'paused' && (
                        <button onClick={(e) => handleResume(job.id, e)} className="p-1.5 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/30 rounded" title="Resume"><FaPlay className="text-sm" /></button>
                      )}
                      {!['completed', 'failed', 'cancelled'].includes(job.status) && (
                        <button onClick={(e) => handleCancel(job.id, e)} className="p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded" title="Cancel"><FaTimes className="text-sm" /></button>
                      )}
                      {job.status === 'completed' && (
                        <Link href={`/${job.owner}/${job.repo}?type=${job.repo_type}`} onClick={(e) => e.stopPropagation()} className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded" title="View Wiki"><FaEye className="text-sm" /></Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1 rounded border border-[var(--border-color)] text-sm disabled:opacity-50">Previous</button>
              <span className="text-sm text-[var(--muted-foreground)]">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1 rounded border border-[var(--border-color)] text-sm disabled:opacity-50">Next</button>
            </div>
          )}
        </div>
      </main>

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

      <footer className="bg-[var(--surface)]/90 border-t-2 border-[var(--accent-primary)]/20 backdrop-blur mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs font-mono text-[var(--foreground-muted)]">
              <span className="text-[var(--accent-primary)]">◆</span> © 2024 DeepWiki. All rights reserved.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://github.com/viettdann/deepwiki-open" target="_blank" rel="noopener noreferrer" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors p-2 rounded border border-transparent hover:border-[var(--accent-primary)]/30">
                <FaGithub />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
