'use client';

import React, { useCallback } from 'react';
import { FaDownload, FaFileExport } from 'react-icons/fa';
import { WikiStructure, WikiPage } from '@/types/wiki';
import { RepoInfo } from '@/types/repoinfo';

interface ExportButtonProps {
  wikiStructure?: WikiStructure;
  generatedPages: Record<string, WikiPage>;
  effectiveRepoInfo: RepoInfo;
  language: string;
  setLoadingMessage: (message: string) => void;
  isExporting: boolean;
  setIsExporting: (isExporting: boolean) => void;
  exportError?: string | null;
  setExportError?: (error: string | null) => void;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  wikiStructure,
  generatedPages,
  effectiveRepoInfo,
  language,
  setLoadingMessage,
  isExporting,
  setIsExporting,
  exportError,
  setExportError
}) => {
  const exportWiki = useCallback(async (format: 'markdown' | 'json') => {
    if (!wikiStructure || Object.keys(generatedPages).length === 0) {
      if (setExportError) {
        setExportError('No wiki content to export');
      }
      return;
    }

    try {
      setIsExporting(true);
      if (setExportError) setExportError(null);
      setLoadingMessage(`${language === 'vi' ? 'Xuất wiki dưới dạng' : 'Exporting wiki as'} ${format}...`);

      const pagesToExport = wikiStructure.pages.map(page => {
        const content = generatedPages[page.id]?.content || 'Content not generated';
        return { ...page, content };
      });

      // Get repository URL - this will need to be passed as a prop or extracted
      const repoUrl = effectiveRepoInfo.repoUrl || `https://github.com/${effectiveRepoInfo.owner}/${effectiveRepoInfo.repo}`;

      const response = await fetch(`/export/wiki`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrl,
          type: effectiveRepoInfo.type,
          pages: pagesToExport,
          format: format
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details available');
        throw new Error(`Export failed (${response.status}): ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${effectiveRepoInfo.owner}_${effectiveRepoInfo.repo}_wiki.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (setExportError) {
        setExportError(error instanceof Error ? error.message : 'Export failed');
      }
    } finally {
      setIsExporting(false);
    }
  }, [wikiStructure, generatedPages, effectiveRepoInfo, language, setLoadingMessage, setIsExporting, setExportError]);

  return (
    <>
      <button
        onClick={() => exportWiki('markdown')}
        disabled={isExporting}
        className="w-full flex items-center gap-3 text-xs font-mono px-4 py-2 border border-cyan-500/20 bg-transparent hover:bg-cyan-950/20 hover:border-cyan-500/40 text-cyan-400 transition-all duration-200 group relative overflow-hidden"
      >
        <span className="text-cyan-500">01</span>
        <span className="flex-1 text-left">export_markdown()</span>
        <FaDownload className="text-cyan-500 group-hover:text-cyan-300 transition-colors" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-500"></div>
      </button>
      <div className="border-t border-cyan-500/10"></div>
      <button
        onClick={() => exportWiki('json')}
        disabled={isExporting}
        className="w-full flex items-center gap-3 text-xs font-mono px-4 py-2 border border-cyan-500/20 bg-transparent hover:bg-cyan-950/20 hover:border-cyan-500/40 text-cyan-400 transition-all duration-200 group relative overflow-hidden"
      >
        <span className="text-cyan-500">02</span>
        <span className="flex-1 text-left">export_json()</span>
        <FaFileExport className="text-cyan-500 group-hover:text-cyan-300 transition-colors" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent transform -skew-x-12 group-hover:translate-x-full transition-transform duration-500"></div>
      </button>
      {exportError && (
        <div className="mt-2 p-2 bg-red-950/20 border border-red-500/30 rounded-none">
          <div className="flex items-start gap-2">
            <span className="text-red-400 text-xs font-mono">ERROR:</span>
            <div className="text-xs text-red-400 font-mono flex-1">{exportError}</div>
          </div>
        </div>
      )}
    </>
  );
};

export default ExportButton;