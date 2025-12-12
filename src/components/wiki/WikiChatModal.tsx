'use client';

import React, { useEffect, useRef } from 'react';
import { FaComments } from 'react-icons/fa';
import Ask from '@/components/Ask';
import { RepoInfo } from '@/types/repoinfo';

interface WikiChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoInfo: RepoInfo;
  selectedProvider: string;
  selectedModel: string;
  isCustomModel: boolean;
  customModel: string;
  language: string;
  messages?: {
    ask?: {
      title?: string;
    };
  };
}

const WikiChatModal: React.FC<WikiChatModalProps> = ({
  isOpen,
  onClose,
  repoInfo,
  selectedProvider,
  selectedModel,
  isCustomModel,
  customModel,
  language,
  messages = {}
}) => {
  const askComponentRef = useRef<{ clearConversation: () => void } | null>(null);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Floating Chat Button - Dark Mode, No Glow */}
      <button
        onClick={() => {}} // Button handled by parent
        className="fixed bottom-8 right-8 group z-50"
        aria-label={messages.ask?.title || 'Ask about this repository'}
        style={{ display: isOpen ? 'none' : 'block' }}
      >
        {/* Button container - always dark mode styling */}
        <div className="relative flex items-center gap-3 px-5 py-3 bg-[#13132b]/98 backdrop-blur-md rounded-xl border-2 border-[#8b5cf6]/50 group-hover:border-[#06b6d4] transition-all shadow-xl overflow-hidden">
          {/* Scan line effect */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06b6d4]/10 to-transparent translate-y-[-100%] group-hover:translate-y-[100%] transition-transform duration-1000"></div>

          {/* Terminal prompt */}
          <div className="relative flex items-center gap-2">
            <span className="font-mono text-[#8b5cf6] text-sm font-bold">$</span>
            <FaComments className="text-xl text-[#06b6d4] group-hover:scale-110 transition-transform" />
          </div>

          {/* Label */}
          <span className="relative font-mono text-sm font-semibold text-[#f8fafc] whitespace-nowrap">
            ASK AI
          </span>

          {/* Status indicator - static, no glow */}
          <span className="relative w-2 h-2 bg-[#10b981] rounded-full"></span>
        </div>
      </button>

      {/* Terminal Chat Modal - Bottom Center */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 transition-all duration-500 ease-out ${
          isOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop blur overlay */}
        <div
          className={`fixed inset-0 transition-opacity duration-300 ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={onClose}
        ></div>

        {/* Terminal Window Container */}
        <div className="relative w-full max-w-6xl">
          {/* Ambient glow */}
          <div className="absolute -inset-4 bg-gradient-to-t from-[var(--accent-primary)]/20 via-[var(--accent-cyan)]/10 to-transparent rounded-3xl blur-2xl opacity-80"></div>

          {/* Terminal Window */}
          <div className="relative bg-[var(--surface)]/98 backdrop-blur-xl rounded-2xl shadow-[0_-10px_50px_rgba(139,92,246,0.3)] border-2 border-[var(--accent-primary)]/40 overflow-hidden max-h-[80vh] flex flex-col">
            {/* Terminal Header */}
            <div className="relative bg-gradient-to-r from-[var(--accent-primary)]/10 to-[var(--accent-cyan)]/10 border-b-2 border-[var(--accent-primary)]/30 px-5 py-2">
              {/* Grid pattern overlay */}
              <div className="absolute inset-0 opacity-5" style={{
                backgroundImage: 'linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}></div>

              <div className="relative flex items-center justify-between">
                {/* Left: Traffic lights + Title */}
                <div className="flex items-center gap-4">
                  {/* Traffic light dots */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={onClose}
                      className="w-3 h-3 rounded-full bg-[var(--accent-danger)] hover:bg-red-400 transition-colors border border-red-900/30"
                      aria-label="Close"
                    ></button>
                    <div className="w-3 h-3 rounded-full bg-[var(--accent-warning)] border border-yellow-900/30"></div>
                    <div className="w-3 h-3 rounded-full bg-[var(--accent-emerald)] border border-emerald-900/30"></div>
                  </div>

                  {/* Terminal title */}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--accent-primary)] font-bold">◆</span>
                    <h3 className="font-mono text-sm font-bold text-[var(--foreground)] tracking-tight">
                      {messages.ask?.title || 'AI CHAT TERMINAL'}
                    </h3>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      / {repoInfo.owner}/{repoInfo.repo}
                    </span>
                  </div>
                </div>

                {/* Right: Status indicators */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/30">
                    <span className="w-2 h-2 bg-[var(--accent-emerald)] rounded-full animate-pulse"></span>
                    <span className="font-mono text-xs text-[var(--accent-emerald)] font-semibold">ONLINE</span>
                  </div>

                  <button
                    onClick={onClose}
                    className="p-2 hover:bg-[var(--accent-primary)]/10 rounded-lg transition-colors group"
                    aria-label="Minimize"
                  >
                    <svg className="w-4 h-4 text-[var(--muted)] group-hover:text-[var(--accent-cyan)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Command line indicator */}
              <div className="mt-3 flex items-center gap-2 font-mono text-xs text-[var(--accent-cyan)]/70">
                <span>$</span>
                <span className="text-[var(--muted)]">ai-chat --repo={repoInfo.repo} --interactive</span>
              </div>
            </div>

            {/* Terminal Content Area */}
            <div className="relative flex-1 min-h-[200px] min-h-[20vh] overflow-y-auto p-6 bg-[var(--background)]/30">
              {/* Subtle scan line effect */}
              <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, var(--accent-cyan) 2px, var(--accent-cyan) 4px)'
              }}></div>

              <div className="relative">
                <Ask
                  repoInfo={repoInfo}
                  provider={selectedProvider}
                  model={selectedModel}
                  isCustomModel={isCustomModel}
                  customModel={customModel}
                  language={language}
                  onRef={(ref) => (askComponentRef.current = ref)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default WikiChatModal;