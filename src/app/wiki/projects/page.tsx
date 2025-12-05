'use client';

import React from 'react';
import Link from 'next/link';
import ProcessedProjects from '@/components/ProcessedProjects';
import { useLanguage } from '@/contexts/LanguageContext';

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

export default function WikiProjectsPage() {
  const { messages } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--surface)] border-b border-[var(--glass-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Brand */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] rounded-lg blur opacity-50"></div>
                <div className="relative bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] p-2 rounded-lg">
                  <WikiIcon />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold font-[family-name:var(--font-display)] gradient-text">
                  DeepWiki
                </h1>
              </div>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors">
                Home
              </Link>
              <Link href="/wiki/projects" className="text-sm font-medium text-[var(--accent-primary)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2">
                Indexed Wiki
              </Link>
              <Link href="/jobs" className="text-sm font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-2">
                Jobs
                <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full pulse-glow"></span>
              </Link>
            </nav>

            {/* CTA Button */}
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="hidden md:block btn-japanese text-sm px-6 py-2"
              >
                Generate Wiki
              </Link>
            </div>
          </div>
        </div>
      </header>

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

      {/* Footer */}
      <footer className="bg-[var(--surface)] border-t border-[var(--glass-border)] mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-[var(--foreground-muted)]">
              {messages.footer?.copyright || '© 2024 DeepWiki. All rights reserved.'}
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/AsyncFuncAI/deepwiki-open"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--foreground-muted)] hover:text-[var(--accent-primary)] transition-colors"
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