'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * ThemeToggle - Simple Dark/Light toggle with clear UX
 *
 * Design: User-friendly toggle between dark and light modes
 * - Clear visual indication of current mode
 * - Obvious that it's a theme switcher
 * - No system mode - only Dark and Light
 */
export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  // Prevent hydration mismatch - only render after client mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Render placeholder with exact same dimensions to prevent layout shift
    return (
      <button
        className="flex items-center gap-2 px-2.5 py-1 text-[var(--foreground-muted)] font-mono text-xs rounded-md border border-[var(--border-color)]/60 bg-transparent"
        disabled
        aria-label="Theme toggle loading"
      >
        <span className="w-4 h-4 rounded-full bg-[var(--foreground-muted)]/20"></span>
        <span>Theme</span>
      </button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  // Toggle between dark and light only
  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center gap-2 px-2.5 py-1
        text-[var(--foreground-muted)]
        transition-all duration-200 font-mono text-xs
        border border-[var(--border-color)]/60 hover:border-[var(--accent-primary)]/60
        rounded-md bg-transparent
        group"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Theme icon with transition */}
      <div className="relative w-4 h-4">
        {/* Sun icon - visible in dark mode */}
        <svg
          className={`absolute inset-0 w-4 h-4 text-[var(--accent-warning)] transition-all duration-300 ${
            isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-50'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
        {/* Moon icon - visible in light mode */}
        <svg
          className={`absolute inset-0 w-4 h-4 text-[var(--accent-primary)] transition-all duration-300 ${
            !isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      </div>

      {/* Label */}
      <span className="tracking-wide uppercase">{isDark ? 'Dark' : 'Light'}</span>

      {/* Toggle indicator */}
      <div className={`w-8 h-4 rounded-full transition-colors duration-200 relative ${
        isDark ? 'bg-[var(--accent-primary)]/30' : 'bg-[var(--accent-warning)]/30'
      }`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all duration-200 ${
          isDark 
            ? 'left-0.5 bg-[var(--accent-primary)]' 
            : 'left-[calc(100%-14px)] bg-[var(--accent-warning)]'
        }`}></div>
      </div>
    </button>
  );
}
