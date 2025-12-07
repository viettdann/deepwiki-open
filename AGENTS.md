# AGENTS.md
Primary guidance for AI agents when working with code in this repository.

**IGNORE CLAUDE.md, GEMINI.md, .github/copilot-instructions.md**

## Quick Reference

- **API Details**: See AGENTS.api.md
- **Frontend Guide**: See AGENTS.frontend.md
- **WebSocket Protocol**: See AGENTS.websocket.md
- **Workflow/Processing**: See AGENTS.workflow.md

## Project Overview

DeepWiki is an AI-powered wiki generator for GitHub/GitLab/Bitbucket/Azure DevOps repositories. It analyzes code structure, generates documentation with visual diagrams, and provides RAG-powered Q&A capabilities.

**Tech Stack:**
- Frontend: Next.js 15 with React 19 and Tailwind CSS 4
- Backend: FastAPI with async processing and WebSocket support
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
- `OLLAMA_HOST` - Local Ollama (defaults to `http://localhost:11434`)

### Server Configuration
- `PORT`: API server port (default: 8001)
- `SERVER_BASE_URL`: API base URL for frontend (default: `http://localhost:8001`)
- `NEXT_PUBLIC_SERVER_BASE_URL`: Frontend-accessible API URL
- `NODE_ENV`: `development` or `production`

### Embedder Configuration
- `DEEPWIKI_EMBEDDER_TYPE`: `openai` (default), `google`, `ollama`, or `openrouter`

### Authorization
- `DEEPWIKI_AUTH_MODE`: Enable authorization (`true` or `1`, default: `false`)
- `DEEPWIKI_AUTH_CODE`: Required auth code when `DEEPWIKI_AUTH_MODE` enabled

## Architecture Overview

### Frontend (`src/`)
- **Next.js App Router** with TypeScript
- Entry: `src/app/page.tsx` (main wiki generator interface)
- Wiki display: `src/app/[owner]/[repo]/page.tsx`
- Background jobs UI: `src/app/jobs/page.tsx`
- Components: Mermaid diagram renderer, Markdown with syntax highlighting, model selection

### Backend (`api/`)
- **FastAPI** server (`api/api.py`) with CORS enabled
- Entry point: `api/main.py` - validates API keys, starts uvicorn

**Core Systems:**
- `api/rag.py`: RAG implementation with FAISS retriever
- `api/data_pipeline.py`: Repository cloning, document processing
- `api/config.py`: Provider configuration loader
- `api/websocket_wiki.py`: WebSocket chat endpoint
- `api/simple_chat.py`: HTTP streaming chat endpoint

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

**Multi-Provider LLM Support**: Use `get_model_config(provider, model)` from `api/config.py` to get client/kwargs for any provider (google, openai, openrouter, ollama, deepseek).

**Embedder Selection**: Controlled by `DEEPWIKI_EMBEDDER_TYPE` env var. Use `get_embedder()` from `api/tools/embedder.py`.

**Environment Variables**: All configs support `${ENV_VAR}` or `${ENV_VAR:-default}` placeholder substitution in JSON files.

**Streaming Responses**: Both WebSocket (`/ws/chat`) and HTTP POST (`/chat/completions/stream`) endpoints support streaming.

**Background Jobs**: Wiki generation uses async job system with checkpointing and progress tracking via WebSocket.

## Common Tasks

### Working with API Endpoints
- See AGENTS.api.md for complete API documentation
- All `/api/*` endpoints require API key authentication
- WebSocket endpoints for real-time updates

### Frontend Development
- See AGENTS.frontend.md for component architecture
- Uses Next.js App Router with TypeScript
- Dark theme with glassmorphism effects

### WebSocket Integration
- See AGENTS.websocket.md for protocol details
- Chat completions via `/ws/chat`
- Job progress via `/api/wiki/jobs/{job_id}/progress`

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