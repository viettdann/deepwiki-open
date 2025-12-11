# AGENTS.md
Primary guidance for AI agents when working with code in this repository.

**IGNORE CLAUDE.md, GEMINI.md, .github/copilot-instructions.md**

## Quick Reference

- **API Details**: See AGENTS.api.md
- **Frontend Guide**: See AGENTS.frontend.md
- **HTTP Streaming & Real-time Updates**: See AGENTS.streaming.md
- **Workflow/Processing**: See AGENTS.workflow.md
- **Authentication & Authorization**: See AGENTS.auth.md

## Project Overview

DeepWiki is an AI-powered wiki generator for GitHub/GitLab/Bitbucket/Azure DevOps repositories. It analyzes code structure, generates documentation with visual diagrams, and provides RAG-powered Q&A capabilities.

**Tech Stack:**
- Frontend: Next.js 15 with React 19 and Tailwind CSS 4
- Backend: FastAPI with async processing and HTTP streaming (no WebSocket)
- Storage: SQLite + FAISS vector search + local filesystem cache

## Development Commands

```bash
# Frontend (Next.js 15 with Turbopack)
yarn install          # Install JS dependencies
yarn dev              # Start frontend on port 3000
yarn build            # Production build
yarn lint             # ESLint check

# Backend (Python/FastAPI)
# Make sure you have uv installed (curl -LsSf https://astral.sh/uv/install.sh | sh)
source api/.venv/bin/activate
cd api && uv venv && uv sync && cd ..
uv run python -m api.main    # Start API server on port 8001

# Docker
docker-compose up     # Run full stack
```

## Key Environment Variables

### LLM Provider Keys (at least one required)
- `GOOGLE_API_KEY` - Google Gemini
- `OPENAI_API_KEY` - OpenAI
- `OPENROUTER_API_KEY` - OpenRouter
- `DEEPSEEK_API_KEY` - DeepSeek
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_VERSION` - Azure OpenAI (chat + embeddings)
- `OLLAMA_HOST` - Local Ollama (defaults to `http://localhost:11434`)

### Server Configuration
- `PORT`: API server port (default: 8001)
- `SERVER_BASE_URL`: API base URL for frontend (default: `http://localhost:8001`)
- `NEXT_PUBLIC_SERVER_BASE_URL`: Frontend-accessible API URL
- `NODE_ENV`: `development` or `production`

### Embedder Configuration
- `DEEPWIKI_EMBEDDER_TYPE`: `openai` (default), `google`, `ollama`, `openrouter`, or `azure`
- `USE_SYNTAX_AWARE_CHUNKING`: Enable syntax-aware code chunking (`true` or `false`, default: `false`; `.env.example` now ships with it set to `true`)
  - Respects code boundaries for C#, TypeScript, and JavaScript
  - Requires regenerating embeddings for existing repositories after enabling

### Worker Concurrency (Optional)
- `DEEPWIKI_PAGE_CONCURRENCY`: Number of pages to generate in parallel within a single job (default: `1`)
  - Set to `1` for sequential processing (original behavior)
  - Set to `2-3` for parallel processing (faster generation, higher API usage)
  - Higher values increase speed but also memory usage and API rate limit pressure


### Authentication & Authorization
For detailed authentication setup and configuration, see **AGENTS.auth.md**.

The system includes:
- JWT-based authentication with role-based access control (admin/readonly)
- Terminal Codex-themed login interface
- Role-based UI components with elegant permission handling
- HttpOnly cookies for secure session management

Key environment variables:
- `DEEPWIKI_AUTH_LOGIN_REQUIRED`: Enable JWT authentication (default: `false`)
- `DEEPWIKI_AUTH_STORE_PATH`: Path to users.json file
- `DEEPWIKI_AUTH_JWT_SECRET`: Secret key for JWT signing
- `DEEPWIKI_FRONTEND_API_KEY`: API key for frontend-backend communication

## Architecture Overview

### Frontend (`src/`)
- **Next.js App Router** with TypeScript
- Entry: `src/app/page.tsx` (main wiki generator interface)
- Wiki display: `src/app/[owner]/[repo]/page.tsx`
- Background jobs UI: `src/app/jobs/page.tsx`
- Components: Mermaid diagram renderer, Markdown with syntax highlighting, model selection

**Authentication & Role-Based UI:**
- `src/contexts/AuthContext.tsx` - React authentication context
- `src/contexts/PermissionContext.tsx` - Permission context for role-based UI
- `src/components/RoleBasedButton.tsx` - Reusable permission-aware button component
- `src/components/PermissionDeniedModal.tsx` - Terminal Codex permission modal
- `src/app/login/page.tsx` - Terminal Codex themed login page

### Backend (`api/`)
- **FastAPI** server (`api/api.py`) with CORS enabled
- Entry point: `api/main.py` - validates API keys, starts uvicorn

**Core Systems:**
- `api/rag.py`: RAG implementation with FAISS retriever
- `api/data_pipeline.py`: Repository cloning, document processing
- `api/config.py`: Provider configuration loader
- `api/simple_chat.py`: HTTP streaming chat endpoint (primary)

**Background Job System (`api/background/`):**
- `worker.py`: Async worker for wiki generation
- `job_manager.py`: Job CRUD operations
- `database.py`: SQLite async database
- `models.py`: Pydantic models for job status

### Configuration Files (`api/config/`)
- `generator.json`: LLM provider/model definitions
- `embedder.json`: Embedding model config
- `repo.json`: File/directory exclusion patterns
- `lang.json`: Supported language mappings

### Data Storage (`~/.adalflow/`)
- `repos/`: Cloned repositories
- `databases/`: FAISS indexes and embeddings
- `wikicache/`: Generated wiki cache

## Key Patterns

**Multi-Provider LLM Support**: Use `get_model_config(provider, model)` from `api/config.py` to get client/kwargs for any provider (google, openai, openrouter, ollama, deepseek, azure).

**Embedder Selection**: Controlled by `DEEPWIKI_EMBEDDER_TYPE` env var. Use `get_embedder()` from `api/tools/embedder.py`.

**Environment Variables**: All configs support `${ENV_VAR}` or `${ENV_VAR:-default}` placeholder substitution in JSON files.

**HTTP Streaming**: All real-time features use HTTP streaming for chat completions (`POST /chat/completions/stream`) and job progress tracking (`GET /api/wiki/jobs/{job_id}/progress/stream`).

**Background Jobs**: Wiki generation uses async job system with checkpointing and progress tracking via HTTP streaming.

**Role-Based UI**: Use `RoleBasedButton` component for admin-only actions. It automatically handles permission checks and shows a Terminal Codex permission modal for readonly users.

## Common Tasks

### Working with API Endpoints
- See AGENTS.api.md for complete API documentation
- All `/api/*` endpoints require API key authentication
- HTTP streaming endpoints for real-time updates (no WebSocket)

### Frontend Development
- See AGENTS.frontend.md for component architecture
- Uses Next.js App Router with TypeScript
- Dark theme with glassmorphism effects

### Streaming Integration
- See AGENTS.streaming.md for HTTP streaming details
- Chat completions via HTTP streaming (`POST /chat/completions/stream`)
- Job progress via HTTP streaming (`GET /api/wiki/jobs/{job_id}/progress/stream`)

### Repository Processing
- See AGENTS.workflow.md for pipeline details
- Supports GitHub, GitLab, Bitbucket, Azure DevOps
- RAG-powered Q&A with context retrieval

## Logging Configuration

Configure diagnostic output via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL) | INFO |
| `LOG_FILE_PATH` | Path to log file output | `api/logs/application.log` |
| `LOG_MAX_SIZE` | Max log file size before rotation (bytes) | 10485760 (10MB) |
| `LOG_BACKUP_COUNT` | Number of backup log files to keep | 5 |

**Important**: Log files are restricted to `api/logs/` directory for security.
