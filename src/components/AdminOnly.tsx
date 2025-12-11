/**
 * AdminOnly Component
 *
 * Wrapper for admin-only actions with role-based UI
 * - Shows normal UI for admin users
 * - Shows disabled + grayed out UI with tooltip for readonly users
 * - Backend is the authority; frontend reflects backend state
 */
'use client';

import React, { ReactNode, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface AdminOnlyProps {
  children: ReactNode;
  fallback?: ReactNode;
  tooltip?: string;
}

export function AdminOnly({ children, fallback, tooltip = 'Admin access required' }: AdminOnlyProps) {
  const { user, loginRequired } = useAuth();
  const [showTooltip, setShowTooltip] = useState(false);

  // If login not required, allow all actions (act as admin)
  if (!loginRequired) {
    return <>{children}</>;
  }

  // If user is admin, render children normally
  if (user && user.role === 'admin') {
    return <>{children}</>;
  }

  // If user is readonly or not authenticated, show fallback or disabled state
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default fallback: wrap children in disabled container with tooltip
  return (
    <div
      className="admin-only-disabled"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <div
        style={{
          opacity: 0.5,
          pointerEvents: 'none',
          filter: 'grayscale(50%)',
          cursor: 'not-allowed'
        }}
      >
        {children}
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="admin-tooltip font-mono"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(239, 68, 68, 0.9)',
            border: '1px solid rgba(239, 68, 68, 1)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            animation: 'tooltip-appear 0.2s ease-out'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔒</span>
            <span>{tooltip}</span>
          </div>
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid rgba(239, 68, 68, 1)'
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes tooltip-appear {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Hook to check if current user is admin
 */
export function useIsAdmin(): boolean {
  const { user, loginRequired } = useAuth();

  // If login not required, everyone is admin
  if (!loginRequired) {
    return true;
  }

  return user?.role === 'admin';
}

/**
 * Disabled button component for readonly users
 */
interface DisabledButtonProps {
  tooltip?: string;
  className?: string;
}

export function DisabledButton({ tooltip = 'Admin only', className = '' }: DisabledButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={`disabled-button ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        disabled
        style={{
          opacity: 0.5,
          cursor: 'not-allowed',
          filter: 'grayscale(50%)'
        }}
      >
        Action Disabled
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="admin-tooltip font-mono"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '0.5rem',
            padding: '0.5rem 0.75rem',
            background: 'rgba(239, 68, 68, 0.9)',
            border: '1px solid rgba(239, 68, 68, 1)',
            borderRadius: '4px',
            color: 'white',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
        >
          🔒 {tooltip}
        </div>
      )}
    </div>
  );
}
