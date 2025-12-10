'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProcessedProjects from '@/components/ProcessedProjects';
import ConfigurationModal from '@/components/ConfigurationModal';
import { useLanguage } from '@/contexts/LanguageContext';
import Header from '@/components/Header';

const GitHubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
  </svg>
);

export default function WikiProjectsPage() {
  const router = useRouter();
  const { language, setLanguage, messages, supportedLanguages } = useLanguage();

  // State for modal
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
        currentPage="projects"
        statusLabel="SYSTEM.WIKI"
        actionLabel="Generate Wiki"
        onActionClick={() => setIsConfigModalOpen(true)}
      />
      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <ProcessedProjects
            showHeader={true}
            messages={messages}
            className=""
          />
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
      <footer className="bg-(--surface) border-t border-(--glass-border) mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-(--foreground-muted)">
              {messages.footer?.copyright || '© 2024 DeepWiki. All rights reserved.'}
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/viettdann/deepwiki-open"
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--foreground-muted) hover:text-(--accent-primary) transition-colors"
              >
                <GitHubIcon />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
