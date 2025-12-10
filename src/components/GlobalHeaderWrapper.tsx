'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Header from './Header';

interface GlobalHeaderWrapperProps {
  children: React.ReactNode;
}

export default function GlobalHeaderWrapper({ children }: GlobalHeaderWrapperProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Check if this is a special page that has its own Header component
  const isJobDetailPage = pathname.startsWith('/wiki/job/');
  const isRepoWikiPage = pathname.match(/^\/(?!wiki\/)[^\/]+\/[^\/]+$/) !== null;

  // Determine current page based on pathname
  const getCurrentPage = () => {
    if (pathname === '/') return 'home';
    if (pathname.startsWith('/wiki/projects')) return 'projects';
    if (pathname.startsWith('/wiki/job/')) return 'wiki';
    if (pathname.startsWith('/jobs')) return 'jobs';
    if (pathname.startsWith('/wiki/')) return 'wiki';
    return 'home';
  };

  // Get header props based on current page
  const getHeaderProps = () => {
    const currentPage = getCurrentPage();

    switch (currentPage) {
      case 'home':
        return {
          currentPage,
          title: 'DeepWiki',
          subtitle: 'AI-powered documentation',
          statusLabel: 'SYSTEM.READY',
          statusValue: 'GENERATOR.ONLINE',
          actionLabel: 'Generate',
          onActionClick: () => {
            const input = document.getElementById('repo-input');
            input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input?.focus();
          },
        };
      case 'jobs':
        return {
          currentPage,
          title: 'DeepWiki',
          subtitle: 'Job Management',
          statusLabel: 'SYSTEM.JOBS',
          statusValue: undefined,
          showRefresh: true,
          onRefreshClick: () => {
            // Trigger refresh for jobs page
            window.location.reload();
          },
          actionLabel: 'Generate Wiki',
          onActionClick: () => router.push('/'),
        };
      case 'projects':
        return {
          currentPage,
          title: 'DeepWiki',
          subtitle: 'Wiki Index',
          statusLabel: 'SYSTEM.WIKI',
          statusValue: undefined,
          actionLabel: 'Generate Wiki',
          onActionClick: () => router.push('/'),
        };
      default:
        return {
          currentPage,
          title: 'DeepWiki',
          subtitle: 'AI-powered documentation',
        };
    }
  };

  // If it's a job detail page or repo wiki page, let the page handle its own header
  if (isJobDetailPage || isRepoWikiPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header {...getHeaderProps()} />
      {children}
    </div>
  );
}