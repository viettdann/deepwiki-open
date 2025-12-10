'use client';

import React, { useState } from 'react';
import { FaChevronRight, FaChevronDown } from 'react-icons/fa';

// Import interfaces from the page component
interface WikiPage {
  id: string;
  title: string;
  content: string;
  filePaths: string[];
  importance: 'high' | 'medium' | 'low';
  relatedPages: string[];
  parentId?: string;
  isSection?: boolean;
  children?: string[];
}

interface WikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[];
}

interface WikiStructure {
  id: string;
  title: string;
  description: string;
  pages: WikiPage[];
  sections: WikiSection[];
  rootSections: string[];
}

interface WikiTreeViewProps {
  wikiStructure: WikiStructure;
  currentPageId: string | undefined;
  onPageSelect: (pageId: string) => void;
  messages?: {
    pages?: string;
    [key: string]: string | undefined;
  };
}

const WikiTreeView: React.FC<WikiTreeViewProps> = ({
  wikiStructure,
  currentPageId,
  onPageSelect,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(wikiStructure.rootSections)
  );

  const toggleSection = (sectionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const renderSection = (sectionId: string, level = 0) => {
    const section = wikiStructure.sections.find(s => s.id === sectionId);
    if (!section) return null;

    const isExpanded = expandedSections.has(sectionId);

    return (
      <div key={sectionId} className="mb-1">
        <button
          className={`flex items-center w-full text-left px-2 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
            level === 0
              ? 'text-[var(--accent-cyan)] hover:bg-[var(--accent-primary)]/5'
              : 'text-[var(--accent-secondary)] hover:bg-[var(--accent-primary)]/5'
          }`}
          onClick={(e) => toggleSection(sectionId, e)}
        >
          {isExpanded ? (
            <FaChevronDown className="mr-2 text-[10px] text-[var(--accent-primary)]" />
          ) : (
            <FaChevronRight className="mr-2 text-[10px] text-[var(--accent-primary)]" />
          )}
          <span className="truncate">{section.title}</span>
        </button>

        {isExpanded && (
          <div className={`ml-3 mt-1 space-y-0.5 ${level > 0 ? 'pl-3 border-l border-[var(--accent-primary)]/20' : ''}`}>
            {/* Render pages in this section */}
            {section.pages.map(pageId => {
              const page = wikiStructure.pages.find(p => p.id === pageId);
              if (!page) return null;

              return (
                <button
                  key={pageId}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-all ${
                    currentPageId === pageId
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-cyan)] border border-[var(--accent-primary)]/40 shadow-sm'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-primary)]/5 border border-transparent'
                  }`}
                  onClick={() => onPageSelect(pageId)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent-primary)] opacity-50">→</span>
                    <span className="truncate flex-1">{page.title}</span>
                    {page.importance === 'high' && (
                      <span className="w-1 h-1 rounded-full bg-[var(--accent-cyan)] flex-shrink-0"></span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Render subsections recursively */}
            {section.subsections?.map(subsectionId =>
              renderSection(subsectionId, level + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  // If there are no sections defined yet, or if sections/rootSections are empty arrays, fall back to the flat list view
  if (!wikiStructure.sections || wikiStructure.sections.length === 0 || !wikiStructure.rootSections || wikiStructure.rootSections.length === 0) {
    console.log("WikiTreeView: Falling back to flat list view due to missing or empty sections/rootSections");
    return (
      <ul className="space-y-0.5">
        {wikiStructure.pages.map(page => (
          <li key={page.id}>
            <button
              className={`w-full text-left px-2 py-1.5 rounded text-xs font-mono transition-all ${
                currentPageId === page.id
                  ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-cyan)] border border-[var(--accent-primary)]/40 shadow-sm'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent-primary)]/5 border border-transparent'
              }`}
              onClick={() => onPageSelect(page.id)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent-primary)] opacity-50">→</span>
                <span className="truncate flex-1">{page.title}</span>
                {page.importance === 'high' && (
                  <span className="w-1 h-1 rounded-full bg-[var(--accent-cyan)] flex-shrink-0"></span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  // Log information about the sections for debugging
  // console.log("WikiTreeView: Rendering tree view with sections:", wikiStructure.sections);
  // console.log("WikiTreeView: Root sections:", wikiStructure.rootSections);

  return (
    <div className="space-y-1">
      {wikiStructure.rootSections.map(sectionId => {
        const section = wikiStructure.sections.find(s => s.id === sectionId);
        if (!section) {
          console.warn(`WikiTreeView: Could not find section with id ${sectionId}`);
          return null;
        }
        return renderSection(sectionId);
      })}
    </div>
  );
};

export default WikiTreeView;