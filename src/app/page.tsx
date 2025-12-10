'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Mermaid from '../components/Mermaid';
import ConfigurationModal from '@/components/ConfigurationModal';
import { extractUrlPath, extractUrlDomain } from '@/utils/urlDecoder';
import { useLanguage } from '@/contexts/LanguageContext';

// SVG Icons - Inline to avoid external dependencies


const GitHubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
  </svg>
);

const GitLabIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 21.42l3.684-11.333h-7.368L12 21.42z"/>
    <path d="M3.16 10.087l-.657 2.02a.858.858 0 00.311.96L12 21.42 3.16 10.087z"/>
    <path d="M3.16 10.087h5.155L6.257 3.116a.429.429 0 00-.817 0L3.16 10.087z"/>
    <path d="M20.84 10.087l.657 2.02a.858.858 0 01-.311.96L12 21.42l8.84-11.333z"/>
    <path d="M20.84 10.087h-5.155l2.058-6.971a.429.429 0 01.817 0l2.28 6.971z"/>
  </svg>
);

const BitbucketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M2.65 3.23A.6.6 0 002 3.83v.03l2.88 16.47a.82.82 0 00.79.67h12.66a.6.6 0 00.59-.5l2.88-16.5v-.03a.6.6 0 00-.6-.67zm10.87 11.43H9.14l-1.24-6.44h7.18z"/>
  </svg>
);

const AzureIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M13.05 4.24L7.49 18.3l5.56.01 8.11-3.43-8.11-10.64zM2.84 18.3h7.5l4.95-5.82L10.2 5.76 2.84 18.3z"/>
  </svg>
);

const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 0 1 .721.544l.813 2.846a3.75 3.75 0 0 0 2.576 2.576l2.846.813a.75.75 0 0 1 0 1.442l-2.846.813a3.75 3.75 0 0 0-2.576 2.576l-.813 2.846a.75.75 0 0 1-1.442 0l-.813-2.846a3.75 3.75 0 0 0-2.576-2.576l-2.846-.813a.75.75 0 0 1 0-1.442l2.846-.813A3.75 3.75 0 0 0 7.466 7.89l.813-2.846A.75.75 0 0 1 9 4.5ZM18 1.5a.75.75 0 0 1 .728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 0 1 0 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 0 1-1.456 0l-.258-1.036a2.625 2.625 0 0 0-1.91-1.91l-1.036-.258a.75.75 0 0 1 0-1.456l1.036-.258a2.625 2.625 0 0 0 1.91-1.91l.258-1.036A.75.75 0 0 1 18 1.5ZM16.5 15a.75.75 0 0 1 .712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 0 1 0 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 0 1-1.422 0l-.395-1.183a1.5 1.5 0 0 0-.948-.948l-1.183-.395a.75.75 0 0 1 0-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0 1 16.5 15Z" clipRule="evenodd" />
  </svg>
);

const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M2.25 13.5a8.25 8.25 0 0 1 8.25-8.25.75.75 0 0 1 .75.75v6.75H18a.75.75 0 0 1 .75.75 8.25 8.25 0 0 1-16.5 0Z" clipRule="evenodd" />
    <path fillRule="evenodd" d="M12.75 3a.75.75 0 0 1 .75-.75 8.25 8.25 0 0 1 8.25 8.25.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3Z" clipRule="evenodd" />
  </svg>
);

const BoltIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z" clipRule="evenodd" />
  </svg>
);

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
    <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
  </svg>
);

// Demo mermaid charts
const DEMO_FLOW_CHART = `graph TD
  A[Code Repository] --> B[DeepWiki]
  B --> C[Architecture Diagrams]
  B --> D[Component Relationships]
  B --> E[Data Flow]
  B --> F[Process Workflows]

  style A fill:#f9d3a9,stroke:#d86c1f
  style B fill:#d4a9f9,stroke:#6c1fd8
  style C fill:#a9f9d3,stroke:#1fd86c
  style D fill:#a9d3f9,stroke:#1f6cd8
  style E fill:#f9a9d3,stroke:#d81f6c
  style F fill:#d3f9a9,stroke:#6cd81f`;

export default function Home() {
  const router = useRouter();
  const { language, setLanguage, messages, supportedLanguages } = useLanguage();

  // Translation helper
  const t = (key: string, params: Record<string, string | number> = {}): string => {
    const keys = key.split('.');
    let value: unknown = messages;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    if (typeof value === 'string') {
      return Object.entries(params).reduce((acc: string, [paramKey, paramValue]) => {
        return acc.replace(`{${paramKey}}`, String(paramValue));
      }, value);
    }
    return key;
  };

  const [repositoryInput, setRepositoryInput] = useState('https://github.com/viettdann/deepwiki-open');
  const REPO_CONFIG_CACHE_KEY = 'deepwikiRepoConfigCache';

  // State management
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModel, setCustomModel] = useState<string>('');
  const [isComprehensiveView, setIsComprehensiveView] = useState<boolean>(true);
  const [excludedDirs, setExcludedDirs] = useState('');
  const [excludedFiles, setExcludedFiles] = useState('');
  const [includedDirs, setIncludedDirs] = useState('');
  const [includedFiles, setIncludedFiles] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<'github' | 'gitlab' | 'bitbucket' | 'azure'>('github');
  const [accessToken, setAccessToken] = useState('');
  const [branch, setBranch] = useState('main');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [authRequired, setAuthRequired] = useState<boolean>(false);
  const [authCode, setAuthCode] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  // Load config from cache
  const loadConfigFromCache = (repoUrl: string) => {
    if (!repoUrl) return;
    try {
      const cachedConfigs = localStorage.getItem(REPO_CONFIG_CACHE_KEY);
      if (cachedConfigs) {
        const configs = JSON.parse(cachedConfigs);
        const config = configs[repoUrl.trim()];
        if (config) {
          setSelectedLanguage(config.selectedLanguage || language);
          setIsComprehensiveView(config.isComprehensiveView === undefined ? true : config.isComprehensiveView);
          setProvider(config.provider || '');
          setModel(config.model || '');
          setIsCustomModel(config.isCustomModel || false);
          setCustomModel(config.customModel || '');
          setSelectedPlatform(config.selectedPlatform || 'github');
          setExcludedDirs(config.excludedDirs || '');
          setExcludedFiles(config.excludedFiles || '');
          setIncludedDirs(config.includedDirs || '');
          setIncludedFiles(config.includedFiles || '');
        }
      }
    } catch (error) {
      console.error('Error loading config from localStorage:', error);
    }
  };

  const handleRepositoryInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newRepoUrl = e.target.value;
    setRepositoryInput(newRepoUrl);
    if (newRepoUrl.trim() !== "") {
      loadConfigFromCache(newRepoUrl);
    }
  };

  useEffect(() => {
    if (repositoryInput) {
      loadConfigFromCache(repositoryInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Parse repository input
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
      const domain = extractUrlDomain(input);
      if (domain?.includes('github.com')) {
        type = 'github';
      } else if (domain?.includes('gitlab.com') || domain?.includes('gitlab.')) {
        type = 'gitlab';
      } else if (domain?.includes('bitbucket.org') || domain?.includes('bitbucket.')) {
        type = 'bitbucket';
      } else if (domain?.includes('dev.azure.com') || domain?.includes('visualstudio.com')) {
        type = 'azure';
      } else {
        type = 'web';
      }

      fullPath = extractUrlPath(input)?.replace(/\.git$/, '');
      const parts = fullPath?.split('/') ?? [];

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
      console.error('Unsupported URL format:', input);
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

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedRepo = parseRepositoryInput(repositoryInput);
    if (!parsedRepo) {
      setError('Invalid repository format. Use "owner/repo", GitHub/GitLab/BitBucket URL, or a local folder path like "/path/to/folder" or "C:\\path\\to\\folder".');
      return;
    }
    setError(null);
    setIsConfigModalOpen(true);
  };

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
      setError(`Failed to validate the authorization code`);
      console.error(`Failed to validate the authorization code`);
      setIsConfigModalOpen(false);
      return;
    }

    if (isSubmitting) {
      console.log('Form submission already in progress, ignoring duplicate click');
      return;
    }

    try {
      const currentRepoUrl = repositoryInput.trim();
      if (currentRepoUrl) {
        const existingConfigs = JSON.parse(localStorage.getItem(REPO_CONFIG_CACHE_KEY) || '{}');
        const configToSave = {
          selectedLanguage, isComprehensiveView, provider, model,
          isCustomModel, customModel, selectedPlatform, excludedDirs,
          excludedFiles, includedDirs, includedFiles,
        };
        existingConfigs[currentRepoUrl] = configToSave;
        localStorage.setItem(REPO_CONFIG_CACHE_KEY, JSON.stringify(existingConfigs));
      }
    } catch (error) {
      console.error('Error saving config to localStorage:', error);
    }

    setIsSubmitting(true);
    const parsedRepo = parseRepositoryInput(repositoryInput);

    if (!parsedRepo) {
      setError('Invalid repository format. Use "owner/repo", GitHub/GitLab/BitBucket URL, or a local folder path like "/path/to/folder" or "C:\\path\\to\\folder".');
      setIsSubmitting(false);
      return;
    }

    const { owner, repo, type, localPath } = parsedRepo;
    const params = new URLSearchParams();

    if (accessToken) params.append('token', accessToken);
    params.append('type', (type == 'local' ? type : selectedPlatform) || 'github');
    if (localPath) {
      params.append('local_path', encodeURIComponent(localPath));
    } else {
      params.append('repo_url', encodeURIComponent(repositoryInput));
    }
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
    <>
      {/* Main Content */}
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
          <div className="max-w-5xl mx-auto">
            {/* Hero Text */}
            <div className="text-center mb-12 fade-in-up">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-[var(--glass-border)] mb-6">
                <SparklesIcon />
                <span className="text-sm font-medium text-[var(--foreground-muted)]">AI-Powered Documentation Generator</span>
              </div>

              <h2 className="text-5xl md:text-6xl font-bold font-[family-name:var(--font-display)] mb-6 leading-tight">
                Transform Your Code into{' '}
                <span className="gradient-text">Interactive Wikis</span>
              </h2>

              <p className="text-lg text-[var(--foreground-muted)] max-w-2xl mx-auto mb-12">
                {t('home.description')}
              </p>

              {/* Repository Input - Terminal Style */}
              <form onSubmit={handleFormSubmit} className="max-w-2xl mx-auto mb-8">
                <div className="rounded-lg border-2 border-[var(--accent-primary)]/30 bg-[var(--surface)]/80 backdrop-blur-sm shadow-xl overflow-hidden">
                  {/* Terminal header */}
                  <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-4 py-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                    <span className="ml-2 text-xs font-mono text-[var(--accent-cyan)]">REPOSITORY.INPUT</span>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        id="repo-input"
                        type="text"
                        value={repositoryInput}
                        onChange={handleRepositoryInputChange}
                        placeholder="github.com/owner/repo or /local/path"
                        className="input-glass flex-1 font-mono text-sm"
                      />
                      <button
                        type="submit"
                        className="px-6 py-3 rounded border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-sm font-mono font-medium transition-all terminal-btn whitespace-nowrap flex items-center gap-2 justify-center"
                        disabled={isSubmitting}
                      >
                        <RocketIcon />
                        {isSubmitting ? t('common.processing') : 'GENERATE'}
                      </button>
                    </div>
                    {error && (
                      <div className="mt-3 text-xs font-mono text-[var(--highlight)] text-left p-2 rounded bg-[var(--highlight)]/10 border border-[var(--highlight)]/30">
                        {error}
                      </div>
                    )}
                  </div>
                </div>
              </form>

              {/* Platform Support Badges - Terminal Style */}
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono text-[var(--foreground-muted)]">
                <span className="text-[var(--accent-cyan)]">SUPPORTS:</span>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 transition-colors">
                  <GitHubIcon />
                  <span>GitHub</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 transition-colors">
                  <GitLabIcon />
                  <span>GitLab</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 transition-colors">
                  <BitbucketIcon />
                  <span>Bitbucket</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 transition-colors">
                  <AzureIcon />
                  <span>Azure</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Bento Grid */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-display)] mb-4">
                Powerful Features for Documentation
              </h3>
              <p className="text-[var(--foreground-muted)] max-w-2xl mx-auto">
                Generate comprehensive documentation with AI-powered analysis, visual diagrams, and intelligent code understanding
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 1: Mermaid Diagrams */}
              <div className="lg:col-span-2 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm shadow-xl overflow-hidden fade-in-up stagger-1 hover:border-[var(--accent-primary)]/40 transition-all">
                <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-4 py-2 flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                  </div>
                  <ChartIcon />
                  <h4 className="text-sm font-bold font-mono text-[var(--accent-cyan)]">VISUAL.DIAGRAMS</h4>
                </div>
                <div className="p-6">
                  <p className="text-sm text-[var(--foreground-muted)] mb-4 font-mono">
                    Automatically generate architecture diagrams, flowcharts, and sequence diagrams using Mermaid
                  </p>
                  <div className="rounded border border-[var(--accent-primary)]/20 p-4 bg-[var(--background)]">
                    <Mermaid chart={DEMO_FLOW_CHART} zoomingEnabled={false} />
                  </div>
                </div>
              </div>

              {/* Feature 2: Wiki Types */}
              <div className="glass-hover rounded-2xl p-8 border border-[var(--border-subtle)] fade-in-up stagger-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--gradient-via)]">
                    <BoltIcon />
                  </div>
                  <h4 className="text-xl font-bold font-[family-name:var(--font-display)]">Two Wiki Types</h4>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer">
                    <h5 className="font-semibold mb-2">Comprehensive</h5>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Deep analysis with detailed documentation, architecture patterns, and code examples
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer">
                    <h5 className="font-semibold mb-2">Concise</h5>
                    <p className="text-sm text-[var(--foreground-muted)]">
                      Quick overview with essential structure and key components
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3: AI-Powered */}
              <div className="glass-hover rounded-2xl p-8 border border-[var(--border-subtle)] fade-in-up stagger-3">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-[var(--gradient-via)] to-[var(--accent-cyan)]">
                    <SparklesIcon />
                  </div>
                  <h4 className="text-xl font-bold font-[family-name:var(--font-display)]">AI-Powered</h4>
                </div>
                <p className="text-[var(--foreground-muted)] mb-6">
                  Multiple LLM providers supported for intelligent code analysis
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]"></div>
                    Google Gemini
                  </div>
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]"></div>
                    OpenAI GPT
                  </div>
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]"></div>
                    OpenRouter
                  </div>
                  <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]"></div>
                    DeepSeek & Ollama
                  </div>
                </div>
              </div>

              {/* Feature 4: RAG-Powered Chat */}
              <div className="lg:col-span-2 glass-hover rounded-2xl p-8 border border-[var(--border-subtle)] fade-in-up stagger-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--gradient-from)]">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h4 className="text-xl font-bold font-[family-name:var(--font-display)]">Interactive Q&A</h4>
                </div>
                <p className="text-[var(--foreground-muted)] mb-6">
                  Ask questions about your codebase with RAG-powered chat interface for instant, context-aware answers
                </p>
                <div className="glass rounded-xl p-4 border border-[var(--border-subtle)] space-y-3">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] flex items-center justify-center text-xs font-bold">
                      You
                    </div>
                    <div className="flex-1 bg-[var(--surface)] rounded-lg p-3 text-sm">
                      How does authentication work in this codebase?
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface)] flex items-center justify-center">
                      <SparklesIcon />
                    </div>
                    <div className="flex-1 bg-[var(--surface)] rounded-lg p-3 text-sm text-[var(--foreground-muted)]">
                      Based on the codebase analysis, authentication uses JWT tokens...
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
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

      {/* Terminal-style Footer */}
      <footer className="bg-[var(--surface)]/90 border-t-2 border-[var(--accent-primary)]/20 backdrop-blur mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs font-mono text-[var(--foreground-muted)]">
              <span className="text-[var(--accent-primary)]">◆</span> {t('footer.copyright')}
            </p>
            <div className="flex items-center gap-4">
              <a
                href="https://github.com/viettdann/deepwiki-open"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors p-2 rounded border border-transparent hover:border-[var(--accent-primary)]/30"
              >
                <GitHubIcon />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
