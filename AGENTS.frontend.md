# DeepWiki Frontend Documentation

## Overview

DeepWiki is a modern AI-powered documentation generator built with Next.js 15, TypeScript, and Tailwind CSS. The frontend follows Next.js App Router architecture and features a sophisticated dark theme with glassmorphism effects, supporting multiple Git platforms (GitHub, GitLab, Bitbucket, Azure DevOps).

## Tech Stack

### Core Technologies
- **Next.js 15** with App Router and Turbopack
- **React 19** with TypeScript
- **Tailwind CSS v4** for styling
- **Next-intl** for internationalization

### UI & Visualization
- **Mermaid** for diagram generation
- **React-Markdown** with syntax highlighting
- **React Icons** for iconography
- **svg-pan-zoom** for interactive diagrams

### Development Tools
- **ESLint** with Next.js configuration
- **PostCSS** for CSS processing
- **TypeScript 5.9** for type safety

## Directory Structure

```
src/
├── app/                          # Next.js App Router
│   ├── [owner]/[repo]/          # Dynamic wiki pages
│   ├── api/                    # API routes (auth, chat, wiki)
│   ├── globals.css            # Global styles and CSS variables
│   ├── layout.tsx             # Root layout with fonts and providers
│   ├── page.tsx               # Home page with hero and features
│   ├── jobs/                  # Background jobs page
│   └── wiki/                  # Wiki management pages
├── components/                 # Reusable React components
│   ├── Ask.tsx                # Chat interface component
│   ├── ConfigurationModal.tsx # Repository configuration modal
│   ├── Markdown.tsx           # Markdown renderer
│   ├── Mermaid.tsx            # Mermaid diagram renderer
│   ├── ModelSelectionModal.tsx # LLM model selection
│   ├── ProcessedProjects.tsx  # Project listing
│   ├── TokenInput.tsx         # Access token input
│   ├── UserSelector.tsx       # User selection
│   ├── WikiTreeView.tsx      # Wiki navigation tree
│   └── WikiTypeSelector.tsx  # Comprehensive/Concise selector
├── contexts/                   # React contexts
│   └── LanguageContext.tsx    # Internationalization context
├── hooks/                      # Custom React hooks
│   └── useProcessedProjects.ts # Project data fetching
├── i18n.ts                    # Next-intl configuration
├── messages/                  # Translation files
│   ├── en.json               # English translations
│   └── vi.json               # Vietnamese translations
├── types/                     # TypeScript type definitions
│   ├── repoinfo.tsx          # Repository information types
│   └── wiki/                 # Wiki-related types
└── utils/                     # Utility functions
    ├── apiClient.ts          # API client with authentication
    ├── backgroundJobClient.ts # Background job management
    ├── streamingClient.ts    # HTTP streaming communication
    ├── getRepoUrl.tsx         # Repository URL parsing
    └── urlDecoder.tsx        # URL parsing utilities
```

## Architecture

### Next.js App Router Structure

The application uses Next.js 15's App Router with the following key routes:

- `/` - Home page with hero section and repository input
- `/[owner]/[repo]` - Dynamic wiki generation page
- `/wiki/projects` - List of processed wiki projects
- `/wiki/job/[jobId]` - Background job status page
- `/jobs` - Background jobs management

### Component Architecture

#### Layout Components
- **Root Layout** (`app/layout.tsx`): Sets up fonts, dark mode, and language provider
- **Header**: Sticky navigation with brand and links
- **Footer**: Simple footer with copyright and links

#### Page Components
- **Home Page** (`app/page.tsx`): Hero section, repository input, features showcase
- **Wiki Page** (`app/[owner]/[repo]/page.tsx`): Main wiki interface with Ask component and navigation
- **Configuration Modal**: Repository settings and LLM configuration

#### Reusable Components
- **Ask Component**: Chat interface with HTTP streaming
- **WikiTreeView**: Interactive sidebar navigation
- **Markdown**: Enhanced markdown renderer with syntax highlighting
- **Mermaid**: Diagram rendering with zoom capabilities

## State Management

### Context API
The application uses React Context for global state:

#### LanguageContext (`contexts/LanguageContext.tsx`)
- **Purpose**: Internationalization and language switching
- **Features**:
  - Browser language detection
  - localStorage persistence
  - Dynamic message loading
  - Fallback to English on errors

### Custom Hooks
#### useProcessedProjects (`hooks/useProcessedProjects.ts`)
- **Purpose**: Fetch and manage processed projects data
- **Features**:
  - Automatic data fetching on mount
  - Loading and error states
  - Data caching strategy

### Local State
Components use React hooks for local state management:
- `useState` for form inputs and UI states
- `useEffect` for side effects and data fetching
- `useRef` for DOM references and preserving values
- `useCallback` for function memoization

## API Integration Patterns

### Client-Side API Communication
The frontend communicates with the backend through multiple patterns:

#### 1. REST API with fetch
```typescript
// Pattern from useProcessedProjects
const response = await fetch('/api/wiki/projects');
const data = await response.json();
```

#### 2. HTTP Streaming for Real-time Chat
```typescript
// Pattern from streamingClient.ts
await createStreamingRequest(request, onMessage, onError, onClose);
```

#### 3. API Client with Authentication
```typescript
// Pattern from apiClient.ts
export async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response>
```

### API Routes
Frontend API routes proxy to backend:
- `/api/auth/status` - Authentication status
- `/api/auth/validate` - Code validation
- `/api/chat/stream` - Chat streaming
- `/api/wiki/projects` - Project listing
- `/api/lang/config` - Language configuration

### Background Jobs
The frontend tracks background jobs through:
- `/api/wiki/jobs` - Job listing
- `/api/wiki/jobs/[jobId]` - Job status
- HTTP streaming for real-time progress updates

## Styling Approach

### Tailwind CSS Configuration
- **Tailwind v4** with custom configuration
- **Dark mode** enabled with CSS variables
- **Custom theme** with Japanese aesthetic

### CSS Architecture
#### CSS Variables System (`app/globals.css`)
```css
:root {
  /* Color scheme */
  --background: #0a0a1f;     /* Deep space navy */
  --surface: #13132b;        /* Elevated surface */
  --foreground: #f8fafc;      /* Soft white */

  /* Gradients */
  --gradient-from: #8b5cf6;   /* Purple */
  --gradient-to: #06b6d4;    /* Cyan */

  /* Accents */
  --accent-primary: #8b5cf6; /* Purple */
  --accent-cyan: #06b6d4;    /* Cyan */
}
```

### Design System
#### Visual Effects
- **Glassmorphism**: Frosted glass effect with backdrop-filter
- **Gradient animations**: Animated background gradients
- **Hover states**: Smooth transitions on interactive elements
- **Shadow system**: Custom shadows for depth

#### Component Styles
- **`.glass`**: Glassmorphism base style
- **`.glass-hover`**: Enhanced hover effects
- **`.gradient-text`**: Gradient text effects
- **Custom utility classes** for consistent spacing and sizing

### Typography
- **DM Sans**: Primary font (weights: 400, 500, 700)
- **JetBrains Mono**: Code font (weights: 400, 500, 700)
- **Syne**: Display font for headings
- **Font optimization** with `display: swap`

## Routing and Navigation

### Dynamic Routes
- **`[owner]/[repo]`**: Dynamic wiki pages for each repository
- **Query parameters**: Configuration passed via URL
- **Client-side navigation**: Using Next.js router

### Navigation Structure
- **Sticky header** with brand and navigation links
- **Breadcrumbs** for wiki navigation
- **Sidebar navigation** with WikiTreeView component
- **Smooth scrolling** for anchor links

### URL Management
- **Repository URL parsing** with support for multiple platforms
- **Configuration caching** in localStorage
- **URL encoding** for special characters

## Form Handling and Validation

### Repository Input Form
#### Features
- **Multi-platform support**: GitHub, GitLab, Bitbucket, Azure
- **Local repository support**: File system paths
- **Input validation**: URL and path format checking
- **Auto-completion**: Repository config caching

#### Validation Patterns
```typescript
// Repository URL parsing
const parseRepositoryInput = (input: string): {
  owner: string,
  repo: string,
  type: string,
  fullPath?: string,
  localPath?: string
} | null => {
  // Windows path, Unix path, and Git URL patterns
}
```

### Configuration Modal
#### Form Fields
- **Language selection**: Multi-language support
- **Wiki type**: Comprehensive/Concise options
- **LLM provider**: Multiple AI providers
- **Model selection**: Predefined and custom models
- **File filters**: Include/exclude patterns
- **Access tokens**: Private repository access

### State Management for Forms
- **Controlled components** with React state
- **Form validation** on submit
- **Error handling** with user-friendly messages
- **Loading states** during async operations

## Performance Optimizations

### Next.js Optimizations
#### Bundle Optimization (`next.config.ts`)
```typescript
// Standalone output for Docker
output: 'standalone'

// Package import optimization
experimental: {
  optimizePackageImports: ['@mermaid-js/mermaid', 'react-syntax-highlighter'],
}

// Webpack optimizations
webpack: (config) => {
  // Split chunks for better caching
  splitChunks: {
    chunks: 'all',
    cacheGroups: {
      vendor: {
        test: /[\\/]node_modules[\\/]/,
        name: 'vendors',
        chunks: 'all',
      },
    },
  }
}
```

### Runtime Optimizations
#### Code Splitting
- **Dynamic imports** for heavy components
- **Route-based splitting** with Next.js
- **Component lazy loading** where applicable

#### Image Optimization
- **SVG icons** inline for performance
- **No external image dependencies**
- **Optimized icon sizes** with viewBox

#### Data Fetching
- **useProcessedProjects hook** with caching
- **HTTP streaming** for real-time updates
- **Optimized API calls** with proper error handling

### Rendering Optimizations
- **React.memo** for expensive components
- **useCallback** for event handlers
- **useMemo** for computed values
- **Virtual scrolling** for large lists (WikiTreeView)

### Memory Management
- **Stream cleanup** on component unmount
- **Event listener removal** for proper cleanup
- **localStorage size management** for cached configs

## Key UI Patterns

### Glassmorphism Design
- **Frosted glass effect** on cards and modals
- **Backdrop blur** for depth
- **Subtle borders** with gradient colors
- **Hover animations** for interactivity

### Component Patterns
#### Modal Pattern
```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  // ... other props
}
```

#### Tree View Pattern
- **Expandable/collapsible sections**
- **Active state highlighting**
- **Nested navigation with indentation**
- **Keyboard navigation support**

#### Chat Interface Pattern
- **Message history** with role differentiation
- **Streaming responses** with HTTP streaming
- **Input focus management**
- **Scroll to bottom** on new messages

### Responsive Design
- **Mobile-first** approach with Tailwind utilities
- **Breakpoint variations** (sm:, md:, lg:)
- **Touch-friendly** interactions
- **Flexible layouts** with flexbox and grid

## Development Guidelines

### Code Patterns
1. **TypeScript strict mode** for type safety
2. **ESLint Next.js** configuration
3. **Functional components** with hooks
4. **Descriptive prop interfaces**
5. **Error boundaries** for error handling

### Styling Conventions
1. **CSS variables** for theming
2. **Utility-first** Tailwind classes
3. **Consistent spacing** with spacing scale
4. **Semantic HTML** elements
5. **Accessibility-first** design

### Performance Considerations
1. **Bundle analysis** for dependencies
2. **Code splitting** for large components
3. **Image optimization** where applicable
4. **Caching strategies** for API data
5. **Web Workers** for heavy computations (future)