# DeepWiki Copilot Instructions

## Architecture Overview

DeepWiki is a dual-stack application: **Next.js 15 frontend** (React 19, Tailwind 4) + **FastAPI backend** (Python, adalflow framework). It generates AI-powered documentation wikis for GitHub, GitLab, Bitbucket, and Azure DevOps repositories using RAG (Retrieval Augmented Generation).

### Data Flow
1. User submits repo URL → Backend clones repo to `~/.adalflow/repos/`
2. `data_pipeline.py` processes files → Creates FAISS embeddings stored in `~/.adalflow/databases/`
3. Wiki structure generated via LLM → Cached as JSON in `~/.adalflow/wikicache/`
4. Q&A uses RAG pipeline (`rag.py`) with conversation memory

### Key Files
- **Entry points**: `src/app/page.tsx` (frontend), `api/main.py` (backend)
- **RAG system**: `api/rag.py` - FAISS retriever + multi-provider LLM support
- **LLM clients**: `api/openai_client.py`, `api/deepseek_client.py`, `api/openrouter_client.py`, `api/google_embedder_client.py`
- **Background jobs**: `api/background/worker.py` (WikiGenerationWorker), `api/background/job_manager.py` (job CRUD)
- **Config system**: `api/config.py` loads JSON from `api/config/` with `${ENV_VAR:-default}` substitution
- **Data pipeline**: `api/data_pipeline.py` - repository cloning, document processing, embedding generation

## Development Commands

```bash
# Frontend
yarn install && yarn dev          # Dev server on :3000 (Turbopack)
yarn build                        # Production build
yarn lint                         # ESLint

# Backend
python -m pip install poetry==1.8.2 && poetry install -C api  # Install deps
python -m api.main                # API server on :8001

# Docker
docker-compose up                 # Full stack
```

## Provider Pattern

Use `get_model_config(provider, model)` from `api/config.py` for any LLM provider:
```python
from api.config import get_model_config
config = get_model_config("deepseek", "deepseek-chat")
# Returns: {"model_client": DeepSeekClient, "model": "...", "model_kwargs": {...}}
```

Supported providers: `google`, `openai`, `openrouter`, `deepseek`, `ollama`

## Embedder Selection

Controlled by `DEEPWIKI_EMBEDDER_TYPE` env var (`openai`, `google`, `ollama`, `openrouter`):
```python
from api.tools.embedder import get_embedder
embedder = get_embedder()  # Auto-detects from env
```

**Embedding Model Configuration:**
- `OPENAI_EMBEDDING_MODEL`: OpenAI model (default: `text-embedding-3-large`)
- `GOOGLE_EMBEDDING_MODEL`: Google model (default: `text-embedding-004`)
- `OLLAMA_EMBEDDING_MODEL`: Ollama model (default: `nomic-embed-text`)
- `OPENROUTER_EMBEDDING_MODEL`: OpenRouter model (default: `openai/text-embedding-3-large`)

## Background Job System

Wiki generation runs async via `api/background/`:
- **worker.py**: `WikiGenerationWorker` with per-page checkpointing (3 retry attempts per page)
- **job_manager.py**: Job CRUD operations (SQLite via aiosqlite)
- **database.py**: Async SQLite database layer for job persistence
- **models.py**: Pydantic models for job status and progress updates
- **Jobs dashboard**: Monitor progress at `http://localhost:3000/jobs`
- **Multi-phase workflow**: Prepare embeddings (0-10%) → Generate structure (10-50%) → Generate pages (50-100%)
- **Progress tracking**: Real-time updates via WebSocket with per-page statistics
- **Timeout protection**: 10 minutes max per page, 5 minutes max for LLM generation
- **Job control**: Pause/resume/cancel jobs at any time

## Conventions

- **Streaming responses**: Both WebSocket (`/ws/chat`) and HTTP (`/chat/completions/stream`)
- **Config files**: Add new LLM providers to `api/config/generator.json`, embedders to `embedder.json`
- **Prompts**: All system prompts in `api/prompts.py` (RAG_SYSTEM_PROMPT, RAG_TEMPLATE)
- **Frontend routing**: Dynamic routes at `src/app/[owner]/[repo]/page.tsx`
- **Environment placeholders**: Use `${VAR:-default}` syntax in JSON configs
- **Repository types**: Support `github`, `gitlab`, `bitbucket`, `azure`
- **Logging**: Configure via `LOG_LEVEL` (DEBUG|INFO|WARNING|ERROR|CRITICAL) and `LOG_FILE_PATH`

## Communication Style

When responding to the user:
- **Skip the explanations**: Don't list what you changed or what you did. Just do it and confirm it's done.
- **Plain words only**: Use everyday English. Drop the corporate talk. No "comprehensive", "robust", "leverage", "facilitate", "seamless", "synergy" - that stuff sounds like an AI wrote it.
- **Talk like a friend**: Short sentences, familiar words, real language.
- **Keep it brief**: Say only what matters. Skip the fluff.

## Required Environment Variables

**LLM Provider Keys** (at least one required):
- `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, or `OLLAMA_HOST`

**Embedder Configuration** (optional):
- `DEEPWIKI_EMBEDDER_TYPE`: `openai` (default), `google`, `ollama`, or `openrouter`
- `OPENAI_EMBEDDING_MODEL`, `GOOGLE_EMBEDDING_MODEL`, `OLLAMA_EMBEDDING_MODEL`, `OPENROUTER_EMBEDDING_MODEL`

**Server Configuration** (optional):
- `PORT`: API port (default: 8001)
- `NODE_ENV`: `development` or `production`
- `SERVER_BASE_URL`: API base URL (default: `http://localhost:8001`)
- `NEXT_PUBLIC_SERVER_BASE_URL`: Frontend-accessible API URL

**Authorization** (optional):
- `DEEPWIKI_AUTH_MODE`: Enable auth (`true`/`1`, default: `false`)
- `DEEPWIKI_AUTH_CODE`: Required auth code

**Logging** (optional):
- `LOG_LEVEL`: DEBUG|INFO|WARNING|ERROR|CRITICAL (default: INFO)
- `LOG_FILE_PATH`: Log file location (default: `api/logs/application.log`)
- `LOG_MAX_SIZE`: Max log file size in bytes (default: 10485760)
- `LOG_BACKUP_COUNT`: Backup log files to keep (default: 5)

**Other** (optional):
- `DEEPWIKI_CONFIG_DIR`: Custom config directory (default: `api/config/`)
- `DEEPWIKI_EXCLUDED_DIRS`, `DEEPWIKI_EXCLUDED_FILES`: File filtering
