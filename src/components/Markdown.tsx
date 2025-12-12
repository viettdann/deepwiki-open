import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import Mermaid from './Mermaid';

interface MarkdownProps {
  content: string;
}

const Markdown: React.FC<MarkdownProps> = ({ content }) => {
  // Define markdown components with Terminal Codex styling
  const MarkdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
    p({ children, ...props }: { children?: React.ReactNode }) {
      return <p className="mb-4 text-[15px] leading-[1.75] text-[var(--foreground)]" {...props}>{children}</p>;
    },
    h1({ children, ...props }: { children?: React.ReactNode }) {
      return (
        <h1
          className="text-4xl font-bold font-mono mt-0 mb-6 tracking-tight text-[var(--foreground)] bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] bg-clip-text text-transparent leading-tight font-mono"
          style={{ WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          {...props}
        >
          {children}
        </h1>
      );
    },
    h2({ children, ...props }: { children?: React.ReactNode }) {
      // Special styling for ReAct headings
      if (children && typeof children === 'string') {
        const text = children.toString();
        if (text.includes('Thought') || text.includes('Action') || text.includes('Observation') || text.includes('Answer')) {
          return (
            <h2
              className={`text-sm font-bold font-mono mt-6 mb-3 p-3 rounded-lg border-2 ${
                text.includes('Thought') ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                text.includes('Action') ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                text.includes('Observation') ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                text.includes('Answer') ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' :
                'text-[var(--foreground)]'
              }`}
              {...props}
            >
              {children}
            </h2>
          );
        }
      }
      return (
        <h2 className="text-2xl font-bold font-mono mt-10 mb-4 pb-2 border-b-2 border-[var(--accent-primary)]/20 text-[var(--foreground)] tracking-tight flex items-center gap-2 before:content-['▸'] before:text-[var(--accent-primary)]" {...props}>
          {children}
        </h2>
      );
    },
    h3({ children, ...props }: { children?: React.ReactNode }) {
      return (
        <h3 className="text-xl font-semibold font-mono mt-8 mb-3 text-[var(--accent-secondary)] flex items-center gap-2 before:content-['›'] before:text-[var(--accent-cyan)]" {...props}>
          {children}
        </h3>
      );
    },
    h4({ children, ...props }: { children?: React.ReactNode }) {
      return <h4 className="text-lg font-semibold font-mono mt-6 mb-2 text-[var(--foreground)]" {...props}>{children}</h4>;
    },
    ul({ children, ...props }: { children?: React.ReactNode }) {
      return <ul className="list-none pl-0 mb-5 space-y-2 [&>li]:before:content-['▸'] [&>li]:before:text-[var(--accent-primary)] [&>li]:before:mr-3 [&>li]:before:font-bold" {...props}>{children}</ul>;
    },
    ol({ children, ...props }: { children?: React.ReactNode }) {
      return <ol className="list-decimal pl-6 mb-5 space-y-2 [&>li::marker]:text-[var(--accent-cyan)] [&>li::marker]:font-bold [&>li::marker]:font-mono" {...props}>{children}</ol>;
    },
    li({ children, ...props }: { children?: React.ReactNode }) {
      return <li className="mb-2 text-[15px] leading-relaxed text-[var(--foreground)]" {...props}>{children}</li>;
    },
    a({ children, href, ...props }: { children?: React.ReactNode; href?: string }) {
      return (
        <a
          href={href}
          className="text-[var(--accent-cyan)] hover:text-[var(--highlight)] font-medium border-b border-[var(--accent-cyan)]/30 hover:border-[var(--accent-cyan)] transition-all no-underline"
          target="_blank"
          rel="noopener noreferrer"
          {...props}
        >
          {children}
        </a>
      );
    },
    blockquote({ children, ...props }: { children?: React.ReactNode }) {
      return (
        <blockquote
          className="relative border-l-4 border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 pl-6 pr-4 py-4 italic my-6 rounded-r-lg text-[var(--foreground)] before:content-['“'] before:absolute before:left-3 before:-top-2 before:text-5xl before:text-[var(--accent-primary)] before:opacity-20 before:font-serif"
          {...props}
        >
          {children}
        </blockquote>
      );
    },
    table({ children, ...props }: { children?: React.ReactNode }) {
      return (
        <div className="overflow-x-auto my-8 rounded-lg border-2 border-[var(--accent-primary)]/20">
          <table className="min-w-full text-sm border-collapse" {...props}>
            {children}
          </table>
        </div>
      );
    },
    thead({ children, ...props }: { children?: React.ReactNode }) {
      return <thead className="bg-[var(--accent-primary)]/10" {...props}>{children}</thead>;
    },
    tbody({ children, ...props }: { children?: React.ReactNode }) {
      return <tbody className="divide-y divide-[var(--accent-primary)]/10" {...props}>{children}</tbody>;
    },
    tr({ children, ...props }: { children?: React.ReactNode }) {
      return <tr className="hover:bg-[var(--accent-primary)]/5 transition-colors" {...props}>{children}</tr>;
    },
    th({ children, ...props }: { children?: React.ReactNode }) {
      return (
        <th
          className="px-4 py-3 text-left font-semibold font-mono text-[var(--foreground)] text-sm border border-[var(--accent-primary)]/20"
          {...props}
        >
          {children}
        </th>
      );
    },
    td({ children, ...props }: { children?: React.ReactNode }) {
      return <td className="px-4 py-3 border border-[var(--accent-primary)]/10 text-[var(--foreground)]" {...props}>{children}</td>;
    },
    code(props: {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any; // Using any here as it's required for ReactMarkdown components
    }) {
      const { inline, className, children, ...otherProps } = props;
      const match = /language-(\w+)/.exec(className || '');
      const codeContent = children ? String(children).replace(/\n$/, '') : '';

      // Handle Mermaid diagrams
      if (!inline && match && match[1] === 'mermaid') {
        return (
          <div className="my-8 bg-[var(--background)] rounded-lg overflow-hidden border-2 border-[var(--accent-primary)]/30 shadow-lg">
            <div className="bg-[var(--accent-primary)]/5 px-4 py-2 border-b-2 border-[var(--accent-primary)]/20 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
              <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
              <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
              <span className="ml-2 text-xs font-mono text-[var(--accent-cyan)]">DIAGRAM</span>
            </div>
            <Mermaid
              chart={codeContent}
              className="w-full max-w-full p-4"
              zoomingEnabled={true}
            />
          </div>
        );
      }

      // Handle code blocks
      if (!inline && match) {
        return (
          <div className="my-6 rounded-lg overflow-hidden border-2 border-[var(--accent-primary)]/30 shadow-lg relative">
            {/* Terminal header */}
            <div className="bg-[var(--accent-primary)]/5 px-4 py-2 border-b-2 border-[var(--accent-primary)]/20 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                </div>
                <span className="text-xs font-mono font-semibold text-[var(--accent-cyan)]">{match[1].toUpperCase()}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeContent);
                }}
                className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors"
                title="Copy code"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
            {/* Decorative corner marker */}
            <div className="absolute top-3 right-12 text-[var(--accent-primary)] opacity-20 text-xs font-mono">◆</div>
            <SyntaxHighlighter
              language={match[1]}
              style={tomorrow}
              className="!text-sm !font-mono"
              customStyle={{
                margin: 0,
                borderRadius: 0,
                padding: '1.25rem',
                background: 'var(--background)',
              }}
              showLineNumbers={true}
              wrapLines={true}
              wrapLongLines={true}
              {...otherProps}
            >
              {codeContent}
            </SyntaxHighlighter>
          </div>
        );
      }

      // Handle inline code
      return (
        <code
          className={`${className} font-mono bg-[var(--accent-primary)]/10 px-2 py-1 rounded border border-[var(--accent-primary)]/20 text-[var(--accent-cyan)] text-sm font-medium`}
          {...otherProps}
        >
          {children}
        </code>
      );
    },
  };

  return (
    <div className="prose prose-base max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={MarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;