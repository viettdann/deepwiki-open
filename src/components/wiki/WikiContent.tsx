'use client';

import React from 'react';
import { FaBookOpen, FaRegEdit } from 'react-icons/fa';
import Markdown from '@/components/Markdown';
import { WikiPage } from '@/types/wiki';

interface WikiContentProps {
  currentPageId?: string;
  generatedPages: Record<string, WikiPage>;
  isLoading?: boolean;
}

const WikiContent: React.FC<WikiContentProps> = ({
  currentPageId,
  generatedPages,
  isLoading = false
}) => {

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-cyan)]"></div>
          <p className="mt-4 text-[var(--muted)] font-mono">Generating wiki content...</p>
        </div>
      </div>
    );
  }

  if (!currentPageId || !generatedPages[currentPageId]) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="text-center">
          <FaBookOpen className="text-6xl text-[var(--muted)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--foreground)] mb-2">No Page Selected</h2>
          <p className="text-[var(--muted)]">Select a page from the navigation tree to view its content.</p>
        </div>
      </div>
    );
  }

  const currentPage = generatedPages[currentPageId];

  return (
    <main id="wiki-content" className="flex-1 overflow-y-auto">
      <article className="max-w-4xl mx-auto">
        {/* Article metadata header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-cyan)]">
            <span>&#47;&#47;</span>
            <span className="text-[var(--foreground-muted)]">DOCUMENTATION</span>
          </div>
          {currentPage.filePaths && currentPage.filePaths.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--muted)]">
              <span className="text-[var(--accent-primary)]">◆</span>
              <span>{currentPage.filePaths.length} source {currentPage.filePaths.length === 1 ? 'file' : 'files'}</span>
            </div>
          )}
        </div>

        {/* Article title */}
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-6 font-mono tracking-tight">
          {currentPage.title}
        </h1>

        {/* Article content */}
        <div className="prose prose-sm md:prose-base max-w-none">
          <Markdown content={currentPage.content} />
        </div>

        {/* Related pages */}
        {currentPage.relatedPages && currentPage.relatedPages.length > 0 && (
          <section className="mt-12 pt-8 border-t border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <span className="text-[var(--accent-primary)]">▸</span>
              Related Pages
            </h2>
            <ul className="space-y-2">
              {currentPage.relatedPages.map((relatedId) => {
                const relatedPage = Object.values(generatedPages).find(p => p.id === relatedId);
                if (!relatedPage) return null;

                return (
                  <li key={relatedId} className="group">
                    <a
                      href={`#${relatedId}`}
                      className="flex items-center gap-2 text-[var(--accent-cyan)] hover:text-[var(--accent-cyan)]/80 transition-colors font-mono text-sm"
                      onClick={(e) => {
                        e.preventDefault();
                        // This will need to be passed as a prop
                        window.location.hash = relatedId;
                      }}
                    >
                      <span className="opacity-50 group-hover:opacity-100 transition-opacity">→</span>
                      {relatedPage.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Page metadata */}
        <footer className="mt-12 pt-8 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-xs font-mono text-[var(--muted)]">
            <div className="flex items-center gap-4">
              <span>Importance: {currentPage.importance}</span>
              {currentPage.isSection && (
                <span className="text-[var(--accent-primary)]">Section Page</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <FaRegEdit />
              <span>Last generated</span>
            </div>
          </div>
        </footer>
      </article>
    </main>
  );
};

export default WikiContent;