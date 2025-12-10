/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import Ask from '@/components/Ask';
import Markdown from '@/components/Markdown';
import ModelSelectionModal from '@/components/ModelSelectionModal';
import WikiTreeView from '@/components/WikiTreeView';
import { useLanguage } from '@/contexts/LanguageContext';
import { RepoInfo } from '@/types/repoinfo';
import getRepoUrl from '@/utils/getRepoUrl';
import { extractUrlDomain, extractUrlPath } from '@/utils/urlDecoder';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { findActiveJob, startBackgroundWikiGeneration } from '@/utils/backgroundJobClient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaBitbucket, FaBookOpen, FaComments, FaDownload, FaExclamationTriangle, FaFileExport, FaFolder, FaGithub, FaGitlab, FaHome, FaSync, FaTimes } from 'react-icons/fa';

interface WikiSection {
  id: string;
  title: string;
  pages: string[];
  subsections?: string[];
}

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

interface WikiStructure {
  id: string;
  title: string;
  description: string;
  pages: WikiPage[];
  sections: WikiSection[];
  rootSections: string[];
}

const wikiStyles = `
  /* Terminal Codex Wiki Styles */
  .prose {
    @apply text-[var(--foreground)] max-w-none;
    word-wrap: break-word;
    overflow-wrap: break-word;
    font-size: 15px;
    line-height: 1.75;
  }

  .prose * {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .prose code {
    @apply bg-[var(--accent-primary)]/10 px-2 py-1 rounded-md font-mono text-sm border border-[var(--accent-primary)]/20;
    word-break: break-all;
    white-space: pre-wrap;
    max-width: 100%;
    color: var(--accent-cyan);
    font-weight: 500;
  }

  .prose pre {
    @apply bg-[var(--background)] text-[var(--foreground)] rounded-lg p-5 overflow-x-auto border-2 border-[var(--accent-primary)]/30;
    word-break: normal;
    box-shadow: 0 4px 20px rgba(139, 92, 246, 0.15), inset 0 0 0 1px rgba(139, 92, 246, 0.1);
    position: relative;
  }

  .prose pre::before {
    content: '◆';
    position: absolute;
    top: 12px;
    right: 12px;
    color: var(--accent-primary);
    opacity: 0.3;
    font-size: 10px;
  }

  .prose h1 {
    @apply font-mono text-[var(--foreground)] font-bold tracking-tight;
    word-wrap: break-word;
    font-size: 2.25rem;
    margin-top: 0;
    margin-bottom: 1.5rem;
    letter-spacing: -0.025em;
    background: linear-gradient(135deg, var(--gradient-from), var(--gradient-to));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .prose h2 {
    @apply font-mono text-[var(--foreground)] font-bold;
    word-wrap: break-word;
    font-size: 1.75rem;
    margin-top: 2.5rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid var(--accent-primary)/20;
    letter-spacing: -0.015em;
  }

  .prose h2::before {
    content: '▸ ';
    color: var(--accent-primary);
    margin-right: 0.5rem;
    font-size: 0.9em;
  }

  .prose h3 {
    @apply font-mono text-[var(--foreground)] font-semibold;
    word-wrap: break-word;
    font-size: 1.375rem;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    color: var(--accent-secondary);
  }

  .prose h3::before {
    content: '› ';
    color: var(--accent-cyan);
    margin-right: 0.375rem;
  }

  .prose h4 {
    @apply font-mono text-[var(--foreground)] font-semibold;
    word-wrap: break-word;
    font-size: 1.125rem;
    margin-top: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .prose p {
    @apply text-[var(--foreground)] leading-relaxed;
    word-wrap: break-word;
    overflow-wrap: break-word;
    margin-bottom: 1.25rem;
  }

  .prose a {
    @apply text-[var(--accent-cyan)] hover:text-[var(--highlight)] transition-all no-underline;
    word-wrap: break-word;
    overflow-wrap: break-word;
    font-weight: 500;
    position: relative;
    border-bottom: 1px solid var(--accent-cyan)/30;
    padding-bottom: 1px;
  }

  .prose a:hover {
    border-bottom-color: var(--accent-cyan);
  }

  .prose blockquote {
    @apply border-l-4 border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 pl-5 py-3 italic rounded-r-lg;
    word-wrap: break-word;
    overflow-wrap: break-word;
    margin: 1.5rem 0;
    position: relative;
  }

  .prose blockquote::before {
    content: '"';
    position: absolute;
    left: 12px;
    top: -8px;
    font-size: 3rem;
    color: var(--accent-primary);
    opacity: 0.2;
    font-family: Georgia, serif;
  }

  .prose ul, .prose ol {
    @apply text-[var(--foreground)];
    margin: 1.25rem 0;
    padding-left: 1.75rem;
  }

  .prose li {
    word-wrap: break-word;
    overflow-wrap: break-word;
    margin-bottom: 0.5rem;
    position: relative;
  }

  .prose ul > li::marker {
    color: var(--accent-primary);
  }

  .prose ol > li::marker {
    color: var(--accent-cyan);
    font-weight: 600;
  }

  .prose table {
    @apply border-collapse border-2 border-[var(--accent-primary)]/20 rounded-lg overflow-hidden;
    word-wrap: break-word;
    margin: 2rem 0;
    width: 100%;
  }

  .prose th {
    @apply bg-[var(--accent-primary)]/10 text-[var(--foreground)] p-3 border border-[var(--accent-primary)]/20 font-mono font-semibold text-sm;
    word-wrap: break-word;
    text-align: left;
  }

  .prose td {
    @apply p-3 border border-[var(--accent-primary)]/10;
    word-wrap: break-word;
  }

  .prose tbody tr {
    transition: background-color 0.2s ease;
  }

  .prose tbody tr:hover {
    background-color: var(--accent-primary)/5;
  }

  .prose tbody tr:hover th,
  .prose tbody tr:hover td {
    border-color: var(--accent-primary)/30;
  }

  /* Handle very long text strings like source citations */
  .prose :not(pre) > code {
    word-break: break-all;
    white-space: normal;
  }

  /* Details/Summary enhancement */
  .prose details {
    @apply border border-[var(--accent-primary)]/20 rounded-lg p-4 my-4 bg-[var(--background)]/50;
  }

  .prose summary {
    @apply font-mono font-semibold cursor-pointer text-[var(--accent-primary)] hover:text-[var(--accent-secondary)] transition-colors;
  }

  .prose summary::marker {
    color: var(--accent-cyan);
  }
`;

const getCacheKey = (owner: string, repo: string, repoType: string, language: string, isComprehensive: boolean = true): string => {
  return `deepwiki_cache_${repoType}_${owner}_${repo}_${language}_${isComprehensive ? 'comprehensive' : 'concise'}`;
};

type RequestBody = {
  [key: string]: unknown;
};

const addTokensToRequestBody = (
  requestBody: RequestBody,
  token: string,
  repoType: string,
  provider: string = '',
  model: string = '',
  isCustomModel: boolean = false,
  customModel: string = '',
  language: string = 'en',
  excludedDirs?: string,
  excludedFiles?: string,
  includedDirs?: string,
  includedFiles?: string
): void => {
  if (token !== '') {
    requestBody.token = token;
  }
  requestBody.provider = provider;
  requestBody.model = model;
  if (isCustomModel && customModel) {
    requestBody.custom_model = customModel;
  }
  requestBody.language = language;
  if (excludedDirs) {
    requestBody.excluded_dirs = excludedDirs;
  }
  if (excludedFiles) {
    requestBody.excluded_files = excludedFiles;
  }
  if (includedDirs) {
    requestBody.included_dirs = includedDirs;
  }
  if (includedFiles) {
    requestBody.included_files = includedFiles;
  }
};

const createGithubHeaders = (githubToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Accept': 'application/vnd.github.v3+json'
  };
  if (githubToken) {
    headers['Authorization'] = `Bearer ${githubToken}`;
  }
  return headers;
};

const createGitlabHeaders = (gitlabToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (gitlabToken) {
    headers['PRIVATE-TOKEN'] = gitlabToken;
  }
  return headers;
};

const createAzureHeaders = (azureToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (azureToken) {
    const encoded = btoa(`:${azureToken}`);
    headers['Authorization'] = `Basic ${encoded}`;
  }
  return headers;
};

interface AzureRepoInfo {
  organization: string;
  project: string;
  repository: string;
  baseUrl: string;
}

const parseAzureRepoUrl = (repoUrl: string | null): AzureRepoInfo | null => {
  if (!repoUrl) return null;
  try {
    const url = new URL(repoUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    let organization = '';
    let project = '';
    let repository = '';
    if (url.hostname.includes('dev.azure.com')) {
      organization = segments[0];
      project = segments[1];
      const repoIndex = segments.findIndex((seg) => seg.toLowerCase() === '_git');
      repository = repoIndex >= 0 && segments[repoIndex + 1] ? segments[repoIndex + 1] : segments[3];
      return organization && project && repository
        ? {
            organization,
            project,
            repository,
            baseUrl: `${url.protocol}//${url.hostname}`,
          }
        : null;
    }
    if (url.hostname.includes('visualstudio.com')) {
      organization = url.hostname.split('.')[0];
      project = segments[0];
      const repoIndex = segments.findIndex((seg) => seg.toLowerCase() === '_git');
      repository = repoIndex >= 0 && segments[repoIndex + 1] ? segments[repoIndex + 1] : segments[2];
      return organization && project && repository
        ? {
            organization,
            project,
            repository,
            baseUrl: `${url.protocol}//${organization}.visualstudio.com`,
          }
        : null;
    }
    return null;
  } catch (err) {
    console.warn('Failed to parse Azure repo URL', err);
    return null;
  }
};

const createBitbucketHeaders = (bitbucketToken: string): HeadersInit => {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (bitbucketToken) {
    headers['Authorization'] = `Bearer ${bitbucketToken}`;
  }
  return headers;
};

export default function RepoWikiClient({ authRequiredInitial }: { authRequiredInitial: boolean }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const owner = params?.owner as string;
  const repo = params?.repo as string;

  const token = searchParams?.get('token') || '';
  const localPath = searchParams?.get('local_path') ? decodeURIComponent(searchParams?.get('local_path') || '') : undefined;
  const repoUrl = searchParams?.get('repo_url') ? decodeURIComponent(searchParams?.get('repo_url') || '') : undefined;
  const providerParam = searchParams?.get('provider') || '';
  const modelParam = searchParams?.get('model') || '';
  const isCustomModelParam = searchParams?.get('is_custom_model') === 'true';
  const customModelParam = searchParams?.get('custom_model') || '';
  const language = searchParams?.get('language') || 'en';
  const branchParam = searchParams?.get('branch') || 'main';
  const repoHost = (() => {
    if (!repoUrl) return '';
    try {
      return new URL(repoUrl).hostname.toLowerCase();
    } catch (e) {
      console.warn(`Invalid repoUrl provided: ${repoUrl}`);
      return '';
    }
  })();
  const repoType = repoHost?.includes('bitbucket')
    ? 'bitbucket'
    : repoHost?.includes('gitlab')
      ? 'gitlab'
      : repoHost?.includes('github')
        ? 'github'
        : repoHost?.includes('azure') || repoHost?.includes('visualstudio.com')
          ? 'azure'
          : searchParams?.get('type') || 'github';

  const { messages } = useLanguage();

  const repoInfo = useMemo<RepoInfo>(() => ({
    owner,
    repo,
    type: repoType,
    token: token || null,
    localPath: localPath || null,
    repoUrl: repoUrl || null,
    branch: branchParam || null
  }), [owner, repo, repoType, localPath, repoUrl, token, branchParam]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>(
    messages.loading?.initializing || 'Initializing wiki generation...'
  );
  const [error, setError] = useState<string | null>(null);
  const [wikiStructure, setWikiStructure] = useState<WikiStructure | undefined>();
  const [currentPageId, setCurrentPageId] = useState<string | undefined>();
  const [generatedPages, setGeneratedPages] = useState<Record<string, WikiPage>>({});
  const [pagesInProgress, setPagesInProgress] = useState(new Set<string>());
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [originalMarkdown] = useState<Record<string, string>>({});
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [currentToken, setCurrentToken] = useState(token);
  const [effectiveRepoInfo, setEffectiveRepoInfo] = useState(repoInfo);
  const [embeddingError, setEmbeddingError] = useState(false);

  const [selectedProviderState, setSelectedProviderState] = useState(providerParam);
  const [selectedModelState, setSelectedModelState] = useState(modelParam);
  const [isCustomSelectedModelState, setIsCustomSelectedModelState] = useState(isCustomModelParam);
  const [customSelectedModelState, setCustomSelectedModelState] = useState(customModelParam);
  const [showModelOptions] = useState(false);
  const excludedDirs = searchParams?.get('excluded_dirs') || '';
  const excludedFiles = searchParams?.get('excluded_files') || '';
  const [modelExcludedDirs, setModelExcludedDirs] = useState(excludedDirs);
  const [modelExcludedFiles, setModelExcludedFiles] = useState(excludedFiles);
  const includedDirs = searchParams?.get('included_dirs') || '';
  const includedFiles = searchParams?.get('included_files') || '';
  const [modelIncludedDirs, setModelIncludedDirs] = useState(includedDirs);
  const [modelIncludedFiles, setModelIncludedFiles] = useState(includedFiles);

  const isComprehensiveParam = searchParams?.get('comprehensive') !== 'false';
  const [isComprehensiveView, setIsComprehensiveView] = useState(isComprehensiveParam);
  const activeContentRequests = useRef(new Map<string, boolean>()).current;
  const [structureRequestInProgress, setStructureRequestInProgress] = useState(false);
  const cacheLoadedSuccessfully = useRef(false);
  const effectRan = React.useRef(false);
  const [isAskModalOpen, setIsAskModalOpen] = useState(false);
  const askComponentRef = useRef<{ clearConversation: () => void } | null>(null);

  const [authRequired] = useState<boolean>(authRequiredInitial);
  const [authCode, setAuthCode] = useState<string>('');
  const [isAuthLoading] = useState<boolean>(false);

  const [defaultBranch, setDefaultBranch] = useState<string>(branchParam);

  const generateFileUrl = useCallback((filePath: string): string => {
    if (effectiveRepoInfo.type === 'local') {
      return filePath;
    }
    const repoUrlLocal = effectiveRepoInfo.repoUrl;
    if (!repoUrlLocal) {
      return filePath;
    }
    try {
      const url = new URL(repoUrlLocal);
      const hostname = url.hostname;
      if (hostname === 'github.com' || hostname.includes('github')) {
        return `${repoUrlLocal}/blob/${defaultBranch}/${filePath}`;
      } else if (hostname === 'gitlab.com' || hostname.includes('gitlab')) {
        return `${repoUrlLocal}/-/blob/${defaultBranch}/${filePath}`;
      } else if (hostname === 'bitbucket.org' || hostname.includes('bitbucket')) {
        return `${repoUrlLocal}/src/${defaultBranch}/${filePath}`;
      } else if (hostname.includes('dev.azure.com') || hostname.includes('visualstudio.com')) {
        const repoInfoParsed = parseAzureRepoUrl(repoUrlLocal);
        if (repoInfoParsed) {
          const encodedPath = encodeURIComponent(filePath.startsWith('/') ? filePath : `/${filePath}`);
          const version = encodeURIComponent(`GB${defaultBranch}`);
          return `${repoInfoParsed.baseUrl}/${repoInfoParsed.project}/_git/${repoInfoParsed.repository}?path=${encodedPath}&version=${version}`;
        }
      }
    } catch (error) {
      console.warn('Error generating file URL:', error);
    }
    return filePath;
  }, [effectiveRepoInfo, defaultBranch]);

  useEffect(() => {
    const wikiContent = document.getElementById('wiki-content');
    if (wikiContent) {
      wikiContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPageId]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAskModalOpen(false);
      }
    };
    if (isAskModalOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isAskModalOpen]);

  const generatePageContent = useCallback(async (page: WikiPage, ownerLocal: string, repoLocal: string) => {
    return new Promise<void>(async (resolve) => {
      try {
        if (generatedPages[page.id]?.content) {
          resolve();
          return;
        }
        if (activeContentRequests.get(page.id)) {
          resolve();
          return;
        }
        activeContentRequests.set(page.id, true);
        if (!ownerLocal || !repoLocal) {
          throw new Error('Invalid repository information. Owner and repo name are required.');
        }
        setPagesInProgress(prev => new Set(prev).add(page.id));
        const filePaths = page.filePaths;
        setGeneratedPages(prev => ({
          ...prev,
          [page.id]: { ...page, content: 'Loading...' }
        }));
        const repoUrlResolved = getRepoUrl(effectiveRepoInfo);
        const promptContent =
`You are a senior software architect (10+ years experience) and technical writer.
Your task is to generate a clear, comprehensive, and actionable technical wiki page in Markdown about a specific feature, system, or module in this project.

You will be given:
1. The "[WIKI_PAGE_TOPIC]" for the page you need to create.
2. A list of "[RELEVANT_SOURCE_FILES]" from the project that you MUST use as the sole basis for the content. You have access to the full content of these files. You MUST use AT LEAST 5 relevant source files for comprehensive coverage - if fewer are provided, search for additional related files in the codebase.

Override: Absolute, Concise

Language Style:
- Plain, direct words only. No corporate/academic buzzwords.
- Banned: comprehensive, robust, leverage, utilize, facilitate, seamless, cutting-edge, holistic, synergy, streamline.
- Use instead: "use" not "utilize", "complete" not "comprehensive", "strong" not "robust".

CRITICAL STARTING INSTRUCTION:
The very first thing on the page MUST be a <details> block listing ALL the [RELEVANT_SOURCE_FILES] you used to generate the content. There MUST be AT LEAST 5 source files listed - if fewer were provided, you MUST find additional related files to include.
Format it exactly like this:
<details>
<summary>Relevant source files</summary>

Remember, do not provide any acknowledgements, disclaimers, apologies, or any other preface before the <details> block. JUST START with the <details> block.
The following files were used as context for generating this wiki page:

${filePaths.map(path => `- [${path}](${generateFileUrl(path)})`).join('\n')}
<!-- Add additional relevant files if fewer than 5 were provided -->
</details>

Immediately after the <details> block, add the H1 title: # ${page.title}.

Quality Standards:
- Multi-dimensional analysis: Functional behavior, Architectural design, Implementation details, Operational concerns, and Evolution/maintainability.
- Production-ready insights: performance, scalability, security, reliability/fault tolerance, and observability.
- Explain design decisions and trade-offs grounded in the source files.
- Make it actionable: specific guidance to use, extend, and safely modify the code.

Based ONLY on the content of the [RELEVANT_SOURCE_FILES]:

1.  **Introduction:** Start with a concise introduction (1-2 paragraphs) explaining the purpose, scope, and high-level overview of "${page.title}" within the context of the overall project. If relevant, and if information is available in the provided files, link to other potential wiki pages using the format [Link Text](#page-anchor-or-id).

2.  **Detailed Sections:** Break down "${page.title}" into logical sections using H2 (##) and H3 (###) Markdown headings. For each section:
    *   Explain the architecture, components, data flow, or logic relevant to the section's focus, as evidenced in the source files.
    *   Identify key functions, classes, data structures, API endpoints, or configuration elements pertinent to that section.

3.  **Mermaid Diagrams (when essential):**
    *   Include at most 1–2 diagrams (e.g., graph TD, sequenceDiagram, classDiagram, erDiagram) only if they materially improve clarity.
    *   Keep diagrams concise and derived from code; CRITICAL: follow strict top-down orientation:
       - Use "graph TD" (top-down) directive for flow diagrams
       - NEVER use "graph LR" (left-right)
       - Maximum node width should be 3-4 words
       - For sequence diagrams:
         - Start with "sequenceDiagram" directive on its own line
         - Define ALL participants at the beginning using "participant" keyword
         - Optionally specify participant types: actor, boundary, control, entity, database, collections, queue
         - Use descriptive but concise participant names, or use aliases: "participant A as Alice"
         - Use the correct Mermaid arrow syntax (8 types available):
           - -> solid line without arrow
           - --> dotted line without arrow
           - ->> solid line with arrowhead
           - -->> dotted line with arrowhead
           - ->x solid line with X at end
           - -->x dotted line with X at end
           - -) solid line with open arrow
           - --) dotted line with open arrow
         - Examples: A->>B: Request, B-->>A: Response, A->xB: Error, A-)B: Async event
         - Use +/- suffix for activation boxes: A->>+B: Start, B-->>-A: End
         - Group related participants using "box": box GroupName ... end
         - Use structural elements for complex flows: loop, alt, opt, par, critical, break
         - Add notes for clarification
         - Use autonumber directive to add sequence numbers to messages
         - NEVER use flowchart-style labels like A--|label|-->B. Always use a colon for labels: A->>B: My Label

4.  **Tables:**
    *   Use Markdown tables to summarize information.

5.  **Code Snippets (optional):**
    *   Include short, focused snippets.

6.  **Source Citations:**
    *   For EVERY piece of significant information, cite the specific source file(s) and relevant line numbers.
    *   Use the exact format: Sources: [filename.ext:start_line-end_line]() or [file.ext:line]()
    *   Cite AT LEAST 5 different source files across the page.

7.  **Technical Accuracy:** All information must be derived SOLELY from the [RELEVANT_SOURCE_FILES].

8.  **Clarity and Conciseness:** Use clear, professional, and concise technical language.

9.  **Conclusion/Summary:** End with a brief summary paragraph.

IMPORTANT: Generate the content in ${language === 'vi' ? 'Vietnamese (Tiếng Việt)' : 'English'}.
`;
        const requestBody: RequestBody = {
          repo_url: repoUrlResolved,
          type: effectiveRepoInfo.type,
          messages: [{
            role: 'user',
            content: promptContent
          }]
        };
        addTokensToRequestBody(requestBody, currentToken, effectiveRepoInfo.type, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, language, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles);
        let content = '';
        const response = await fetch(`/api/chat/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error details available');
          throw new Error(`Error generating page content: ${response.status} - ${response.statusText} - ${errorText}`);
        }
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) {
          throw new Error('Failed to get response reader');
        }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            content += decoder.decode(value, { stream: true });
          }
          content += decoder.decode();
        } catch {
          throw new Error('Error processing response stream');
        }
        content = content.replace(/^```markdown\s*/i, '').replace(/```\s*$/i, '');
        const updatedPage = { ...page, content };
        setGeneratedPages(prev => ({ ...prev, [page.id]: updatedPage }));
        resolve();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setGeneratedPages(prev => ({
          ...prev,
          [page.id]: { ...page, content: `Error generating content: ${errorMessage}` }
        }));
        setError(`Failed to generate content for ${page.title}.`);
        resolve();
      } finally {
        activeContentRequests.delete(page.id);
        setPagesInProgress(prev => {
          const next = new Set(prev);
          next.delete(page.id);
          return next;
        });
        setLoadingMessage(undefined);
      }
    });
  }, [generatedPages, currentToken, effectiveRepoInfo, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles, language, activeContentRequests, generateFileUrl]);

  const determineWikiStructure = useCallback(async (fileTree: string, readme: string, ownerLocal: string, repoLocal: string) => {
    if (!ownerLocal || !repoLocal) {
      setError('Invalid repository information. Owner and repo name are required.');
      setIsLoading(false);
      setEmbeddingError(false);
      return;
    }
    if (structureRequestInProgress) {
      return;
    }
    try {
      setStructureRequestInProgress(true);
      setLoadingMessage(messages.loading?.determiningStructure || 'Determining wiki structure...');
      const repoUrlResolved = getRepoUrl(effectiveRepoInfo);
      const requestBody: RequestBody = {
        repo_url: repoUrlResolved,
        type: effectiveRepoInfo.type,
        messages: [{
          role: 'user',
          content: `Analyze this GitHub repository ${ownerLocal}/${repoLocal} and create a wiki structure for it.

1. The complete file tree of the project:
<file_tree>
${fileTree}
</file_tree>

2. The README file of the project:
<readme>
${readme}
</readme>

I want to create a wiki for this repository. Determine the most logical structure for a wiki based on the repository's content.

IMPORTANT: The wiki content will be generated in ${language === 'vi' ? 'Vietnamese (Tiếng Việt)' : 'English'} language.

${isComprehensiveView ? 'Create a structured wiki with sections.' : 'Return a concise set of pages.'}

Return your analysis in the specified XML format.`
        }]
      };
      addTokensToRequestBody(requestBody, currentToken, effectiveRepoInfo.type, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, language, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles);
      let responseText = '';
      const response = await fetch(`/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`Error determining wiki structure: ${response.status}`);
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        responseText += decoder.decode(value, { stream: true });
      }
      if(responseText.includes('Error preparing retriever: Environment variable OPENAI_API_KEY must be set')) {
        setEmbeddingError(true);
        throw new Error('OPENAI_API_KEY environment variable is not set. Please configure your OpenAI API key.');
      }
      if(responseText.includes('Ollama model') && responseText.includes('not found')) {
        setEmbeddingError(true);
        throw new Error('The specified Ollama embedding model was not found.');
      }
      responseText = responseText.replace(/^```(?:xml)?\s*/i, '').replace(/```\s*$/i, '');
      const xmlMatch = responseText.match(/<wiki_structure>[\s\S]*?<\/wiki_structure>/m);
      if (!xmlMatch) {
        throw new Error('No valid XML found in response');
      }
      let xmlText = xmlMatch[0];
      xmlText = xmlText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      const titleEl = xmlDoc.querySelector('title');
      const descriptionEl = xmlDoc.querySelector('description');
      const pagesEls = xmlDoc.querySelectorAll('page');
      const titleLocal = titleEl ? titleEl.textContent || '' : '';
      const descriptionLocal = descriptionEl ? descriptionEl.textContent || '' : '';
      const pagesLocal: WikiPage[] = [];
      pagesEls.forEach(pageEl => {
        const id = pageEl.getAttribute('id') || `page-${pagesLocal.length + 1}`;
        const titleInner = pageEl.querySelector('title');
        const importanceEl = pageEl.querySelector('importance');
        const filePathEls = pageEl.querySelectorAll('file_path');
        const relatedEls = pageEl.querySelectorAll('related');
        const titleVal = titleInner ? titleInner.textContent || '' : '';
        const importanceVal = importanceEl ? (importanceEl.textContent === 'high' ? 'high' : importanceEl.textContent === 'medium' ? 'medium' : 'low') : 'medium';
        const filePaths: string[] = [];
        filePathEls.forEach(el => { if (el.textContent) filePaths.push(el.textContent); });
        const relatedPages: string[] = [];
        relatedEls.forEach(el => { if (el.textContent) relatedPages.push(el.textContent); });
        pagesLocal.push({ id, title: titleVal, content: '', filePaths, importance: importanceVal as 'high'|'medium'|'low', relatedPages });
      });
      const sectionsLocal: WikiSection[] = [];
      const rootSectionsLocal: string[] = [];
      if (isComprehensiveView) {
        const sectionsEls = xmlDoc.querySelectorAll('section');
        sectionsEls.forEach(sectionEl => {
          const id = sectionEl.getAttribute('id') || `section-${sectionsLocal.length + 1}`;
          const titleInner = sectionEl.querySelector('title');
          const pageRefEls = sectionEl.querySelectorAll('page_ref');
          const sectionRefEls = sectionEl.querySelectorAll('section_ref');
          const titleVal = titleInner ? titleInner.textContent || '' : '';
          const pagesRefs: string[] = [];
          const subsectionsRefs: string[] = [];
          pageRefEls.forEach(el => { if (el.textContent) pagesRefs.push(el.textContent); });
          sectionRefEls.forEach(el => { if (el.textContent) subsectionsRefs.push(el.textContent); });
          sectionsLocal.push({ id, title: titleVal, pages: pagesRefs, subsections: subsectionsRefs.length > 0 ? subsectionsRefs : undefined });
          let isReferenced = false;
          sectionsEls.forEach(otherSection => {
            const otherRefs = otherSection.querySelectorAll('section_ref');
            otherRefs.forEach(ref => { if (ref.textContent === id) { isReferenced = true; } });
          });
          if (!isReferenced) {
            rootSectionsLocal.push(id);
          }
        });
      }
      const wikiStructureLocal: WikiStructure = {
        id: 'wiki',
        title: titleLocal,
        description: descriptionLocal,
        pages: pagesLocal,
        sections: sectionsLocal,
        rootSections: rootSectionsLocal
      };
      setWikiStructure(wikiStructureLocal);
      setCurrentPageId(pagesLocal.length > 0 ? pagesLocal[0].id : undefined);
      if (pagesLocal.length > 0) {
        const initialInProgress = new Set(pagesLocal.map(p => p.id));
        setPagesInProgress(initialInProgress);
        const MAX_CONCURRENT = 1;
        const queue = [...pagesLocal];
        let activeRequests = 0;
        const processQueue = () => {
          while (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
            const page = queue.shift();
            if (page) {
              activeRequests++;
              generatePageContent(page, ownerLocal, repoLocal)
                .finally(() => {
                  activeRequests--;
                  if (queue.length === 0 && activeRequests === 0) {
                    setIsLoading(false);
                    setLoadingMessage(undefined);
                  } else {
                    if (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
                      processQueue();
                    }
                  }
                });
            }
          }
          if (queue.length === 0 && activeRequests === 0 && pagesLocal.length > 0 && pagesInProgress.size === 0) {
            setIsLoading(false);
            setLoadingMessage(undefined);
          } else if (pagesLocal.length === 0) {
            setIsLoading(false);
            setLoadingMessage(undefined);
          }
        };
        processQueue();
      } else {
        setIsLoading(false);
        setLoadingMessage(undefined);
      }
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
      setLoadingMessage(undefined);
    } finally {
      setStructureRequestInProgress(false);
    }
  }, [generatePageContent, currentToken, effectiveRepoInfo, pagesInProgress.size, structureRequestInProgress, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles, language, messages.loading?.determiningStructure, isComprehensiveView]);

  const fetchRepositoryStructure = useCallback(async () => {
    if (requestInProgress) {
      return;
    }
    setWikiStructure(undefined);
    setCurrentPageId(undefined);
    setGeneratedPages({});
    setPagesInProgress(new Set());
    setError(null);
    setEmbeddingError(false);
    try {
      setRequestInProgress(true);
      setIsLoading(true);
      setLoadingMessage(messages.loading?.fetchingStructure || 'Fetching repository structure...');
      let fileTreeData = '';
      let readmeContent = '';
      if (effectiveRepoInfo.type === 'local' && effectiveRepoInfo.localPath) {
        const response = await fetch(`/local_repo/structure?path=${encodeURIComponent(effectiveRepoInfo.localPath)}`);
        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Local repository API error (${response.status}): ${errorData}`);
        }
        const data = await response.json();
        fileTreeData = data.file_tree;
        readmeContent = data.readme;
        setDefaultBranch('main');
      } else if (effectiveRepoInfo.type === 'github') {
        let treeData = null;
        let apiErrorDetails = '';
        const getGithubApiUrl = (repoUrlLocal: string | null): string => {
          if (!repoUrlLocal) {
            return 'https://api.github.com';
          }
          try {
            const url = new URL(repoUrlLocal);
            const hostname = url.hostname;
            if (hostname === 'github.com') {
              return 'https://api.github.com';
            }
            return `${url.protocol}//${hostname}/api/v3`;
          } catch {
            return 'https://api.github.com';
          }
        };
        const githubApiBaseUrl = getGithubApiUrl(effectiveRepoInfo.repoUrl);
        let defaultBranchLocal: string | null = null;
        try {
          const repoInfoResponse = await fetch(`${githubApiBaseUrl}/repos/${owner}/${repo}`, {
            headers: createGithubHeaders(currentToken)
          });
          if (repoInfoResponse.ok) {
            const repoData = await repoInfoResponse.json();
            defaultBranchLocal = repoData.default_branch;
            setDefaultBranch(defaultBranchLocal || 'main');
          }
        } catch {}
        const branchesToTry = defaultBranchLocal ? [defaultBranchLocal, 'main', 'master'].filter((branch, index, arr) => arr.indexOf(branch) === index) : ['main', 'master'];
        for (const branch of branchesToTry) {
          const apiUrl = `${githubApiBaseUrl}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
          const headers = createGithubHeaders(currentToken);
          try {
            const response = await fetch(apiUrl, { headers });
            if (response.ok) {
              treeData = await response.json();
              break;
            } else {
              const errorData = await response.text();
              apiErrorDetails = `Status: ${response.status}, Response: ${errorData}`;
            }
          } catch {}
        }
        if (!treeData || !treeData.tree) {
          if (apiErrorDetails) {
            throw new Error(`Could not fetch repository structure. API Error: ${apiErrorDetails}`);
          } else {
            throw new Error('Could not fetch repository structure. Repository might not exist, be empty or private.');
          }
        }
        fileTreeData = treeData.tree
          .filter((item: { type: string; path: string }) => item.type === 'blob')
          .map((item: { type: string; path: string }) => item.path)
          .join('\n');
        try {
          const headers = createGithubHeaders(currentToken);
          const readmeResponse = await fetch(`${githubApiBaseUrl}/repos/${owner}/${repo}/readme`, { headers });
          if (readmeResponse.ok) {
            const readmeData = await readmeResponse.json();
            readmeContent = atob(readmeData.content);
          }
        } catch {}
      } else if (effectiveRepoInfo.type === 'gitlab') {
        const projectPath = extractUrlPath(effectiveRepoInfo.repoUrl ?? '')?.replace(/\.git$/, '') || `${owner}/${repo}`;
        const projectDomain = extractUrlDomain(effectiveRepoInfo.repoUrl ?? 'https://gitlab.com');
        const encodedProjectPath = encodeURIComponent(projectPath);
        const headers = createGitlabHeaders(currentToken);
        const filesData: { type: string; path: string }[] = [];
        try {
          let projectInfoUrl: string;
          let defaultBranchLocal = 'main';
          try {
            const validatedUrl = new URL(projectDomain ?? '');
            projectInfoUrl = `${validatedUrl.origin}/api/v4/projects/${encodedProjectPath}`;
          } catch (err) {
            throw new Error(`Invalid project domain URL: ${projectDomain}`);
          }
        const projectInfoRes = await fetch(projectInfoUrl, { headers });
          if (!projectInfoRes.ok) {
            const errorData = await projectInfoRes.text();
            throw new Error(`GitLab project info error: Status ${projectInfoRes.status}, Response: ${errorData}`);
          }
          const projectInfo = await projectInfoRes.json();
          defaultBranchLocal = projectInfo.default_branch || 'main';
          setDefaultBranch(defaultBranchLocal);
          let page = 1;
          let morePages = true;
          while (morePages) {
            const apiUrl = `${projectInfoUrl}/repository/tree?recursive=true&per_page=100&page=${page}`;
          const response = await fetch(apiUrl, { headers });
            if (!response.ok) {
              const errorData = await response.text();
              throw new Error(`Error fetching GitLab repository structure (page ${page}): ${errorData}`);
            }
            const pageData = await response.json();
            filesData.push(...pageData);
            const nextPage = response.headers.get('x-next-page');
            morePages = !!nextPage;
            page = nextPage ? parseInt(nextPage, 10) : page + 1;
          }
          if (!Array.isArray(filesData) || filesData.length === 0) {
            throw new Error('Could not fetch repository structure. Repository might be empty or inaccessible.');
          }
          fileTreeData = filesData
            .filter((item: { type: string; path: string }) => item.type === 'blob')
            .map((item: { type: string; path: string }) => item.path)
            .join('\n');
          const readmeUrl = `${projectInfoUrl}/repository/files/README.md/raw`;
          try {
            const readmeResponse = await fetch(readmeUrl, { headers });
            if (readmeResponse.ok) {
              readmeContent = await readmeResponse.text();
            }
          } catch {}
        } catch (err) {
          throw err;
        }
      } else if (effectiveRepoInfo.type === 'bitbucket') {
        const repoPath = extractUrlPath(effectiveRepoInfo.repoUrl ?? '') ?? `${owner}/${repo}`;
        const encodedRepoPath = encodeURIComponent(repoPath);
        let filesData: { values: Array<{ type: string; path: string }> } | null = null;
        let apiErrorDetails = '';
        let defaultBranchLocal = '';
        const headers = createBitbucketHeaders(currentToken);
        const projectInfoUrl = `https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}`;
        try {
          const response = await fetch(projectInfoUrl, { headers });
          const responseText = await response.text();
          if (response.ok) {
            const projectData = JSON.parse(responseText);
            defaultBranchLocal = projectData.mainbranch.name;
            setDefaultBranch(defaultBranchLocal);
            const apiUrl = `https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}/src/${defaultBranchLocal}/?recursive=true&per_page=100`;
            try {
              const response = await fetch(apiUrl, { headers });
              const structureResponseText = await response.text();
              if (response.ok) {
                filesData = JSON.parse(structureResponseText);
              } else {
                const errorData = structureResponseText;
                apiErrorDetails = `Status: ${response.status}, Response: ${errorData}`;
              }
            } catch {}
          } else {
            const errorData = responseText;
            apiErrorDetails = `Status: ${response.status}, Response: ${errorData}`;
          }
        } catch {}
        if (!filesData || !Array.isArray(filesData.values) || filesData.values.length === 0) {
          if (apiErrorDetails) {
            throw new Error(`Could not fetch repository structure. Bitbucket API Error: ${apiErrorDetails}`);
          } else {
            throw new Error('Could not fetch repository structure. Repository might not exist, be empty or private.');
          }
        }
        fileTreeData = filesData.values
          .filter((item: { type: string; path: string }) => item.type === 'commit_file')
          .map((item: { type: string; path: string }) => item.path)
          .join('\n');
        try {
          const headers = createBitbucketHeaders(currentToken);
          const readmeResponse = await fetch(`https://api.bitbucket.org/2.0/repositories/${encodedRepoPath}/src/${defaultBranchLocal}/README.md`, { headers });
          if (readmeResponse.ok) {
            readmeContent = await readmeResponse.text();
          }
        } catch {}
      } else if (effectiveRepoInfo.type === 'azure') {
        const azureInfo = parseAzureRepoUrl(effectiveRepoInfo.repoUrl);
        if (!azureInfo) {
          throw new Error('Invalid Azure DevOps repository URL.');
        }
        const headers = createAzureHeaders(currentToken);
        const repoInfoUrl = `${azureInfo.baseUrl}/${azureInfo.project}/_apis/git/repositories/${encodeURIComponent(azureInfo.repository)}?api-version=7.1-preview.1`;
        let defaultBranchLocal = 'main';
        try {
          const repoInfoRes = await fetch(repoInfoUrl, { headers });
          const repoInfoText = await repoInfoRes.text();
          if (!repoInfoRes.ok) {
            throw new Error(`Azure repo info error: Status ${repoInfoRes.status}, Response: ${repoInfoText}`);
          }
          const repoInfoData = JSON.parse(repoInfoText);
          if (repoInfoData.defaultBranch) {
            defaultBranchLocal = repoInfoData.defaultBranch.replace('refs/heads/', '') || 'main';
          }
          setDefaultBranch(defaultBranchLocal);
        } catch {
          setDefaultBranch(defaultBranchLocal);
        }
        const itemsUrl = `${azureInfo.baseUrl}/${azureInfo.project}/_apis/git/repositories/${encodeURIComponent(azureInfo.repository)}/items?recursionLevel=Full&includeContentMetadata=false&versionDescriptor.version=${encodeURIComponent(defaultBranchLocal)}&api-version=7.1-preview.1`;
        const itemsRes = await fetch(itemsUrl, { headers });
        const itemsText = await itemsRes.text();
        if (!itemsRes.ok) {
          throw new Error(`Error fetching Azure repository structure: Status ${itemsRes.status}, Response: ${itemsText}`);
        }
        const itemsData = JSON.parse(itemsText);
        const values = Array.isArray(itemsData.value) ? itemsData.value : [];
        if (values.length === 0) {
          throw new Error('Could not fetch repository structure. Repository might be empty or inaccessible.');
        }
        fileTreeData = values
          .filter((item: { gitObjectType?: string; path?: string }) => item.gitObjectType === 'blob' && item.path)
          .map((item: { path: string }) => item.path.replace(/^\//, ''))
          .join('\n');
        try {
          const readmeUrl = `${azureInfo.baseUrl}/${azureInfo.project}/_apis/git/repositories/${encodeURIComponent(azureInfo.repository)}/items?path=${encodeURIComponent('/README.md')}&includeContent=true&versionDescriptor.version=${encodeURIComponent(defaultBranchLocal)}&api-version=7.1-preview.1`;
          const readmeRes = await fetch(readmeUrl, { headers });
          const readmeText = await readmeRes.text();
          if (readmeRes.ok) {
            const readmeData = JSON.parse(readmeText);
            readmeContent = readmeData.content || '';
          }
        } catch {}
      }
      await determineWikiStructure(fileTreeData, readmeContent, owner, repo);
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
      setLoadingMessage(undefined);
    } finally {
      setRequestInProgress(false);
    }
  }, [owner, repo, determineWikiStructure, currentToken, effectiveRepoInfo, requestInProgress, messages.loading?.fetchingStructure]);

  const exportWiki = useCallback(async (format: 'markdown' | 'json') => {
    if (!wikiStructure || Object.keys(generatedPages).length === 0) {
      setExportError('No wiki content to export');
      return;
    }
    try {
      setIsExporting(true);
      setExportError(null);
      setLoadingMessage(`${language === 'vi' ? 'Xuất wiki dưới dạng' : 'Exporting wiki as'} ${format}...`);
      const pagesToExport = wikiStructure.pages.map(page => {
        const content = generatedPages[page.id]?.content || 'Content not generated';
        return { ...page, content };
      });
      const repoUrlResolved = getRepoUrl(effectiveRepoInfo);
      const response = await fetch(`/export/wiki`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_url: repoUrlResolved,
          type: effectiveRepoInfo.type,
          pages: pagesToExport,
          format
        })
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details available');
        throw new Error(`Error exporting wiki: ${response.status} - ${errorText}`);
      }
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${effectiveRepoInfo.repo}_wiki.${format === 'markdown' ? 'md' : 'json'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/"/g, '');
        }
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during export';
      setExportError(errorMessage);
    } finally {
      setIsExporting(false);
      setLoadingMessage(undefined);
    }
  }, [wikiStructure, generatedPages, effectiveRepoInfo, language]);

  const confirmRefresh = useCallback(async (newToken?: string, config?: {provider: string, model: string, isCustomModel: boolean, customModel: string, isComprehensiveView: boolean}) => {
    setLoadingMessage(messages.loading?.clearingCache || 'Clearing server cache...');
    setIsLoading(true);

    // Use config values if provided, otherwise fall back to state
    const provider = config?.provider ?? selectedProviderState;
    const model = config?.model ?? selectedModelState;
    const isCustomModel = config?.isCustomModel ?? isCustomSelectedModelState;
    const customModel = config?.customModel ?? customSelectedModelState;
    const comprehensive = config?.isComprehensiveView ?? isComprehensiveView;

    try {
      // DELETE only needs: owner, repo, repo_type, language, authorization_code
      // Cache filename doesn't include provider/model/comprehensive/filters
      const params = new URLSearchParams({
        owner: effectiveRepoInfo.owner,
        repo: effectiveRepoInfo.repo,
        repo_type: effectiveRepoInfo.type,
        language: language,
      });
      if (authCode) {
        params.append('authorization_code', authCode);
      }
      if(authRequired && !authCode) {
        setIsLoading(false);
        setError('Authorization code is required');
        return;
      }
      const response = await fetch(`/api/wiki_cache?${params.toString()}`, { method: 'DELETE', headers: { 'Accept': 'application/json' } });
      if (!response.ok) {
        const errorText = await response.text();
        if(response.status == 401) {
          setIsLoading(false);
          setLoadingMessage(undefined);
          setError('Failed to validate the authorization code');
          return;
        }
      }
    } catch (err) {
      setIsLoading(false);
      setEmbeddingError(false);
      throw err;
    }
    if (newToken) {
      setCurrentToken(newToken);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('token', newToken);
      window.history.replaceState({}, '', currentUrl.toString());
    }
    const localStorageCacheKey = getCacheKey(effectiveRepoInfo.owner, effectiveRepoInfo.repo, effectiveRepoInfo.type, language, comprehensive);
    localStorage.removeItem(localStorageCacheKey);
    cacheLoadedSuccessfully.current = false;
    effectRan.current = false;
    setWikiStructure(undefined);
    setCurrentPageId(undefined);
    setGeneratedPages({});
    setPagesInProgress(new Set());
    setError(null);
    setEmbeddingError(false);
    setIsLoading(true);
    setLoadingMessage(messages.loading?.initializing || 'Initializing wiki generation...');
    activeContentRequests.clear();
    setStructureRequestInProgress(false);
    setRequestInProgress(false);
    try {
      const repoUrlResolved = getRepoUrl(effectiveRepoInfo);
      const jobRedirectUrl = await startBackgroundWikiGeneration(
        repoUrlResolved,
        effectiveRepoInfo.type,
        effectiveRepoInfo.owner,
        effectiveRepoInfo.repo,
        provider,
        isCustomModel ? customModel : model,
        language,
        comprehensive,
        newToken || currentToken || undefined,
        modelExcludedDirs ? modelExcludedDirs.split(',').map(d => d.trim()).filter(Boolean) : undefined,
        modelExcludedFiles ? modelExcludedFiles.split(',').map(f => f.trim()).filter(Boolean) : undefined,
        modelIncludedDirs ? modelIncludedDirs.split(',').map(d => d.trim()).filter(Boolean) : undefined,
        modelIncludedFiles ? modelIncludedFiles.split(',').map(f => f.trim()).filter(Boolean) : undefined,
        defaultBranch
      );
      router.push(jobRedirectUrl);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : 'Failed to start wiki regeneration');
      setIsLoading(false);
      setLoadingMessage(undefined);
    }
  }, [effectiveRepoInfo, language, messages.loading?.initializing, messages.loading?.clearingCache, activeContentRequests, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles, isComprehensiveView, authCode, authRequired, currentToken, router, defaultBranch]);

  useEffect(() => {
    if (effectRan.current === false) {
      effectRan.current = true;
      const loadData = async () => {
        setLoadingMessage(messages.loading?.fetchingCache || 'Checking for cached wiki...');
        try {
          const params = new URLSearchParams({
            owner: effectiveRepoInfo.owner,
            repo: effectiveRepoInfo.repo,
            repo_type: effectiveRepoInfo.type,
            language: language,
            comprehensive: isComprehensiveView.toString(),
          });
          const response = await fetch(`/api/wiki_cache?${params.toString()}`);
          if (response.ok) {
            const cachedData = await response.json();
            if (cachedData && cachedData.wiki_structure && cachedData.generated_pages && Object.keys(cachedData.generated_pages).length > 0) {
              if(cachedData.model) {
                setSelectedModelState(cachedData.model);
              }
              if(cachedData.provider) {
                setSelectedProviderState(cachedData.provider);
              }
              if (typeof cachedData.comprehensive === 'boolean') {
                setIsComprehensiveView(cachedData.comprehensive);
              }
              if(cachedData.repo) {
                setEffectiveRepoInfo(cachedData.repo);
              } else if (cachedData.repo_url && !effectiveRepoInfo.repoUrl) {
                const updatedRepoInfo = { ...effectiveRepoInfo, repoUrl: cachedData.repo_url };
                setEffectiveRepoInfo(updatedRepoInfo);
              }
              const cachedStructure = {
                ...cachedData.wiki_structure,
                sections: cachedData.wiki_structure.sections || [],
                rootSections: cachedData.wiki_structure.rootSections || []
              };
              if (!cachedStructure.sections.length || !cachedStructure.rootSections.length) {
                const pages = cachedStructure.pages;
                const sections: WikiSection[] = [];
                const rootSections: string[] = [];
                const pageClusters = new Map<string, WikiPage[]>();
                const categories = [
                  { id: 'overview', title: 'Overview', keywords: ['overview', 'introduction', 'about'] },
                  { id: 'architecture', title: 'Architecture', keywords: ['architecture', 'structure', 'design', 'system'] },
                  { id: 'features', title: 'Core Features', keywords: ['feature', 'functionality', 'core'] },
                  { id: 'components', title: 'Components', keywords: ['component', 'module', 'widget'] },
                  { id: 'api', title: 'API', keywords: ['api', 'endpoint', 'service', 'server'] },
                  { id: 'data', title: 'Data Flow', keywords: ['data', 'flow', 'pipeline', 'storage'] },
                  { id: 'models', title: 'Models', keywords: ['model', 'ai', 'ml', 'integration'] },
                  { id: 'ui', title: 'User Interface', keywords: ['ui', 'interface', 'frontend', 'page'] },
                  { id: 'setup', title: 'Setup & Configuration', keywords: ['setup', 'config', 'installation', 'deploy'] }
                ];
                categories.forEach(category => { pageClusters.set(category.id, []); });
                pageClusters.set('other', []);
                pages.forEach((page: WikiPage) => {
                  const title = page.title.toLowerCase();
                  let assigned = false;
                  for (const category of categories) {
                    if (category.keywords.some(keyword => title.includes(keyword))) {
                      pageClusters.get(category.id)?.push(page);
                      assigned = true;
                      break;
                    }
                  }
                  if (!assigned) {
                    pageClusters.get('other')?.push(page);
                  }
                });
                for (const [categoryId, categoryPages] of pageClusters.entries()) {
                  if (categoryPages.length > 0) {
                    const category = categories.find(c => c.id === categoryId) || { id: categoryId, title: categoryId === 'other' ? 'Other' : categoryId.charAt(0).toUpperCase() + categoryId.slice(1) };
                    const sectionId = `section-${categoryId}`;
                    sections.push({ id: sectionId, title: category.title, pages: categoryPages.map((p: WikiPage) => p.id) });
                    rootSections.push(sectionId);
                    categoryPages.forEach((page: WikiPage) => { page.parentId = sectionId; });
                  }
                }
                if (sections.length === 0) {
                  const highImportancePages = pages.filter((p: WikiPage) => p.importance === 'high').map((p: WikiPage) => p.id);
                  const mediumImportancePages = pages.filter((p: WikiPage) => p.importance === 'medium').map((p: WikiPage) => p.id);
                  const lowImportancePages = pages.filter((p: WikiPage) => p.importance === 'low').map((p: WikiPage) => p.id);
                  if (highImportancePages.length > 0) {
                    sections.push({ id: 'section-high', title: 'Core Components', pages: highImportancePages });
                    rootSections.push('section-high');
                  }
                  if (mediumImportancePages.length > 0) {
                    sections.push({ id: 'section-medium', title: 'Key Features', pages: mediumImportancePages });
                    rootSections.push('section-medium');
                  }
                  if (lowImportancePages.length > 0) {
                    sections.push({ id: 'section-low', title: 'Additional Information', pages: lowImportancePages });
                    rootSections.push('section-low');
                  }
                }
                cachedStructure.sections = sections;
                cachedStructure.rootSections = rootSections;
              }
              setWikiStructure(cachedStructure);
              setGeneratedPages(cachedData.generated_pages);
              setCurrentPageId(cachedStructure.pages.length > 0 ? cachedStructure.pages[0].id : undefined);
              setIsLoading(false);
              setEmbeddingError(false);
              setLoadingMessage(undefined);
              cacheLoadedSuccessfully.current = true;
              return;
            }
          }
        } catch {}
        setLoadingMessage(messages.loading?.checkingJobs || 'Checking for active generation jobs...');
        try {
          const activeJob = await findActiveJob(effectiveRepoInfo.owner, effectiveRepoInfo.repo);
          if (activeJob) {
            router.push(`/wiki/job/${activeJob.id}`);
            return;
          }
          setLoadingMessage(messages.loading?.creatingJob || 'Starting wiki generation...');
          const repoUrlResolved = getRepoUrl(effectiveRepoInfo);
          const jobRedirectUrl = await startBackgroundWikiGeneration(
            repoUrlResolved,
            effectiveRepoInfo.type,
            effectiveRepoInfo.owner,
            effectiveRepoInfo.repo,
            selectedProviderState,
            isCustomSelectedModelState ? customSelectedModelState : selectedModelState,
            language,
            isComprehensiveView,
            currentToken || undefined,
            modelExcludedDirs ? modelExcludedDirs.split(',').map(d => d.trim()).filter(Boolean) : undefined,
            modelExcludedFiles ? modelExcludedFiles.split(',').map(f => f.trim()).filter(Boolean) : undefined,
            modelIncludedDirs ? modelIncludedDirs.split(',').map(d => d.trim()).filter(Boolean) : undefined,
            modelIncludedFiles ? modelIncludedFiles.split(',').map(f => f.trim()).filter(Boolean) : undefined,
            defaultBranch
          );
          router.push(jobRedirectUrl);
        } catch (jobError) {
          setError(jobError instanceof Error ? jobError.message : 'Failed to start wiki generation');
          setIsLoading(false);
          setLoadingMessage(undefined);
        }
      };
      loadData();
    }
  }, [effectiveRepoInfo, language, messages.loading?.fetchingCache, isComprehensiveView, selectedProviderState, selectedModelState, isCustomSelectedModelState, customSelectedModelState, currentToken, modelExcludedDirs, modelExcludedFiles, modelIncludedDirs, modelIncludedFiles, defaultBranch, messages.loading?.checkingJobs, messages.loading?.creatingJob, router]);

  useEffect(() => {
    const saveCache = async () => {
      if (!isLoading && !error && wikiStructure && Object.keys(generatedPages).length > 0 && Object.keys(generatedPages).length >= wikiStructure.pages.length && !cacheLoadedSuccessfully.current) {
        const allPagesHaveContent = wikiStructure.pages.every(page => generatedPages[page.id] && generatedPages[page.id].content && generatedPages[page.id].content !== 'Loading...');
        if (allPagesHaveContent) {
          try {
            const structureToCache = { ...wikiStructure, sections: wikiStructure.sections || [], rootSections: wikiStructure.rootSections || [] };
            const dataToCache = {
              repo: effectiveRepoInfo,
              language: language,
              comprehensive: isComprehensiveView,
              wiki_structure: structureToCache,
              generated_pages: generatedPages,
              provider: selectedProviderState,
              model: selectedModelState
            };
            const response = await fetch(`/api/wiki_cache`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToCache) });
            if (!response.ok) {
              console.error('Error saving wiki data to server cache:', response.status, await response.text());
            }
          } catch {}
        }
      }
    };
    saveCache();
  }, [isLoading, error, wikiStructure, generatedPages, effectiveRepoInfo, language, isComprehensiveView, selectedProviderState, selectedModelState]);

  const handlePageSelect = (pageId: string) => {
    if (currentPageId != pageId) {
      setCurrentPageId(pageId);
    }
  };

  const [isModelSelectionModalOpen, setIsModelSelectionModalOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] relative">
      <style>{wikiStyles}</style>

      {/* Terminal-style grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{
        backgroundImage: 'linear-gradient(var(--accent-primary) 1px, transparent 1px), linear-gradient(90deg, var(--accent-primary) 1px, transparent 1px)',
        backgroundSize: '20px 20px'
      }}></div>

      {/* Terminal-inspired header */}
      <header className="sticky top-0 z-40 bg-[var(--surface)]/95 backdrop-blur-xl border-b-2 border-[var(--accent-primary)]/30 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Terminal status bar */}
          <div className="h-7 flex items-center justify-between border-b border-[var(--accent-primary)]/10 text-xs font-mono">
            <div className="flex items-center gap-4 text-[var(--foreground-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-emerald)] animate-pulse"></span>
                SYSTEM.READY
              </span>
              <span className="hidden sm:block">|</span>
              <span className="hidden sm:block text-[var(--accent-cyan)]">WIKI.ACTIVE</span>
            </div>
            <div className="flex items-center gap-2 text-[var(--accent-primary)]">
              <span className="hidden sm:block">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
            </div>
          </div>

          {/* Main header */}
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] rounded blur-sm opacity-40 group-hover:opacity-60 transition-opacity"></div>
                <div className="relative bg-[var(--accent-primary)] p-2 rounded border border-[var(--accent-primary)]/50">
                  <FaBookOpen className="w-4 h-4 text-white" />
                </div>
              </div>
              <div className="leading-tight">
                <p className="text-base font-bold font-mono tracking-tight text-[var(--foreground)]">
                  <span className="text-[var(--accent-cyan)]">$</span> {messages.common?.appName || 'DeepWiki'}
                </p>
                <p className="text-[10px] font-mono text-[var(--foreground-muted)] tracking-wider">
                  &#47;&#47; {messages.repoPage?.aiWikiGenerator || 'AI-powered documentation'}
                </p>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-medium">
              <Link href="/" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors flex items-center gap-1">
                <span className="text-[var(--accent-primary)]">01</span> {messages.common?.home || 'Home'}
              </Link>
              <Link href="/wiki/projects" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors flex items-center gap-1">
                <span className="text-[var(--accent-primary)]">02</span> {messages.repoPage?.indexedWiki || 'Wiki Index'}
              </Link>
              <Link href="/jobs" className="text-[var(--foreground-muted)] hover:text-[var(--accent-cyan)] transition-colors flex items-center gap-2">
                <span className="text-[var(--accent-primary)]">03</span> {messages.common?.jobs || 'Jobs'}
                <span className="w-1.5 h-1.5 bg-[var(--accent-emerald)] rounded-full pulse-glow"></span>
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link href="/" className="md:hidden text-xs font-mono text-[var(--accent-cyan)] hover:text-[var(--highlight)] transition-colors">
                {messages.repoPage?.home || 'Home'}
              </Link>
              <button
                onClick={() => setIsModelSelectionModalOpen(true)}
                className="hidden md:inline-flex items-center gap-2 px-4 py-1.5 rounded border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-xs font-mono font-medium transition-all hover:border-[var(--accent-primary)]"
              >
                <FaSync className={`text-xs ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden lg:inline">{messages.repoPage?.refreshWiki || 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-10 flex flex-col gap-6 h-full">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[var(--background)]/70 rounded-2xl shadow-sm border border-[var(--glass-border)]">
            <div className="relative mb-6">
              <div className="absolute -inset-4 bg-[var(--accent-primary)]/10 rounded-full blur-md animate-pulse"></div>
              <div className="relative flex items-center justify-center">
                <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse delay-75 mx-2"></div>
                <div className="w-3 h-3 bg-[var(--accent-primary)]/70 rounded-full animate-pulse delay-150"></div>
              </div>
            </div>
            <p className="text-[var(--foreground)] text-center mb-3 font-serif">
              {loadingMessage || messages.common?.loading || 'Loading...'}
            </p>
            {wikiStructure && (
              <div className="w-full max-w-md mt-3">
                <div className="bg-[var(--background)]/50 rounded-full h-2 mb-3 overflow-hidden border border-[var(--border-color)]">
                  <div className="bg-[var(--accent-primary)] h-2 rounded-full transition-all duration-300 ease-in-out" style={{ width: `${Math.max(5, 100 * (wikiStructure.pages.length - pagesInProgress.size) / wikiStructure.pages.length)}%` }} />
                </div>
                <p className="text-xs text-[var(--muted)] text-center">
                  {messages.repoPage?.pagesCompleted ? messages.repoPage.pagesCompleted.replace('{completed}', (wikiStructure.pages.length - pagesInProgress.size).toString()).replace('{total}', wikiStructure.pages.length.toString()) : `${wikiStructure.pages.length - pagesInProgress.size} of ${wikiStructure.pages.length} pages completed`}
                </p>
                {pagesInProgress.size > 0 && (
                  <div className="mt-4 text-xs">
                    <p className="text-[var(--muted)] mb-2">{messages.repoPage?.currentlyProcessing || 'Currently processing:'}</p>
                    <ul className="text-[var(--foreground)] space-y-1">
                      {Array.from(pagesInProgress).slice(0, 3).map(pageId => {
                        const page = wikiStructure.pages.find(p => p.id === pageId);
                        return page ? <li key={pageId} className="truncate border-l-2 border-[var(--accent-primary)]/30 pl-2">{page.title}</li> : null;
                      })}
                      {pagesInProgress.size > 3 && (
                        <li className="text-[var(--muted)]">
                          {messages.repoPage?.andMorePages ? messages.repoPage.andMorePages.replace('{count}', (pagesInProgress.size - 3).toString()) : `...and ${pagesInProgress.size - 3} more`}
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : error ? (
          <div className="bg-[var(--highlight)]/5 border border-[var(--highlight)]/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center text-[var(--highlight)] mb-3">
              <FaExclamationTriangle className="mr-2" />
              <span className="font-bold font-serif">{messages.repoPage?.errorTitle || messages.common?.error || 'Error'}</span>
            </div>
            <p className="text-[var(--foreground)] text-sm mb-3">{error}</p>
            <p className="text-[var(--muted)] text-xs">
              {embeddingError ? (
                messages.repoPage?.embeddingErrorDefault || 'This error is related to the document embedding system used for analyzing your repository.'
              ) : (
                messages.repoPage?.errorMessageDefault || 'Please check that your repository exists and is public.'
              )}
            </p>
            <div className="mt-5">
              <Link href="/" className="btn-japanese px-5 py-2 inline-flex items-center gap-1.5">
                <FaHome className="text-sm" />
                {messages.repoPage?.backToHome || 'Back to Home'}
              </Link>
            </div>
          </div>
        ) : wikiStructure ? (
          <div className="flex flex-col lg:flex-row gap-6 w-full h-full max-w-[1600px] mx-auto">
            {/* Terminal-style sidebar */}
            <aside className="w-full lg:w-[300px] xl:w-[340px] flex-shrink-0 rounded-lg border-2 border-[var(--accent-primary)]/20 bg-[var(--surface)]/80 backdrop-blur-sm shadow-xl overflow-hidden">
              {/* Sidebar header */}
              <div className="bg-[var(--accent-primary)]/5 border-b-2 border-[var(--accent-primary)]/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-emerald)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-warning)]"></span>
                  <span className="w-2 h-2 rounded-full bg-[var(--accent-danger)]"></span>
                </div>
                <h3 className="text-base font-bold font-mono text-[var(--foreground)] mb-1 tracking-tight">{wikiStructure.title}</h3>
                <p className="text-[var(--muted)] text-xs leading-relaxed font-mono">{wikiStructure.description}</p>
              </div>

              <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
                {/* Repository info */}
                <div className="text-xs font-mono mb-4 p-3 rounded border border-[var(--accent-primary)]/10 bg-[var(--background)]/50">
                  {effectiveRepoInfo.type === 'local' ? (
                    <div className="flex items-center gap-2">
                      <FaFolder className="text-[var(--accent-cyan)] flex-shrink-0" />
                      <span className="break-all text-[var(--foreground-muted)]">{effectiveRepoInfo.localPath}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {effectiveRepoInfo.type === 'github' ? (
                        <FaGithub className="text-[var(--accent-cyan)] flex-shrink-0" />
                      ) : effectiveRepoInfo.type === 'gitlab' ? (
                        <FaGitlab className="text-[var(--accent-cyan)] flex-shrink-0" />
                      ) : (
                        <FaBitbucket className="text-[var(--accent-cyan)] flex-shrink-0" />
                      )}
                      <a href={effectiveRepoInfo.repoUrl ?? ''} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent-cyan)] transition-colors truncate text-[var(--foreground-muted)]">
                        {effectiveRepoInfo.owner}/{effectiveRepoInfo.repo}
                      </a>
                    </div>
                  )}
                </div>

                {/* Wiki type badge */}
                <div className="mb-4 flex items-center gap-2 text-xs font-mono">
                  <span className="text-[var(--foreground-muted)]">MODE:</span>
                  <span className={`px-2 py-1 rounded border ${isComprehensiveView ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border-[var(--accent-primary)]/30' : 'bg-[var(--background)] text-[var(--foreground)] border-[var(--border-color)]'}`}>
                    {isComprehensiveView ? (messages.form?.comprehensive || 'FULL') : (messages.form?.concise || 'BRIEF')}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="mb-5 space-y-2">
                  <button
                    onClick={() => setIsModelSelectionModalOpen(true)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-xs font-mono px-3 py-2 rounded border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FaSync className={isLoading ? 'animate-spin' : ''} />
                    {messages.repoPage?.refreshWiki || 'REFRESH'}
                  </button>
                </div>

                {/* Export section */}
                {Object.keys(generatedPages).length > 0 && (
                  <div className="mb-5 p-3 rounded border border-[var(--accent-primary)]/10 bg-[var(--background)]/30">
                    <h4 className="text-xs font-mono font-semibold text-[var(--accent-cyan)] mb-2 flex items-center gap-2">
                      <span>▸</span> {messages.repoPage?.exportWiki || 'EXPORT'}
                    </h4>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => exportWiki('markdown')}
                        disabled={isExporting}
                        className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 text-[var(--foreground)] transition-all disabled:opacity-50"
                      >
                        <FaDownload className="text-[var(--accent-cyan)]" />
                        {messages.repoPage?.exportAsMarkdown || 'Markdown'}
                      </button>
                      <button
                        onClick={() => exportWiki('json')}
                        disabled={isExporting}
                        className="flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:bg-[var(--accent-primary)]/10 text-[var(--foreground)] transition-all disabled:opacity-50"
                      >
                        <FaFileExport className="text-[var(--accent-cyan)]" />
                        {messages.repoPage?.exportAsJson || 'JSON'}
                      </button>
                    </div>
                    {exportError && (
                      <div className="mt-2 text-xs text-[var(--highlight)] font-mono">{exportError}</div>
                    )}
                  </div>
                )}

                {/* Navigation tree */}
                <div className="mb-2">
                  <h4 className="text-xs font-mono font-semibold text-[var(--accent-cyan)] mb-3 flex items-center gap-2">
                    <span>▸</span> {messages.repoPage?.pages || 'NAVIGATION'}
                  </h4>
                  <WikiTreeView wikiStructure={wikiStructure} currentPageId={currentPageId} onPageSelect={handlePageSelect} messages={messages.repoPage} />
                </div>
              </div>
            </aside>

            {/* Main content area */}
            <main id="wiki-content" className="flex-1 overflow-y-auto">
              {currentPageId && generatedPages[currentPageId] ? (
                <article className="max-w-4xl mx-auto">
                  {/* Article metadata header */}
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-mono text-[var(--accent-cyan)]">
                      <span>&#47;&#47;</span>
                      <span className="text-[var(--foreground-muted)]">DOCUMENTATION</span>
                    </div>
                    {generatedPages[currentPageId].filePaths.length > 0 && (
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--muted)]">
                        <span className="text-[var(--accent-primary)]">◆</span>
                        <span>{generatedPages[currentPageId].filePaths.length} source {generatedPages[currentPageId].filePaths.length === 1 ? 'file' : 'files'}</span>
                      </div>
                    )}
                  </div>

                  {/* Article content */}
                  <div className="prose prose-sm md:prose-base max-w-none">
                    <Markdown content={generatedPages[currentPageId].content} />
                  </div>

                  {/* Related pages */}
                  {generatedPages[currentPageId].relatedPages.length > 0 && (
                    <div className="mt-12 pt-6 border-t-2 border-[var(--accent-primary)]/20">
                      <h4 className="text-sm font-mono font-semibold text-[var(--accent-cyan)] mb-4 flex items-center gap-2">
                        <span>▸</span> {messages.repoPage?.relatedPages || 'RELATED'}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {generatedPages[currentPageId].relatedPages.map(relatedId => {
                          const relatedPage = wikiStructure.pages.find(p => p.id === relatedId);
                          return relatedPage ? (
                            <button
                              key={relatedId}
                              className="font-mono bg-[var(--accent-primary)]/10 hover:bg-[var(--accent-primary)]/20 text-xs text-[var(--accent-cyan)] px-3 py-2 rounded border border-[var(--accent-primary)]/30 hover:border-[var(--accent-primary)] transition-all truncate max-w-full"
                              onClick={() => handlePageSelect(relatedId)}
                            >
                              → {relatedPage.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </article>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                  <div className="relative mb-6">
                    <div className="absolute -inset-3 bg-[var(--accent-primary)]/10 rounded-full blur-xl"></div>
                    <FaBookOpen className="text-5xl text-[var(--accent-primary)] relative z-10" />
                  </div>
                  <p className="font-mono text-sm text-[var(--accent-cyan)] mb-2">NO PAGE SELECTED</p>
                  <p className="font-mono text-xs text-[var(--muted)] max-w-md">{messages.repoPage?.selectPagePrompt || 'Select a page from the navigation to view its content'}</p>
                </div>
              )}
            </main>
          </div>
        ) : null}
        </div>
      </main>
      {/* Terminal-style footer */}
      <footer className="mt-auto bg-[var(--surface)]/90 border-t-2 border-[var(--accent-primary)]/20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-center items-center text-center">
            <p className="font-mono text-xs text-[var(--muted)]">
              <span className="text-[var(--accent-primary)]">◆</span> {messages.footer?.copyright || 'DeepWiki - AI-powered documentation for your repositories'}
            </p>
          </div>
        </div>
      </footer>

      {/* Terminal-style Ask button */}
      {!isLoading && wikiStructure && (
        <button
          onClick={() => setIsAskModalOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-lg bg-[var(--accent-primary)] text-white shadow-2xl flex items-center justify-center hover:bg-[var(--accent-secondary)] transition-all z-50 border-2 border-[var(--accent-primary)]/50 hover:border-[var(--accent-cyan)] group"
          aria-label={messages.ask?.title || 'Ask about this repository'}
        >
          <FaComments className="text-xl group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--accent-emerald)] rounded-full border-2 border-[var(--background)] pulse-glow"></span>
        </button>
      )}
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isAskModalOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} backdrop-blur-sm bg-black/70`}>
        <div className="relative w-full max-w-4xl max-h-[80vh] bg-[var(--surface)] rounded-2xl shadow-2xl border border-[var(--glass-border)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-end p-3 border-b border-[var(--glass-border)] bg-[var(--surface)]/80">
            <button onClick={() => setIsAskModalOpen(false)} className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors rounded-full p-2" aria-label="Close">
              <FaTimes className="text-xl" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <Ask repoInfo={effectiveRepoInfo} provider={selectedProviderState} model={selectedModelState} isCustomModel={isCustomSelectedModelState} customModel={customSelectedModelState} language={language} onRef={(ref) => (askComponentRef.current = ref)} />
          </div>
        </div>
      </div>
      <ModelSelectionModal
        isOpen={isModelSelectionModalOpen}
        onClose={() => setIsModelSelectionModalOpen(false)}
        provider={selectedProviderState}
        setProvider={setSelectedProviderState}
        model={selectedModelState}
        setModel={setSelectedModelState}
        isCustomModel={isCustomSelectedModelState}
        setIsCustomModel={setIsCustomSelectedModelState}
        customModel={customSelectedModelState}
        setCustomModel={setCustomSelectedModelState}
        isComprehensiveView={isComprehensiveView}
        setIsComprehensiveView={setIsComprehensiveView}
        showFileFilters={true}
        excludedDirs={modelExcludedDirs}
        setExcludedDirs={setModelExcludedDirs}
        excludedFiles={modelExcludedFiles}
        setExcludedFiles={setModelExcludedFiles}
        includedDirs={modelIncludedDirs}
        setIncludedDirs={setModelIncludedDirs}
        includedFiles={modelIncludedFiles}
        setIncludedFiles={setModelIncludedFiles}
        onApply={confirmRefresh}
        showWikiType={true}
        showTokenInput={effectiveRepoInfo.type !== 'local' && !currentToken}
        repositoryType={effectiveRepoInfo.type as 'github' | 'gitlab' | 'bitbucket' | 'azure'}
        authRequired={authRequired}
        authCode={authCode}
        setAuthCode={setAuthCode}
        isAuthLoading={isAuthLoading}
      />
    </div>
  );
}
