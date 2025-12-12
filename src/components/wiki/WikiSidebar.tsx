'use client';

import React, { useRef, useEffect } from 'react';
import { FaBitbucket, FaChevronDown, FaFolder, FaGithub, FaGitlab, FaSync, FaTrash } from 'react-icons/fa';
import WikiTreeView from '@/components/WikiTreeView';
import { RoleBasedButton } from '@/components/RoleBasedButton';
import { WikiStructure, WikiPage } from '@/types/wiki';
import { RepoInfo } from '@/types/repoinfo';
import ExportButton from './ExportButton';

interface WikiSidebarProps {
  wikiStructure?: WikiStructure;
  currentPageId?: string;
  generatedPages: Record<string, WikiPage>;
  effectiveRepoInfo: RepoInfo;
  isComprehensiveView: boolean;
  isLoading: boolean;
  messages: {
    repoPage?: Record<string, string | undefined>;
  };
  language: string;
  setLoadingMessage: (message: string) => void;
  // Regeneration handlers
  setShowRegenerateMenu: (show: boolean) => void;
  showRegenerateMenu: boolean;
  setIsModelSelectionModalOpen: (open: boolean) => void;
  setCleanRegenerateMode: (clean: boolean) => void;
  // Export state
  isExporting: boolean;
  setIsExporting: (isExporting: boolean) => void;
  exportError?: string | null;
  setExportError?: (error: string | null) => void;
  // Page selection
  onPageSelect: (pageId: string) => void;
}

const WikiSidebar: React.FC<WikiSidebarProps> = ({
  wikiStructure,
  currentPageId,
  generatedPages,
  effectiveRepoInfo,
  isComprehensiveView,
  isLoading,
  messages,
  language,
  setLoadingMessage,
  setShowRegenerateMenu,
  showRegenerateMenu,
  setIsModelSelectionModalOpen,
  setCleanRegenerateMode,
  isExporting,
  setIsExporting,
  exportError,
  setExportError,
  onPageSelect
}) => {
  const regenerateDropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside for regenerate dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showRegenerateMenu) {
        const target = event.target as Element;
        if (!target.closest('.regenerate-dropdown')) {
          setShowRegenerateMenu(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRegenerateMenu, setShowRegenerateMenu]);

  if (!wikiStructure) return null;

  return (
    <aside className="w-full lg:w-[300px] xl:w-[340px] flex-shrink-0 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm shadow-xl overflow-hidden">
      {/* Sidebar header */}
      <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
          <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
          <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
        </div>
        <h3 className="text-base font-bold font-mono text-[var(--foreground)] mb-1 tracking-tight">{wikiStructure.title}</h3>
        <p className="text-[var(--muted)] text-xs leading-relaxed font-mono">{wikiStructure.description}</p>
      </div>

      <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Repository info */}
        <div className="text-xs font-mono mb-4 p-3 rounded border border-[var(--accent-primary)]/10 bg-[var(--background)]/50">
          {effectiveRepoInfo.type === 'local' ? (
            <div className="flex items-center gap-2">
              <FaFolder className="text-[var(--accent-cyan)] flex-shrink-0" />
              <span className="break-all text-[var(--foreground-muted)]">{effectiveRepoInfo.localPath}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {effectiveRepoInfo.type === 'github' ? (
                <FaGithub className="text-[var(--accent-cyan)] flex-shrink-0" />
              ) : effectiveRepoInfo.type === 'gitlab' ? (
                <FaGitlab className="text-[var(--accent-cyan)] flex-shrink-0" />
              ) : (
                <FaBitbucket className="text-[var(--accent-cyan)] flex-shrink-0" />
              )}
              <a href={effectiveRepoInfo.repoUrl ?? ''} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-cyan)] transition-colors truncate text-[var(--foreground-muted)]">
                {effectiveRepoInfo.owner}/{effectiveRepoInfo.repo}
              </a>
            </div>
          )}
        </div>

        {/* Wiki type badge */}
        <div className="mb-4 flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-500">$ mode:</span>
          <span className={`px-3 py-1 border font-mono text-xs relative overflow-hidden group ${isComprehensiveView ? 'bg-purple-950/50 text-purple-400 border-purple-500/50' : 'bg-gray-900 text-gray-400 border-gray-700'}`}>
            <span className="relative z-10">{isComprehensiveView ? 'FULL' : 'BRIEF'}</span>
            {isComprehensiveView && (
              <span className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-500"></span>
            )}
          </span>
        </div>

        {/* Action buttons */}
        <div className="mb-5 space-y-2">
          <div className="relative regenerate-dropdown" ref={regenerateDropdownRef}>
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[var(--foreground-muted)] text-xs font-mono">$</span>
              <span className="text-[var(--foreground-muted)] text-xs font-mono">command:</span>
            </div>

            <button
              onClick={() => setShowRegenerateMenu(!showRegenerateMenu)}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 text-xs font-mono px-4 py-3 bg-black/50 border border-cyan-500/30 rounded-none font-mono text-cyan-400 hover:bg-cyan-950/30 hover:border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-700"></span>
              <FaSync className={`relative z-10 ${isLoading ? 'animate-spin' : ''} text-cyan-400`} />
              <span className="relative z-10">REGENERATE_WIKI.EXE</span>
              <FaChevronDown className={`ml-auto relative z-10 transition-transform duration-200 ${showRegenerateMenu ? 'rotate-180' : ''} text-cyan-400`} />
            </button>

            {showRegenerateMenu && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-black/90 border border-cyan-500/50 rounded-none shadow-[0_0_30px_rgba(6,182,212,0.5)] overflow-hidden z-50">
                {/* Terminal header */}
                <div className="bg-gradient-to-r from-gray-900 to-black px-3 py-1 border-b border-cyan-500/30 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  </div>
                  <span className="text-xs text-cyan-400 font-mono flex-1 text-center">regenerate_options.sh</span>
                </div>

                {/* Menu options */}
                <div className="p-1">
                  <RoleBasedButton
                    onAdminClick={() => {
                      setShowRegenerateMenu(false);
                      setIsModelSelectionModalOpen(true);
                      setCleanRegenerateMode(false);
                    }}
                    actionDescription={`refresh wiki for "${effectiveRepoInfo.repo}" with existing data`}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 text-xs font-mono px-4 py-3 border-0 bg-transparent hover:bg-purple-950/30 hover:text-purple-400 text-gray-400 transition-all duration-200 text-left group relative overflow-hidden"
                  >
                    <span className="text-purple-400">▸</span>
                    <div className="flex-1">
                      <div className="text-purple-400 group-hover:text-purple-300">01_REFRESH_CACHE</div>
                      <div className="text-xs text-gray-500 mt-1 font-mono opacity-70"># Keep existing repo and embeddings</div>
                    </div>
                    <FaSync className="text-purple-500 group-hover:text-purple-400" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-500"></div>
                  </RoleBasedButton>

                  <div className="border-t border-cyan-500/20 my-1"></div>

                  <RoleBasedButton
                    onAdminClick={() => {
                      setShowRegenerateMenu(false);
                      setIsModelSelectionModalOpen(true);
                      setCleanRegenerateMode(true);
                    }}
                    actionDescription={`clean regenerate wiki for "${effectiveRepoInfo.repo}" with fresh data`}
                    disabled={isLoading}
                    className="w-full flex items-center gap-3 text-xs font-mono px-4 py-3 border-0 bg-transparent hover:bg-red-950/30 hover:text-red-400 text-gray-400 transition-all duration-200 text-left group relative overflow-hidden"
                  >
                    <span className="text-red-400">▸</span>
                    <div className="flex-1">
                      <div className="text-red-400 group-hover:text-red-300">02_CLEAN_GENERATE</div>
                      <div className="text-xs text-gray-500 mt-1 font-mono opacity-70"># Fresh clone, new embeddings</div>
                    </div>
                    <FaTrash className="text-red-500 group-hover:text-red-400" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/5 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-500"></div>
                  </RoleBasedButton>
                </div>

                {/* Terminal footer */}
                <div className="bg-black/50 px-3 py-1 border-t border-cyan-500/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400 font-mono">ready</span>
                    <span className="text-xs text-gray-500 font-mono animate-pulse">_</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Export section */}
        {Object.keys(generatedPages).length > 0 && (
          <div className="mb-5 relative">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-500 text-xs font-mono">$</span>
              <h4 className="text-xs font-mono font-semibold text-cyan-400 flex items-center gap-2">
                <span className="animate-pulse">▸</span> export_wiki.sh
              </h4>
            </div>
            <div className="bg-black/40 border border-cyan-500/20 rounded-none overflow-hidden">
              <div className="p-2 space-y-1">
                <ExportButton
                  wikiStructure={wikiStructure}
                  generatedPages={generatedPages}
                  effectiveRepoInfo={effectiveRepoInfo}
                  language={language}
                  setLoadingMessage={setLoadingMessage}
                  isExporting={isExporting}
                  setIsExporting={setIsExporting}
                  exportError={exportError}
                  setExportError={setExportError}
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation tree */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-500 text-xs font-mono">$</span>
            <h4 className="text-xs font-mono font-semibold text-cyan-400 flex items-center gap-2">
              <span className="animate-pulse">▸</span> navigation_tree.sh
            </h4>
          </div>
          <div className="bg-black/40 border border-cyan-500/20 rounded-none p-2 max-h-96 overflow-y-auto custom-scrollbar">
            <WikiTreeView
              wikiStructure={wikiStructure}
              currentPageId={currentPageId}
              onPageSelect={onPageSelect}
              messages={messages.repoPage}
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default WikiSidebar;