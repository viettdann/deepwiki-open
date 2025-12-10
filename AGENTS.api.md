# DeepWiki API Documentation

## Overview

The DeepWiki API is a comprehensive system designed to generate AI-powered wikis from GitHub/GitLab/Bitbucket repositories. Built with FastAPI, it provides RESTful endpoints and HTTP streaming for wiki generation, chat completions, and repository analysis.

## Architecture

### Core Components

1. **FastAPI Application** (`api/api.py`)
   - Main API server with CORS and authentication middleware
   - RESTful endpoints for wiki operations
   - HTTP streaming endpoint for real-time chat

2. **Background Job System** (`api/background/`)
   - Asynchronous worker for wiki generation
   - Job persistence with SQLite database
   - Real-time progress tracking via HTTP streaming

3. **RAG (Retrieval-Augmented Generation)** Integration
   - Document embedding and retrieval
   - Context-aware chat completions
   - Multi-provider LLM support

4. **Authentication & Authorization**
   - API key-based authentication
   - Wiki-level access control
   - Configurable security settings

## API Endpoints

### Root Endpoint

```
GET /
```

Returns API status and dynamically lists all available endpoints.

### Model Configuration

```
GET /models/config
```

**Response:**
```json
{
  "providers": [
    {
      "id": "deepseek",
      "name": "Deepseek",
      "supportsCustomModel": true,
      "models": [
        {"id": "deepseek-chat", "name": "deepseek-chat"},
        {"id": "deepseek-reasoner", "name": "deepseek-reasoner"}
      ]
    },
    {
      "id": "google",
      "name": "Google",
      "supportsCustomModel": true,
      "models": [
        {"id": "gemini-2.5-flash", "name": "gemini-2.5-flash"},
        {"id": "gemini-2.5-flash-lite", "name": "gemini-2.5-flash-lite"},
        {"id": "gemini-2.5-pro", "name": "gemini-2.5-pro"}
      ]
    },
    {
      "id": "openai",
      "name": "OpenAI",
      "supportsCustomModel": true,
      "models": [
        {"id": "gpt-5", "name": "gpt-5"},
        {"id": "gpt-4o", "name": "gpt-4o"},
        {"id": "o1", "name": "o1"},
        {"id": "o3", "name": "o3"}
      ]
    },
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "supportsCustomModel": true,
      "models": [
        {"id": "x-ai/grok-4.1-fast:free", "name": "x-ai/grok-4.1-fast:free"},
        {"id": "google/gemini-2.5-flash", "name": "google/gemini-2.5-flash"},
        {"id": "anthropic/claude-sonnet-4.5", "name": "anthropic/claude-sonnet-4.5"}
      ]
    },
    {
      "id": "ollama",
      "name": "Ollama",
      "supportsCustomModel": true,
      "models": [
        {"id": "qwen3:1.7b", "name": "qwen3:1.7b"},
        {"id": "llama3:8b", "name": "llama3:8b"},
        {"id": "qwen3:8b", "name": "qwen3:8b"}
      ]
    }
  ],
  "defaultProvider": "deepseek"
}
```

### Chat Completions (Streaming)

```
POST /chat/completions/stream
```

**Request Body:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "messages": [
    {
      "role": "user",
      "content": "Explain the architecture of this repository"
    }
  ],
  "filePath": null,
  "token": null,
  "type": "github",
  "provider": "google",
  "model": "gemini-2.5-flash",
  "language": "en",
  "excluded_dirs": null,
  "excluded_files": null,
  "included_dirs": null,
  "included_files": null
}
```

**Response:**
Server-Sent Events (SSE) stream of text chunks.

### Wiki Export

```
POST /export/wiki
```

**Request Body:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "pages": [...],
  "format": "markdown"
}
```

**Response:**
File download (Markdown or JSON format).

### Local Repository Structure

```
GET /local_repo/structure?path=/path/to/repo
```

**Response:**
```json
{
  "file_tree": "file1.txt\nfile2.py\n...",
  "readme": "# README Content\n..."
}
```

### Authentication Endpoints

```
GET /auth/status
POST /auth/validate
```

**Response:**
```json
{
  "auth_required": false
}
```

**Validation Request:**
```json
{
  "code": "auth-code"
}
```

### Language Configuration

```
GET /lang/config
```

**Response:**
```json
{
  "supported_languages": {
    "en": "English",
    "vi": "Vietnamese (Tiếng Việt)"
  },
  "default": "en"
}
```

### Wiki Cache Operations

```
GET /api/wiki_cache?owner=owner&repo=repo&repo_type=github&language=en
POST /api/wiki_cache
DELETE /api/wiki_cache?owner=owner&repo=repo&repo_type=github&language=en&authorization_code=code
```

**Cache Request Body:**
```json
{
  "repo": {
    "owner": "owner",
    "repo": "repo",
    "type": "github",
    "token": null,
    "localPath": null,
    "repoUrl": "https://github.com/owner/repo"
  },
  "language": "en",
  "wiki_structure": {...},
  "generated_pages": {...},
  "provider": "google",
  "model": "gemini-2.5-flash"
}
```

### Processed Projects

```
GET /api/processed_projects
```

**Response:**
```json
[
  {
    "id": "deepwiki_cache_github_owner_repo_en.json",
    "owner": "owner",
    "repo": "repo",
    "name": "owner/repo",
    "repo_type": "github",
    "submittedAt": 1234567890123,
    "language": "en"
  }
]
```

## Background Jobs API

### Create Job

```
POST /api/wiki/jobs
```

**Request Body:**
```json
{
  "repo_url": "https://github.com/owner/repo",
  "repo_type": "github",
  "owner": "owner",
  "repo": "repo",
  "access_token": null,
  "provider": "google",
  "model": "gemini-2.5-flash",
  "language": "en",
  "is_comprehensive": true,
  "excluded_dirs": ["tests", "docs"],
  "excluded_files": ["*.test.js"],
  "included_dirs": null,
  "included_files": null,
  "client_id": "client-identifier"
}
```

**Response:**
```json
{
  "job_id": "uuid-string",
  "message": "Job created successfully"
}
```

### Get Job Details

```
GET /api/wiki/jobs/{job_id}
```

**Response:**
```json
{
  "job": {
    "id": "uuid-string",
    "repo_url": "https://github.com/owner/repo",
    "repo_type": "github",
    "owner": "owner",
    "repo": "repo",
    "provider": "google",
    "model": "gemini-2.5-flash",
    "language": "en",
    "is_comprehensive": true,
    "status": "generating_pages",
    "current_phase": 2,
    "progress_percent": 75.0,
    "error_message": null,
    "total_pages": 8,
    "completed_pages": 6,
    "failed_pages": 0,
    "total_tokens_used": 15000,
    "created_at": "2024-01-01T00:00:00",
    "started_at": "2024-01-01T00:00:00",
    "completed_at": null,
    "updated_at": "2024-01-01T00:00:00"
  },
  "pages": [
    {
      "id": "page-uuid",
      "job_id": "job-uuid",
      "page_id": "page-1",
      "title": "Architecture Overview",
      "description": "High-level system architecture",
      "importance": "high",
      "file_paths": ["src/main.py", "src/config.py"],
      "related_pages": ["page-2"],
      "parent_section": "section-1",
      "status": "completed",
      "content": "# Architecture Overview\n...",
      "retry_count": 0,
      "last_error": null,
      "tokens_used": 2000,
      "generation_time_ms": 5000,
      "created_at": "2024-01-01T00:00:00",
      "started_at": "2024-01-01T00:00:00",
      "completed_at": "2024-01-01T00:00:00"
    }
  ],
  "wiki_structure": {...}
}
```

### List Jobs

```
GET /api/wiki/jobs?owner=owner&repo=repo&status=completed&limit=50&offset=0
```

**Response:**
```json
{
  "jobs": [...],
  "total": 100
}
```

### Job Management Operations

```
POST /api/wiki/jobs/{job_id}/pause
POST /api/wiki/jobs/{job_id}/resume
POST /api/wiki/jobs/{job_id}/retry
DELETE /api/wiki/jobs/{job_id}
```

### Retry Failed Page

```
POST /api/wiki/jobs/{job_id}/pages/{page_id}/retry
```

### HTTP Streaming Progress Updates

```
GET /api/wiki/jobs/{job_id}/progress/stream
Headers: X-API-Key: your-api-key
```

**Response:** Server-sent events stream with newline-delimited JSON

**Progress Update Format:**
```json
{
  "job_id": "uuid-string",
  "status": "generating_pages",
  "current_phase": 2,
  "progress_percent": 75.0,
  "message": "Generating: Database Design",
  "page_id": "page-uuid",
  "page_title": "Database Design",
  "total_pages": 8,
  "completed_pages": 6,
  "failed_pages": 0
}
```

**Heartbeat Message (every 30s):**
```json
{
  "heartbeat": true
}
```

## Data Models

### JobStatus Enum
- `pending`
- `preparing_embeddings`
- `generating_structure`
- `generating_pages`
- `paused`
- `completed`
- `failed`
- `cancelled`

### PageStatus Enum
- `pending`
- `in_progress`
- `completed`
- `failed`
- `permanent_failed`

### Wiki Page Model
```python
class WikiPage(BaseModel):
    id: str
    title: str
    content: str
    filePaths: List[str]
    importance: Literal['high', 'medium', 'low']
    relatedPages: List[str]
```

### Repository Info Model
```python
class RepoInfo(BaseModel):
    owner: str
    repo: str
    type: str
    token: Optional[str] = None
    localPath: Optional[str] = None
    repoUrl: Optional[str] = None
```

## Configuration

### Environment Variables

#### LLM Providers
- `GOOGLE_API_KEY`: Google Gemini API key
- `OPENAI_API_KEY`: OpenAI API key
- `OPENROUTER_API_KEY`: OpenRouter API key
- `DEEPSEEK_API_KEY`: DeepSeek API key
- `OLLAMA_HOST`: Ollama server URL (default: http://localhost:11434)
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_VERSION`: Azure OpenAI credentials (classic data-plane uses `api-version`)
- `AZURE_OPENAI_USE_V1`: Set to `true` to call the new Azure v1 endpoint via `{endpoint}/openai/v1` (skips `api-version`, uses standard OpenAI client); default is `false` to keep classic behavior.

#### Authentication
- `DEEPWIKI_AUTH_MODE`: Enable wiki authentication (true/false)
- `DEEPWIKI_AUTH_CODE`: Authentication code
- `DEEPWIKI_API_KEY_AUTH_ENABLED`: Enable API key authentication (true/false)
- `DEEPWIKI_BACKEND_API_KEYS`: Comma-separated API keys

#### Embedding
- `DEEPWIKI_EMBEDDER_TYPE`: Embedder provider (openai/google/ollama/openrouter)

#### Server
- `PORT`: API server port (default: 8001)
- `NODE_ENV`: Environment (development/production)

### Configuration Files

The API loads configuration from `api/config/` directory:
- `generator.json`: LLM provider configurations
- `embedder.json`: Embedding model configurations
- `repo.json`: Repository processing settings
- `lang.json`: Language support settings

## Error Handling

### Standard Error Response
```json
{
  "detail": "Error message"
}
```

### Common Error Codes
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Authentication failed
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### Error Recovery
- Automatic retry for transient failures
- Graceful degradation when RAG fails
- Timeout handling for LLM calls
- Fallback to simplified prompts on token limits

## Rate Limiting & Performance

### Background Processing
- Single worker to avoid rate limit conflicts
- Per-page checkpointing for fault tolerance
- Maximum 3 retries per failed page

### Caching
- Wiki cache for reprocessed repositories
- Embedding cache for faster retrieval
- Configurable cache expiration

### Performance Optimizations
- Async database operations
- Connection pooling
- Efficient file tree fetching
- Batched page processing

## Integration Patterns

### Frontend Integration
- Use `/models/config` to get available models
- Create jobs via `/api/wiki/jobs`
- Monitor progress via HTTP streaming
- Export wikis with `/export/wiki`

### Third-Party Systems
- Webhook support for job completion
- API key authentication for secure access
- CORS configuration for cross-origin requests
- Standard JSON responses for easy parsing

## Development

### Running the API
```bash
cd api
python main.py
```

### Database Schema
The API uses SQLite with WAL mode for concurrent access. Schema defined in `api/core/schema.sql`.

### Testing
- Unit tests in `tests/unit/`
- Integration tests in `tests/integration/`
- API tests in `tests/api/`

## Security Considerations

### API Key Requirements

The API uses API key authentication that can be provided in two ways:
- **Header**: `X-API-Key: your-api-key`
- **Query Parameter**: `?api_key=your-api-key`

#### Public Endpoints (No API Key Required)
- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint
- `GET /auth/status` - Authentication configuration status

#### Protected Endpoints (API Key Required)
- All `/api/*` endpoints
- `GET /models/config` - Model configuration
- `GET /lang/config` - Language configuration
- `POST /auth/validate` - Code validation
- `POST /chat/completions/stream` - Chat completions
- `POST /export/wiki` - Wiki export
- `GET /local_repo/structure` - Local repository structure


1. **Authentication**
   - API key validation for all protected endpoints
   - Optional wiki-level authentication
   - CORS policy configuration

2. **Repository Access**
   - Support for private repositories via tokens
   - File path sanitization
   - Safe repository traversal

3. **Input Validation**
   - Pydantic models for all request bodies
   - Parameter type checking
   - SQL injection prevention

4. **Rate Limiting**
   - Background worker queue
   - Per-page retry limits
   - Timeout handling

## Monitoring & Logging

### Logging Configuration
- Configurable log levels
- Structured logging format
- Error tracking and alerting

### Health Check
```
GET /health
```

Returns API health status and timestamp.

### Metrics
- Job completion rates
- Token usage tracking
- Error monitoring
- Performance metrics

## Troubleshooting

### Common Issues

1. **No Valid Embeddings**
   - Ensure repository has readable source files
   - Check embedder configuration
   - Verify API credentials

2. **Job Processing Failures**
   - Check job status via `/api/wiki/jobs/{job_id}`
   - Review server logs for error details
   - Verify LLM API credentials and quotas

3. **Streaming Connection Issues**
   - Ensure API key is provided
   - Check CORS settings
   - Verify streaming endpoint availability

### Debug Mode
Set `LOG_LEVEL=DEBUG` for detailed logging.

## Azure DevOps Integration

DeepWiki supports Azure DevOps repositories (both `dev.azure.com` and legacy `*.visualstudio.com` domains).

### URL Format
- **New format**: `https://dev.azure.com/{organization}/{project}/_git/{repository}`
- **Legacy format**: `https://{organization}.visualstudio.com/{project}/_git/{repository}`

### Authentication
1. Create a Personal Access Token (PAT) in Azure DevOps with "Code (read)" scope
2. Pass token when generating wiki or in the UI "Add access tokens" field
3. DeepWiki handles authentication internally via Basic auth

### Implementation Details
- Cloning: Uses PAT as basic auth credential
- File content retrieval: Uses Azure DevOps REST API v7.1
- Supports both organization-scoped and repository-scoped tokens

## Future Enhancements

1. **Additional Repository Providers**
   - Bitbucket integration
   - Custom repository connectors

2. **Advanced Features**
   - Wiki versioning
   - Collaborative editing
   - Multi-language support expansion

3. **Performance Improvements**
   - Distributed worker nodes
   - Embedding compression
   - Caching layer optimization

4. **Developer Experience**
   - SDK for popular languages
   - Postman collection
   - Interactive API documentation
