# AGENTS.md
This file provides guidance to AI agents when working with code in this repository.
**IGNORE CLAUDE.md, GEMINI.md, .github/copilot-instructions.md**

## Project Overview

DeepWiki is an AI-powered wiki generator for GitHub/GitLab/Bitbucket/Azure DevOps repositories. It analyzes code structure, generates documentation with visual diagrams, and provides RAG-powered Q&A capabilities.

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

## Architecture

### Frontend (`src/`)
- **Next.js 15** with React 19 and Tailwind CSS 4
- Entry: `src/app/page.tsx` (main wiki generator interface)
- Wiki display: `src/app/[owner]/[repo]/page.tsx`
- Background jobs UI: `src/app/jobs/page.tsx`, `src/app/wiki/job/[jobId]/page.tsx`
- Components: Mermaid diagram renderer, Markdown with syntax highlighting, model selection

### Backend (`api/`)
- **FastAPI** server (`api/api.py`) with CORS enabled
- Entry point: `api/main.py` - validates API keys, starts uvicorn

**Core Systems:**
- `api/rag.py`: RAG implementation with FAISS retriever, conversation memory, multi-provider LLM support
- `api/data_pipeline.py`: Repository cloning, document processing, embedding generation, `DatabaseManager` class
- `api/config.py`: Provider configuration loader, environment variable handling
- `api/websocket_wiki.py`: WebSocket chat endpoint for streaming responses
- `api/simple_chat.py`: HTTP streaming chat endpoint

**Background Job System (`api/background/`):**
- `worker.py`: `WikiGenerationWorker` - async worker for wiki generation with per-page checkpointing
- `job_manager.py`: Job CRUD operations
- `database.py`: SQLite async database (aiosqlite)
- `models.py`: Pydantic models for job status, progress updates

**LLM Provider Clients:**
- `api/openai_client.py`, `api/openrouter_client.py`, `api/deepseek_client.py`, `api/google_embedder_client.py`
- All inherit from adalflow base classes

### Configuration Files (`api/config/`)
- `generator.json`: LLM provider/model definitions
- `embedder.json`: Embedding model config (OpenAI, Google, Ollama, OpenRouter)
- `repo.json`: File/directory exclusion patterns
- `lang.json`: Supported language mappings

### Data Storage (`~/.adalflow/`)
- `repos/`: Cloned repositories
- `databases/`: FAISS indexes and embeddings (.pkl files)
- `wikicache/`: Generated wiki cache (JSON)

## Key Patterns

**Multi-Provider LLM Support**: Use `get_model_config(provider, model)` from `api/config.py` to get client/kwargs for any provider (google, openai, openrouter, ollama, deepseek).

**Embedder Selection**: Controlled by `DEEPWIKI_EMBEDDER_TYPE` env var. Use `get_embedder()` from `api/tools/embedder.py`.

**Environment Variables**: All configs support `${ENV_VAR}` or `${ENV_VAR:-default}` placeholder substitution in JSON files.

**Streaming Responses**: Both WebSocket (`/ws/chat`) and HTTP POST (`/chat/completions/stream`) endpoints support streaming.

## Required Environment Variables

### LLM Provider Keys (at least one required)
- `GOOGLE_API_KEY` - Google Gemini
- `OPENAI_API_KEY` - OpenAI
- `OPENROUTER_API_KEY` - OpenRouter
- `DEEPSEEK_API_KEY` - DeepSeek
- `OLLAMA_HOST` - Local Ollama (defaults to `http://localhost:11434`)

### Embedder Configuration
- `DEEPWIKI_EMBEDDER_TYPE`: `openai` (default), `google`, `ollama`, or `openrouter`
- `OPENAI_EMBEDDING_MODEL`: OpenAI embedding model (default: `text-embedding-3-large`)
- `GOOGLE_EMBEDDING_MODEL`: Google embedding model (default: `text-embedding-004`)
- `OLLAMA_EMBEDDING_MODEL`: Local Ollama embedding model
- `OPENROUTER_EMBEDDING_MODEL`: OpenRouter embedding model (default: `openai/text-embedding-3-small`)

### Server Configuration
- `PORT`: API server port (default: 8001)
- `SERVER_BASE_URL`: API base URL for frontend (default: `http://localhost:8001`)
- `NEXT_PUBLIC_SERVER_BASE_URL`: Frontend-accessible API URL
- `NODE_ENV`: `development` or `production`

### Authorization
- `DEEPWIKI_AUTH_MODE`: Enable authorization (`true` or `1`, default: `false`)
- `DEEPWIKI_AUTH_CODE`: Required auth code when `DEEPWIKI_AUTH_MODE` enabled

### Custom Configuration
- `DEEPWIKI_CONFIG_DIR`: Custom path for config files (default: `api/config/`)

### Repository Processing
- `DEEPWIKI_EXCLUDED_DIRS`: Additional directories to exclude from indexing
- `DEEPWIKI_EXCLUDED_FILES`: Additional file patterns to exclude from indexing

## Logging Configuration

Configure diagnostic output via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL) | INFO |
| `LOG_FILE_PATH` | Path to log file output | `api/logs/application.log` |
| `LOG_MAX_SIZE` | Max log file size before rotation (bytes) | 10485760 (10MB) |
| `LOG_BACKUP_COUNT` | Number of backup log files to keep | 5 |

**Example**: Enable debug logging to custom file:
```bash
LOG_LEVEL=DEBUG LOG_FILE_PATH=./debug.log python -m api.main
```

**Docker example**:
```bash
LOG_LEVEL=DEBUG LOG_FILE_PATH=./debug.log docker-compose up
```

**Important**: Log files are restricted to `api/logs/` directory for security (prevents path traversal attacks).

## Azure DevOps Integration

DeepWiki supports Azure DevOps repositories (both `dev.azure.com` and legacy `*.visualstudio.com` domains).

### URL Format
- **New format**: `https://dev.azure.com/{organization}/{project}/_git/{repository}`
- **Legacy format**: `https://{organization}.visualstudio.com/{project}/_git/{repository}`

### Setup
1. Create a Personal Access Token (PAT) in Azure DevOps with "Code (read)" scope
2. Pass token when generating wiki or in the UI "Add access tokens" field
3. DeepWiki handles authentication internally via Basic auth

### Implementation Details
- Cloning: Uses PAT as basic auth credential
- File content retrieval: Uses Azure DevOps REST API v7.1
- Supports both organization-scoped and repository-scoped tokens
