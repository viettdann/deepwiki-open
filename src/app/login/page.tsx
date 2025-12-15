'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading, loginRequired } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Animation mount effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const returnUrl = searchParams?.get('returnUrl') || '/';
      router.push(returnUrl);
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  // Redirect if login not required
  useEffect(() => {
    if (!isLoading && !loginRequired) {
      router.push('/');
    }
  }, [loginRequired, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      const returnUrl = searchParams?.get('returnUrl') || '/';
      router.push(returnUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || !mounted) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="terminal-loading">
          <div className="font-mono text-[var(--accent-cyan)] text-sm">
            <span className="typing-cursor">█</span> Initializing...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      {/* Grid background */}
      <div className="grid-bg" />

      {/* Scan-line effect */}
      <div className="scan-line" />

      {/* Main content */}
      <div className="login-content">
        {/* Terminal window */}
        <div className={`terminal-window ${mounted ? 'terminal-mount' : ''}`}>
          {/* Traffic light dots */}
          <div className="terminal-header">
            <div className="traffic-lights">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
            </div>
            <div className="terminal-title font-mono">
              <span className="text-[var(--accent-cyan)]">$</span> deepwiki.auth
            </div>
            <ThemeToggle />
            <div className="terminal-badge">
              <span className="badge-dot" />
              <span className="font-mono text-xs">SECURE</span>
            </div>
          </div>

          {/* Terminal body */}
          <div className="terminal-body">
            {/* System info */}
            <div className="terminal-info font-mono">
              <div className="info-line">
                <span className="text-[var(--accent-primary)]">▸</span> System: <span className="text-[var(--accent-cyan)]">DeepWiki Authentication</span>
              </div>
              <div className="info-line">
                <span className="text-[var(--accent-primary)]">▸</span> Status: <span className="text-[var(--accent-emerald)]">ONLINE</span>
              </div>
              <div className="info-line">
                <span className="text-[var(--accent-primary)]">▸</span> Required: <span className="text-[var(--foreground-muted)]">Valid credentials</span>
              </div>
            </div>

            {/* Divider */}
            <div className="terminal-divider" />

            {/* Login form */}
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-section">
                <label className="form-label font-mono">
                  <span className="label-prefix text-[var(--accent-cyan)]">›</span> username
                </label>
                <div className="input-container">
                  <span className="input-prefix font-mono">$</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="terminal-input font-mono"
                    placeholder="Enter username"
                    required
                    autoComplete="username"
                    disabled={loading}
                  />
                  <span className="input-cursor">█</span>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label font-mono">
                  <span className="label-prefix text-[var(--accent-cyan)]">›</span> password
                </label>
                <div className="input-container">
                  <span className="input-prefix font-mono">$</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="terminal-input font-mono"
                    placeholder="Enter password"
                    required
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <span className="input-cursor">█</span>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="error-message font-mono">
                  <span className="text-[var(--accent-danger)]">✕</span> {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="terminal-submit font-mono"
              >
                <span className="btn-text">
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Authenticating...
                    </>
                  ) : (
                    <>
                      <span className="text-[var(--accent-cyan)]">→</span> Authenticate
                    </>
                  )}
                </span>
                <span className="btn-glow" />
              </button>
            </form>

            {/* Footer info */}
            <div className="terminal-footer font-mono">
              <div className="footer-line">
                <span className="text-[var(--foreground-muted)]"># I&apos;m try so hard and got sofa</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .login-container {
          min-height: 100vh;
          background: var(--background);
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        /* Grid background */
        .grid-bg {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(139, 92, 246, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: grid-shift 20s linear infinite;
        }

        @keyframes grid-shift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }

        /* Scan-line effect */
        .scan-line {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(6, 182, 212, 0.03) 50%,
            transparent 100%
          );
          animation: scan 4s linear infinite;
          pointer-events: none;
        }

        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }

        .login-content {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 600px;
        }

        /* Terminal window */
        .terminal-window {
          background: rgba(19, 19, 43, 0.8);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 12px;
          box-shadow:
            0 0 0 1px rgba(139, 92, 246, 0.1),
            0 20px 60px rgba(0, 0, 0, 0.5),
            0 0 100px rgba(139, 92, 246, 0.1);
          overflow: hidden;
          opacity: 0;
          transform: translateY(20px);
        }

        .terminal-mount {
          animation: terminal-appear 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes terminal-appear {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Terminal header */
        .terminal-header {
          background: rgba(10, 10, 31, 0.6);
          border-bottom: 1px solid rgba(139, 92, 246, 0.2);
          padding: 0.75rem 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .traffic-lights {
          display: flex;
          gap: 0.5rem;
        }

        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          position: relative;
        }

        .dot::after {
          content: '';
          position: absolute;
          inset: 2px;
          border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3), transparent);
        }

        .dot-red {
          background: #ef4444;
          box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }

        .dot-yellow {
          background: #f59e0b;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
        }

        .dot-green {
          background: #10b981;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }

        .terminal-title {
          flex: 1;
          font-size: 0.875rem;
          color: var(--foreground-muted);
        }

        .terminal-badge {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 4px;
          color: var(--accent-emerald);
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-emerald);
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Terminal body */
        .terminal-body {
          padding: 2rem;
        }

        /* Terminal info */
        .terminal-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
        }

        .info-line {
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          animation: fade-in-up 0.4s ease-out backwards;
        }

        .info-line:nth-child(1) { animation-delay: 0.1s; }
        .info-line:nth-child(2) { animation-delay: 0.2s; }
        .info-line:nth-child(3) { animation-delay: 0.3s; }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* Divider */
        .terminal-divider {
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(139, 92, 246, 0.3),
            transparent
          );
          margin: 1.5rem 0;
        }

        /* Login form */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          animation: fade-in-up 0.4s ease-out 0.4s backwards;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-label {
          font-size: 0.875rem;
          color: var(--foreground-muted);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .label-prefix {
          font-weight: 600;
        }

        .input-container {
          position: relative;
          display: flex;
          align-items: center;
          background: rgba(10, 10, 31, 0.5);
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 6px;
          transition: all 0.3s ease;
        }

        .input-container:focus-within {
          border-color: var(--accent-cyan);
          box-shadow:
            0 0 0 3px rgba(6, 182, 212, 0.1),
            0 0 20px rgba(6, 182, 212, 0.2);
        }

        .input-prefix {
          padding: 0.75rem;
          color: var(--accent-primary);
          font-size: 0.875rem;
          border-right: 1px solid rgba(139, 92, 246, 0.2);
        }

        .terminal-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 0.75rem;
          color: var(--foreground);
          font-size: 0.875rem;
        }

        .terminal-input::placeholder {
          color: var(--foreground-muted);
          opacity: 0.5;
        }

        .terminal-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .input-cursor {
          padding-right: 0.75rem;
          color: var(--accent-cyan);
          font-size: 0.75rem;
          animation: blink 1s step-end infinite;
          opacity: 0;
        }

        .input-container:focus-within .input-cursor {
          opacity: 1;
        }

        @keyframes blink {
          50% { opacity: 0; }
        }

        /* Error message */
        .error-message {
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 6px;
          color: var(--accent-danger);
          font-size: 0.875rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          animation: shake 0.4s ease-out;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }

        /* Submit button */
        .terminal-submit {
          position: relative;
          padding: 1rem;
          background: rgba(6, 182, 212, 0.1);
          border: 1px solid var(--accent-cyan);
          border-radius: 6px;
          color: var(--accent-cyan);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          overflow: hidden;
          transition: all 0.3s ease;
        }

        .terminal-submit:hover:not(:disabled) {
          background: rgba(6, 182, 212, 0.2);
          box-shadow: 0 0 30px rgba(6, 182, 212, 0.3);
          transform: translateY(-2px);
        }

        .terminal-submit:active:not(:disabled) {
          transform: translateY(0);
        }

        .terminal-submit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-text {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }

        .btn-glow {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(6, 182, 212, 0.3),
            transparent
          );
          transform: translateX(-100%);
          transition: transform 0.6s ease;
        }

        .terminal-submit:hover:not(:disabled) .btn-glow {
          transform: translateX(100%);
        }

        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(6, 182, 212, 0.3);
          border-top-color: var(--accent-cyan);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Terminal footer */
        .terminal-footer {
          margin-top: 2rem;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(139, 92, 246, 0.1);
          font-size: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .footer-line {
          color: var(--foreground-muted);
          opacity: 0.6;
        }

        /* Terminal loading */
        .terminal-loading {
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .typing-cursor {
          animation: blink 1s step-end infinite;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .login-container {
            padding: 1rem;
          }

          .terminal-body {
            padding: 1.5rem;
          }

          .terminal-header {
            padding: 0.5rem 0.75rem;
          }

          .terminal-title {
            font-size: 0.75rem;
          }

          .terminal-badge {
            display: none;
          }
        }

        /* Light mode tweaks */
        :global(.light) .terminal-window {
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid rgba(124, 58, 237, 0.18);
          box-shadow:
            0 0 0 1px rgba(124, 58, 237, 0.08),
            0 18px 50px rgba(0, 0, 0, 0.12),
            0 0 80px rgba(124, 58, 237, 0.08);
        }

        :global(.light) .terminal-header {
          background: rgba(240, 238, 234, 0.9);
          border-bottom: 1px solid rgba(124, 58, 237, 0.15);
        }

        :global(.light) .input-container {
          background: rgba(255, 255, 255, 0.92);
          border: 1px solid rgba(124, 58, 237, 0.18);
        }

        :global(.light) .input-prefix {
          color: var(--accent-primary);
          border-right: 1px solid rgba(124, 58, 237, 0.15);
        }

        :global(.light) .terminal-input {
          color: var(--foreground);
        }

        :global(.light) .terminal-divider {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(124, 58, 237, 0.35),
            transparent
          );
        }

        :global(.light) .terminal-submit {
          background: rgba(8, 145, 178, 0.08);
          border-color: var(--accent-cyan);
          color: var(--accent-cyan);
        }
      `}</style>
    </div>
  );
}
