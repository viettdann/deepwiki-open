'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  currentPage?: 'home' | 'jobs' | 'projects' | 'wiki';
  title?: string;
  subtitle?: string;
  statusLabel?: string;
  statusValue?: string | number;
  onActionClick?: () => void;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  showRefresh?: boolean;
  onRefreshClick?: () => void;
  isRefreshing?: boolean;
}

const WikiIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
  </svg>
);

export default function Header({
  currentPage = 'home',
  title,
  subtitle,
  statusLabel,
  statusValue,
  onActionClick,
  actionLabel = 'Generate',
  actionIcon,
  showRefresh = false,
  onRefreshClick,
  isRefreshing = false,
}: HeaderProps) {
  const { user, isAuthenticated, isLoading, loginRequired, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      // Redirect to login page after successful logout
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      setIsLoggingOut(false);
    }
  };
  return (
    <header className="sticky top-0 z-50 bg-[#13132b]/95 backdrop-blur-xl border-b-2 border-[#8b5cf6]/30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Terminal status bar */}
        <div className="h-10 flex items-center justify-between border-b border-[#8b5cf6]/10 text-xs font-mono">
          <div className="flex items-center gap-4 text-[#94a3b8]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse"></span>
              {statusLabel || 'SYSTEM.READY'}
            </span>
            {statusValue !== undefined && (
              <>
                <span className="hidden sm:block">|</span>
                <span className="hidden sm:block text-[#06b6d4]">{statusValue}</span>
              </>
            )}
          </div>

          {/* Theme Toggle & Authentication Status Display */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />
            <span className="text-[#94a3b8]">|</span>

            {/* Authentication */}
            {isLoading ? (
              <span className="text-[#94a3b8]">AUTH.CHECKING...</span>
            ) : loginRequired && isAuthenticated && user ? (
              <>
                <span className="hidden sm:block text-[#10b981]">
                  user:{user.username}[{user.role}:{user.access.toUpperCase()}]
                </span>
                <span className="sm:hidden text-[#10b981]">
                  {user.access === 'admin' ? 'ADM' : 'RD'}
                </span>
                <span className="text-[#94a3b8]">|</span>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="text-[#94a3b8] hover:text-[#ef4444] transition-colors disabled:opacity-50 font-mono"
                  title={isLoggingOut ? 'Logging out...' : 'Logout'}
                >
                  {isLoggingOut ? 'LOGGING.OUT' : 'LOGOUT'}
                </button>
              </>
            ) : loginRequired ? (
              <button
                onClick={() => window.location.href = '/login'}
                className="text-[#94a3b8] hover:text-[#06b6d4] transition-colors font-mono"
                title="Login"
              >
                LOGIN
              </button>
            ) : (
              <span className="text-[#10b981]">OPEN.ACCESS</span>
            )}
          </div>
        </div>

        {/* Main header */}
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#8b5cf6] to-[#06b6d4] rounded blur-sm opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <div className="relative bg-[#8b5cf6] p-2 rounded border border-[#8b5cf6]/50">
                <WikiIcon />
              </div>
            </div>
            <div className="leading-tight">
              <p className="text-base font-bold font-mono tracking-tight text-[#f8fafc]">
                <span className="text-[#06b6d4]">$</span> {title || 'DeepWiki'}
              </p>
              <p className="text-[10px] font-mono text-[#94a3b8] tracking-wider">
                &#47;&#47; {subtitle || 'AI-powered documentation'}
              </p>
            </div>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-mono font-medium">
            <Link
              href="/"
              className={`transition-colors flex items-center gap-1 ${
                currentPage === 'home'
                  ? 'text-[#06b6d4]'
                  : 'text-[#94a3b8] hover:text-[#06b6d4]'
              }`}
            >
              <span className="text-[#8b5cf6]">01</span> Home
            </Link>
            <Link
              href="/wiki/projects"
              className={`transition-colors flex items-center gap-1 ${
                currentPage === 'projects'
                  ? 'text-[#06b6d4]'
                  : 'text-[#94a3b8] hover:text-[#06b6d4]'
              }`}
            >
              <span className="text-[#8b5cf6]">02</span> Wiki Index
            </Link>
            <Link
              href="/jobs"
              className={`transition-colors flex items-center gap-2 ${
                currentPage === 'jobs'
                  ? 'text-[#06b6d4]'
                  : 'text-[#94a3b8] hover:text-[#06b6d4]'
              }`}
            >
              <span className="text-[#8b5cf6]">03</span> Jobs
              <span className="w-1.5 h-1.5 bg-[#10b981] rounded-full pulse-glow"></span>
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {showRefresh && onRefreshClick && (
              <button
                onClick={onRefreshClick}
                className="p-2 text-[#94a3b8] hover:text-[#06b6d4] transition-colors rounded border border-transparent hover:border-[#8b5cf6]/30"
                title="Refresh"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
            {onActionClick && (
              <button
                onClick={onActionClick}
                className="hidden md:inline-flex items-center gap-2 px-4 py-1.5 rounded border border-[#8b5cf6]/50 bg-[#8b5cf6]/10 hover:bg-[#8b5cf6]/20 text-[#8b5cf6] text-xs font-mono font-medium transition-all hover:border-[#8b5cf6] terminal-btn"
              >
                {actionIcon}
                {actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
