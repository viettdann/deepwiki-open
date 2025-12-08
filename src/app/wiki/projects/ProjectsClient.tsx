'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProcessedProjects from '@/components/ProcessedProjects';
import ConfigurationModal from '@/components/ConfigurationModal';
import { useLanguage } from '@/contexts/LanguageContext';

type ProcessedProject = {
  id: string;
  owner: string;
  repo: string;
  name: string;
  repo_type: string;
  submittedAt: number;
  language: string;
};

const WikiIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
  </svg>
);

const GitHubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
  </svg>
);

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 0 1 .75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 0 1 9.75 22.5a.75.75 0 0 1-.75-.75v-4.131A15.838 15.838 0 0 1 6.382 15H2.25a.75.75 0 0 1-.75-.75 6.75 6.75 0 0 1 7.815-6.666ZM15 6.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" clipRule="evenodd" />
    <path d="M5.26 17.242a.75.75 0 1 0-.897-1.203 5.243 5.243 0 0 0-2.05 5.022.75.75 0 0 0 .625.627 5.243 5.243 0 0 0 5.022-2.051.75.75 0 1 0-1.202-.897 3.744 3.744 0 0 1-3.008 1.51c0-1.23.592-2.323 1.51-3.008Z" />
  </svg>
);

export default function ProjectsClient({ initialProjects, authRequiredInitial }: { initialProjects: ProcessedProject[]; authRequiredInitial: boolean }) {
  const router = useRouter();
  const { language, setLanguage, messages, supportedLanguages } = useLanguage();

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [repositoryInput, setRepositoryInput] = useState('https://github.com/owner/repo');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [isComprehensiveView, setIsComprehensiveView] = useState<boolean>(true);
  const [provider, setProvider] = useState<string>('');
  const [model, setModel] = useState<string>('');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [customModel, setCustomModel] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<'github' | 'gitlab' | 'bitbucket' | 'azure'>('github');
  const [accessToken, setAccessToken] = useState('');
  const [excludedDirs, setExcludedDirs] = useState('');
  const [excludedFiles, setExcludedFiles] = useState('');
  const [includedDirs, setIncludedDirs] = useState('');
  const [includedFiles, setIncludedFiles] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState<boolean>(authRequiredInitial);
  const [authCode, setAuthCode] = useState<string>('');
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);

  useEffect(() => {
    setLanguage(selectedLanguage);
  }, [selectedLanguage, setLanguage]);

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

  const handleGenerateWiki = async () => {
    const validation = await validateAuthCode();
    if (!validation) {
      setIsConfigModalOpen(false);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    const parseRepositoryInput = (input: string) => {
      const match = input.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) return { owner: match[1], repo: match[2].replace('.git', ''), type: 'github' };
      return null;
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
      <header className="sticky top-0 z-50 bg-(--surface) border-b border-(--glass-border)">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-linear-to-r from-(--gradient-from) to-(--gradient-to) rounded-lg blur opacity-50"></div>
                <div className="relative bg-linear-to-r from-(--gradient-from) to-(--gradient-to) p-2 rounded-lg">
                  <WikiIcon />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold font-display gradient-text">DeepWiki</h1>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-(--foreground-muted) hover:text-foreground transition-colors">Home</Link>
              <Link href="/wiki/projects" className="text-sm font-medium text-(--accent-primary) hover:text-foreground transition-colors flex items-center gap-2">Indexed Wiki</Link>
              <Link href="/jobs" className="text-sm font-medium text-(--foreground-muted) hover:text-foreground transition-colors flex items-center gap-2">Jobs<span className="w-2 h-2 bg-(--accent-emerald) rounded-full pulse-glow"></span></Link>
            </nav>
            <div className="flex items-center gap-4">
              <button onClick={() => setIsConfigModalOpen(true)} className="hidden md:flex items-center gap-2 btn-japanese text-sm px-6 py-2">
                <RocketIcon />
                Generate Wiki
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <ProcessedProjects showHeader={true} messages={messages} className="" initialProjects={initialProjects} />
        </div>
      </main>
      <ConfigurationModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        repositoryInput={repositoryInput}
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
      <footer className="bg-(--surface) border-t border-(--glass-border) mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-(--foreground-muted)">{messages.footer?.copyright || '© 2024 DeepWiki. All rights reserved.'}</p>
            <div className="flex items-center gap-6">
              <a href="https://github.com/viettdann/deepwiki-open" target="_blank" rel="noopener noreferrer" className="text-(--foreground-muted) hover:text-(--accent-primary) transition-colors">
                <GitHubIcon />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

