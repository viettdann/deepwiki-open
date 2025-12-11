/**
 * Permission Denied Modal - Terminal Codex Theme
 *
 * Beautiful terminal-styled modal shown when readonly users attempt admin actions
 * Matches AGENTS.themes.md aesthetic: purple/cyan, monospace, traffic lights, scan-lines
 */
'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PermissionDeniedModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
}

export function PermissionDeniedModal({ isOpen, onClose, action = 'perform this action' }: PermissionDeniedModalProps) {
  const [mounted, setMounted] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAnimateIn(true);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      setAnimateIn(false);
      document.body.style.overflow = '';
    }

    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const modalContent = (
    <>
      {/* Backdrop with scan-line effect */}
      <div
        className="permission-denied-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          opacity: animateIn ? 1 : 0,
          transition: 'opacity 0.3s ease-out',
          backgroundImage: `
            repeating-linear-gradient(
              0deg,
              rgba(139, 92, 246, 0.03) 0px,
              transparent 1px,
              transparent 2px,
              rgba(139, 92, 246, 0.03) 3px
            )
          `
        }}
      />

      {/* Terminal Window */}
      <div
        className="permission-denied-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: animateIn
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -50%) scale(0.9)',
          width: '90%',
          maxWidth: '600px',
          backgroundColor: '#0a0a0f',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '12px',
          boxShadow: `
            0 0 0 1px rgba(139, 92, 246, 0.1),
            0 0 40px rgba(139, 92, 246, 0.15),
            0 20px 60px rgba(0, 0, 0, 0.5)
          `,
          zIndex: 10000,
          opacity: animateIn ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          overflow: 'hidden',
          fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace'
        }}
      >
        {/* Terminal Header with Traffic Lights */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
            borderBottom: '1px solid rgba(139, 92, 246, 0.2)'
          }}
        >
          {/* Traffic Light Dots */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)'
            }} />
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
              boxShadow: '0 0 8px rgba(245, 158, 11, 0.5)'
            }} />
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
              opacity: 0.3
            }} />
          </div>

          {/* Terminal Title */}
          <div style={{
            color: 'rgba(139, 92, 246, 0.7)',
            fontSize: '11px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            fontWeight: 500
          }}>
            system/auth/deny.sh
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(139, 92, 246, 0.5)',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s',
              fontWeight: 'bold'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(139, 92, 246, 0.9)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(139, 92, 246, 0.5)'}
          >
            ×
          </button>
        </div>

        {/* Terminal Content */}
        <div style={{ padding: '32px 24px' }}>
          {/* Error Icon with Glow */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.2) 0%, transparent 70%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid rgba(239, 68, 68, 0.3)',
              animation: 'pulse-error 2s ease-in-out infinite'
            }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
          </div>

          {/* Error Message */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h2 style={{
              color: '#ef4444',
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '8px',
              letterSpacing: '-0.5px'
            }}>
              ▸ PERMISSION DENIED
            </h2>
            <div style={{
              color: 'rgba(139, 92, 246, 0.4)',
              fontSize: '12px',
              letterSpacing: '1px',
              marginBottom: '16px'
            }}>
              ERROR CODE: 403_FORBIDDEN
            </div>
          </div>

          {/* Terminal Output */}
          <div style={{
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '6px',
            padding: '16px',
            marginBottom: '24px',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: '13px',
            lineHeight: '1.6'
          }}>
            <div style={{ color: 'rgba(139, 92, 246, 0.7)', marginBottom: '8px' }}>
              $ sudo {action}
            </div>
            <div style={{ color: '#ef4444', marginBottom: '4px' }}>
              ✗ Permission denied
            </div>
            <div style={{ color: 'rgba(139, 92, 246, 0.5)' }}>
              › User role: <span style={{ color: '#06b6d4' }}>readonly</span>
            </div>
            <div style={{ color: 'rgba(139, 92, 246, 0.5)' }}>
              › Required role: <span style={{ color: '#8b5cf6' }}>admin</span>
            </div>
            <div style={{ color: 'rgba(139, 92, 246, 0.5)', marginTop: '8px' }}>
              › Contact your system administrator to request elevated privileges.
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center'
          }}>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                color: '#8b5cf6',
                padding: '10px 24px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: '"JetBrains Mono", monospace',
                transition: 'all 0.2s',
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.1) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ✓ ACKNOWLEDGE
            </button>
          </div>
        </div>

        {/* Decorative Grid Pattern */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          pointerEvents: 'none',
          opacity: 0.5
        }} />
      </div>

      {/* Keyframe Animations */}
      <style jsx>{`
        @keyframes pulse-error {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.05);
          }
        }
      `}</style>
    </>
  );

  return createPortal(modalContent, document.body);
}
