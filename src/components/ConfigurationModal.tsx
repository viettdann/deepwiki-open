'use client';

import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RoleBasedButton } from './RoleBasedButton';
import UserSelector from './UserSelector';

interface ConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;

  // Repository input
  repositoryInput: string;
  setRepositoryInput: (value: string) => void;

  // Language selection
  selectedLanguage: string;
  setSelectedLanguage: (value: string) => void;
  supportedLanguages: Record<string, string>;

  // Wiki type options
  isComprehensiveView: boolean;
  setIsComprehensiveView: (value: boolean) => void;

  // Model selection
  provider: string;
  setProvider: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  isCustomModel: boolean;
  setIsCustomModel: (value: boolean) => void;
  customModel: string;
  setCustomModel: (value: string) => void;

  // Platform selection
  selectedPlatform: 'github' | 'gitlab' | 'bitbucket' | 'azure';
  setSelectedPlatform: (value: 'github' | 'gitlab' | 'bitbucket' | 'azure') => void;

  // Access token
  accessToken: string;
  setAccessToken: (value: string) => void;

  // Branch selection
  branch: string;
  setBranch: (value: string) => void;

  // File filter options
  excludedDirs: string;
  setExcludedDirs: (value: string) => void;
  excludedFiles: string;
  setExcludedFiles: (value: string) => void;
  includedDirs: string;
  setIncludedDirs: (value: string) => void;
  includedFiles: string;
  setIncludedFiles: (value: string) => void;

  // Form submission
  onSubmit: () => void;
  isSubmitting: boolean;

  // Authentication
  authRequired?: boolean;
  authCode?: string;
  setAuthCode?: (code: string) => void;
  isAuthLoading?: boolean;
}

export default function ConfigurationModal({
  isOpen,
  onClose,
  repositoryInput: initialRepositoryInput,
  setRepositoryInput: setParentRepositoryInput,
  selectedLanguage,
  setSelectedLanguage,
  supportedLanguages,
  isComprehensiveView,
  setIsComprehensiveView,
  provider,
  setProvider,
  model,
  setModel,
  isCustomModel,
  setIsCustomModel,
  customModel,
  setCustomModel,
  selectedPlatform,
  setSelectedPlatform,
  accessToken,
  setAccessToken,
  branch,
  setBranch,
  excludedDirs,
  setExcludedDirs,
  excludedFiles,
  setExcludedFiles,
  includedDirs,
  setIncludedDirs,
  includedFiles,
  setIncludedFiles,
  onSubmit,
  isSubmitting,
  authRequired,
  authCode,
  setAuthCode,
  isAuthLoading
}: ConfigurationModalProps) {
  const { messages: t } = useLanguage();

  // Repository input state (editable in modal)
  const [repositoryInput, setRepositoryInput] = useState(initialRepositoryInput);
  const [isEditingRepo, setIsEditingRepo] = useState(false);

  // Is Private Repository toggle
  const [isPrivateRepo, setIsPrivateRepo] = useState(false);

  // Is Custom Branch toggle
  const [isCustomBranch, setIsCustomBranch] = useState(false);

  // Update local state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setRepositoryInput(initialRepositoryInput);
      setIsPrivateRepo(!!accessToken);
      setIsCustomBranch(false); // Always default to OFF
    }
  }, [isOpen, initialRepositoryInput, accessToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto backdrop-blur-sm bg-black/70">
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="relative transform overflow-hidden rounded-lg bg-[var(--surface)] text-left shadow-2xl transition-all sm:my-8 sm:max-w-2xl sm:w-full border-2 border-[var(--accent-primary)]/30">
          {/* Modal header with terminal styling */}
          <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-emerald)]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-warning)]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-danger)]"></span>
              </div>
              <h3 className="text-sm font-mono font-semibold text-[var(--accent-cyan)] uppercase tracking-wide">
                {t.form?.configureWiki || 'WIKI.CONFIGURATION'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--foreground-muted)] hover:text-[var(--accent-danger)] focus:outline-none transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal body */}
          <div className="p-6 max-h-[70vh] overflow-y-auto">
            {/* Repository info */}
            <div className="mb-4">
              <label className="block text-sm font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                <span className="text-[var(--accent-primary)]">▸</span>
                {t.form?.repository || 'Repository'}
              </label>
              <div className="relative">
                  {isEditingRepo ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={repositoryInput}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setRepositoryInput(newValue);
                          setParentRepositoryInput(newValue);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setIsEditingRepo(false);
                            setParentRepositoryInput(repositoryInput);
                          }
                          if (e.key === 'Escape') {
                            setRepositoryInput(initialRepositoryInput);
                            setParentRepositoryInput(initialRepositoryInput);
                            setIsEditingRepo(false);
                          }
                        }}
                        className="input-glass flex-1 px-3 py-2 text-sm font-mono border-2 border-[var(--accent-primary)]/30 rounded-md bg-[var(--background)]/50"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          setIsEditingRepo(false);
                          setParentRepositoryInput(repositoryInput);
                        }}
                        className="px-4 py-2 text-sm font-mono font-medium rounded-md border-2 border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-all terminal-btn"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-[var(--background)]/70 p-3 rounded-md border-2 border-[var(--accent-primary)]/20">
                      <span className="flex-1 text-sm font-mono text-[var(--foreground)] truncate">› {repositoryInput}</span>
                      <button
                        onClick={() => setIsEditingRepo(true)}
                        className="p-1.5 text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors"
                        title="Edit repository"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
            </div>

            {/* Is Private Repository Toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between p-3 rounded-md border-2 border-[var(--accent-primary)]/20 bg-[var(--background)]/30">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className="text-sm font-mono font-medium text-[var(--foreground)]">
                        {t.form?.privateRepository || 'Private Repository'}
                      </span>
                    </div>
                    <div
                      className="relative flex items-center cursor-pointer"
                      onClick={() => {
                        const newValue = !isPrivateRepo;
                        setIsPrivateRepo(newValue);
                        if (!newValue) setAccessToken('');
                      }}
                    >
                      <div className={`w-11 h-6 rounded-full border-2 transition-colors ${isPrivateRepo ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]' : 'bg-[var(--surface)] border-[var(--accent-primary)]/30'}`}></div>
                      <div className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform transform ${isPrivateRepo ? 'translate-x-5' : ''}`}></div>
                    </div>
                  </div>

                  {/* Access Token Input - with transition */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isPrivateRepo ? 'max-h-[400px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
                    }`}
                  >
                    <div className="p-4 bg-[var(--background)]/50 rounded-md border-2 border-[var(--accent-primary)]/20">
                      <div className="mb-3">
                        <label className="block text-xs font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <span className="text-[var(--accent-primary)]">›</span>
                          {t.form?.selectPlatform || 'Platform'}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['github', 'gitlab', 'bitbucket', 'azure'] as const).map((platform) => (
                            <button
                              key={platform}
                              type="button"
                              onClick={() => setSelectedPlatform(platform)}
                              className={`px-3 py-2 rounded-md border-2 text-sm font-mono font-medium transition-all ${
                                selectedPlatform === platform
                                  ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                  : 'border-[var(--accent-primary)]/20 text-[var(--foreground)] hover:bg-[var(--accent-primary)]/5'
                              }`}
                            >
                              {platform === 'azure' ? 'Azure DevOps' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="access-token" className="block text-xs font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <span className="text-[var(--accent-primary)]">›</span>
                          {t.form?.personalAccessToken || 'Personal Access Token (PAT)'}
                        </label>
                        <input
                          id="access-token"
                          type="password"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="Enter your access token"
                          className="input-glass block w-full px-3 py-2 text-sm font-mono border-2 border-[var(--accent-primary)]/30 rounded-md bg-[var(--background)]/50"
                        />
                        <div className="flex items-center mt-2 text-xs text-[var(--foreground-muted)] font-mono">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {t.form?.tokenSecurityNote || 'Stored locally, never sent to our servers'}
                        </div>
                      </div>
                    </div>
                  </div>
            </div>

            {/* Custom Branch Toggle */}
            <div className="mb-4">
              <div className="flex items-center justify-between p-3 rounded-md border-2 border-[var(--accent-primary)]/20 bg-[var(--background)]/30">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-[var(--accent-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-mono font-medium text-[var(--foreground)]">
                        {t.form?.customBranch || 'Custom Branch'}
                      </span>
                    </div>
                    <div
                      className="relative flex items-center cursor-pointer"
                      onClick={() => {
                        const newValue = !isCustomBranch;
                        setIsCustomBranch(newValue);
                        if (!newValue) setBranch('main');
                      }}
                    >
                      <div className={`w-11 h-6 rounded-full border-2 transition-colors ${isCustomBranch ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)]' : 'bg-[var(--surface)] border-[var(--accent-primary)]/30'}`}></div>
                      <div className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white transition-transform transform ${isCustomBranch ? 'translate-x-5' : ''}`}></div>
                    </div>
                  </div>

                  {/* Branch Input - with transition */}
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isCustomBranch ? 'max-h-[200px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'
                    }`}
                  >
                    <div className="p-4 bg-[var(--background)]/50 rounded-md border-2 border-[var(--accent-primary)]/20">
                      <div>
                        <label htmlFor="branch-input" className="block text-xs font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                          <span className="text-[var(--accent-primary)]">›</span>
                          {t.form?.branchName || 'Branch Name'}
                        </label>
                        <input
                          id="branch-input"
                          type="text"
                          value={branch}
                          onChange={(e) => setBranch(e.target.value)}
                          placeholder="main"
                          className="input-glass block w-full px-3 py-2 text-sm font-mono border-2 border-[var(--accent-primary)]/30 rounded-md bg-[var(--background)]/50"
                        />
                        <div className="flex items-center mt-2 text-xs text-[var(--foreground-muted)] font-mono">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {t.form?.branchNote || 'Specify the Git branch to generate wiki from (defaults to "main")'}
                        </div>
                      </div>
                    </div>
                  </div>
            </div>

            {/* Language selection */}
            <div className="mb-4">
              <label htmlFor="language-select" className="block text-sm font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                <span className="text-[var(--accent-primary)]">▸</span>
                {t.form?.wikiLanguage || 'Wiki Language'}
              </label>
              <select
                id="language-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="input-glass block w-full px-3 py-2.5 text-sm font-mono rounded-md border-2 border-[var(--accent-primary)]/30 bg-[var(--background)]/50 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-colors"
              >
                {
                  Object.entries(supportedLanguages).map(([key, value])=> <option key={key} value={key}>{value}</option>)
                }
              </select>
            </div>

            {/* Wiki Type Selector */}
            <div className="mb-4">
              <label className="block text-sm font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                <span className="text-[var(--accent-primary)]">▸</span>
                {t.form?.wikiType || 'Wiki Type'}
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsComprehensiveView(true)}
                  className={`flex-1 flex items-center justify-between p-3 rounded-md border-2 transition-colors ${
                    isComprehensiveView
                      ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'bg-[var(--background)]/50 border-[var(--accent-primary)]/20 text-[var(--foreground)] hover:bg-[var(--accent-primary)]/5'
                  }`}
                >
                  <div className="flex items-center">
                    <div className="text-left">
                      <div className="font-mono font-medium text-sm">{t.form?.comprehensive || 'Comprehensive'}</div>
                      <div className="text-xs opacity-80 font-mono">
                        {t.form?.comprehensiveDescription || 'Detailed wiki with structured sections'}
                      </div>
                    </div>
                  </div>
                  {isComprehensiveView && (
                    <div className="ml-2 h-4 w-4 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-[var(--accent-primary)]"></div>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsComprehensiveView(false)}
                  className={`flex-1 flex items-center justify-between p-3 rounded-md border-2 transition-colors ${
                    !isComprehensiveView
                      ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                      : 'bg-[var(--background)]/50 border-[var(--accent-primary)]/20 text-[var(--foreground)] hover:bg-[var(--accent-primary)]/5'
                  }`}
                >
                  <div className="flex items-center">
                    <div className="text-left">
                      <div className="font-mono font-medium text-sm">{t.form?.concise || 'Concise'}</div>
                      <div className="text-xs opacity-80 font-mono">
                        {t.form?.conciseDescription || 'Simplified wiki with fewer pages'}
                      </div>
                    </div>
                  </div>
                  {!isComprehensiveView && (
                    <div className="ml-2 h-4 w-4 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center">
                      <div className="h-2 w-2 rounded-full bg-[var(--accent-primary)]"></div>
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Model Selector */}
            <div className="mb-4">
              <UserSelector
                provider={provider}
                setProvider={setProvider}
                model={model}
                setModel={setModel}
                isCustomModel={isCustomModel}
                setIsCustomModel={setIsCustomModel}
                customModel={customModel}
                setCustomModel={setCustomModel}
                showFileFilters={true}
                excludedDirs={excludedDirs}
                setExcludedDirs={setExcludedDirs}
                excludedFiles={excludedFiles}
                setExcludedFiles={setExcludedFiles}
                includedDirs={includedDirs}
                setIncludedDirs={setIncludedDirs}
                includedFiles={includedFiles}
                setIncludedFiles={setIncludedFiles}
              />
            </div>

            {/* Authorization Code Input */}
            {isAuthLoading && (
                <div className="mb-4 p-3 bg-[var(--background)]/50 rounded-md border-2 border-[var(--accent-primary)]/20 text-sm text-[var(--foreground-muted)] font-mono">
                  › Loading authentication status...
                </div>
            )}
            {!isAuthLoading && authRequired && (
                <div className="mb-4 p-4 bg-[var(--background)]/50 rounded-md border-2 border-[var(--accent-primary)]/20">
                  <label htmlFor="authCode" className="block text-sm font-mono font-medium text-[var(--foreground)] mb-2 flex items-center gap-2">
                    <span className="text-[var(--accent-primary)]">▸</span>
                    {t.form?.authorizationCode || 'Authorization Code'}
                  </label>
                  <input
                      type="password"
                      id="authCode"
                      value={authCode || ''}
                      onChange={(e) => setAuthCode?.(e.target.value)}
                      className="input-glass block w-full px-3 py-2 text-sm font-mono rounded-md bg-transparent text-[var(--foreground)] border-2 border-[var(--accent-primary)]/30 focus:outline-none focus:border-[var(--accent-primary)]"
                      placeholder="Enter your authorization code"
                  />
                 <div className="flex items-center mt-2 text-xs text-[var(--foreground-muted)] font-mono">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[var(--foreground-muted)]"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                   {t.form?.authorizationRequired || 'Authentication is required to generate the wiki.'}
                </div>
              </div>
            )}
          </div>

          {/* Modal footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t-2 border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-mono font-medium rounded-md border-2 border-[var(--accent-primary)]/30 text-[var(--foreground-muted)] bg-transparent hover:bg-[var(--background)] hover:text-[var(--foreground)] hover:border-[var(--accent-primary)]/50 transition-all"
            >
              {t.common?.cancel || 'Cancel'}
            </button>
            <RoleBasedButton
              onAdminClick={onSubmit}
              actionDescription="create new wiki generation job"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-mono font-medium rounded-md border-2 border-[var(--accent-primary)] bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary)]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed terminal-btn"
            >
              {isSubmitting ? (t.common?.processing || '› Processing...') : (t.common?.generateWiki || '▸ Generate Wiki')}
            </RoleBasedButton>
          </div>
        </div>
      </div>
    </div>
  );
}
