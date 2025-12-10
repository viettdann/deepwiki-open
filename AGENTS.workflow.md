# DeepWiki Workflow Documentation

### Overview

This document provides a comprehensive overview of the DeepWiki project's workflow architecture, processing pipelines, and data flow patterns. The system is designed as a scalable AI-powered wiki generator that processes GitHub/GitLab/Bitbucket/Azure DevOps repositories and generates comprehensive documentation using LLMs.

## System Architecture

### Core Components

1. **API Layer** (`api/`)
   - FastAPI-based REST API endpoints
   - HTTP streaming (Server-Sent Events) for real-time progress updates
   - Authentication and rate limiting

2. **Data Pipeline** (`api/data_pipeline.py`)
   - Repository cloning and file extraction
   - Document parsing and preprocessing
   - Embedding generation and vector storage

3. **Background Job System** (`api/background/`)
   - Asynchronous job processing
   - Page-level checkpointing and retry mechanisms
   - Progress tracking via HTTP streaming (SSE)

4. **RAG System** (`api/rag.py`)
   - Retrieval-Augmented Generation implementation
   - FAISS vector search
   - Multi-provider LLM integration

5. **Configuration Management** (`api/config.py`)
   - Multi-provider LLM configuration
   - Embedder selection and tuning
   - Repository filtering rules

## Repository Processing Pipeline

### Phase 1: Repository Cloning & Setup

1. **Repository URL Parsing**
   - Supports GitHub, GitLab, Bitbucket, and Azure DevOps
   - Extracts owner/repo information from URLs
   - Handles both public and private repositories

2. **Authentication Handling**
   - GitHub: Personal Access Token (PAT) via `token {token}`
   - GitLab: OAuth2 token via `oauth2:{token}`
   - Bitbucket: x-token-auth via `x-token-auth:{token}`
   - Azure DevOps: PAT via Basic auth

3. **Repository Download**
   ```python
   download_repo(repo_url, local_path, repo_type, access_token)
   ```
   - Uses `git clone --depth=1 --single-branch` for efficiency
   - Caches repositories locally to avoid redundant downloads
   - Handles token sanitization in error logs

### Phase 2: File Analysis & Extraction

1. **File Discovery**
   - Recursive directory traversal with configurable filters
   - Supports inclusion and exclusion modes
   - Default exclusions: node_modules, .git, __pycache__, etc.

2. **File Type Processing**
   - **Code files**: .py, .js, .ts, .java, .cpp, .go, .rs, etc.
   - **Documentation files**: .md, .txt, .rst, .json, .yaml, .yml

3. **Document Creation**
   ```python
   read_all_documents(path, embedder_type, excluded_dirs, excluded_files)
   ```
   - Creates Document objects with metadata
   - Tracks file path, type, implementation status
   - Calculates token count for embedding optimization
   - Filters files exceeding token limits (8192 tokens)

### Phase 3: Embedding Generation

1. **Embedder Selection**
   - **OpenAI**: text-embedding-3-small (1536 dimensions)
   - **Google**: text-embedding-004 (768 dimensions)
   - **Azure OpenAI**: text-embedding-3-large (deployment-based, honors `AZURE_OPENAI_VERSION`)
   - **Ollama**: nomic-embed-text (384-8192 dimensions)
   - **OpenRouter**: Mixed density embeddings

2. **Text Splitting**
   - **Syntax-Aware Chunking** (New - optional via feature flag)
     - Respects code boundaries for C#, TypeScript, and JavaScript
     - Extracts semantic units: namespaces, classes, methods, functions, interfaces
     - Preserves docstrings/comments with their owning symbols
     - Attaches import/using statements to first symbol (avoids duplication)
     - Metadata-rich chunks: `symbol_name`, `signature`, `token_count`, `parent_symbol`, `language`
     - Thread-safe parser pool (tree-sitter)
     - Memory guard: skips parsing for files > 500KB
     - Feature flag: `USE_SYNTAX_AWARE_CHUNKING=true` (default: `false`; shipped `.env.example` sets it to `true`)
     - Fallback to standard TextSplitter for unsupported languages or parse failures
   - **Standard TextSplitter** (AdalFlow component)
     - Word/sentence-based splitting
     - Configurable chunk sizes and overlaps
     - Maintains context continuity across chunks

3. **Batch Processing**
   - OpenAI/Google: Batch processing (default 500 docs/batch)
   - Ollama: Single-document processing
   - Parallel processing for improved throughput

### Phase 4: Vector Storage

1. **FAISS Index Creation**
   ```python
   FAISSRetriever(embedder=embedder, documents=transformed_docs)
   ```
   - Creates HNSW (Hierarchical Navigable Small World) index
   - Supports cosine similarity search
   - Persistent storage for reuse

2. **Local Database**
   - SQLite with WAL mode for concurrent access
   - Stores transformed documents with embeddings
   - Automatic cleanup and maintenance

## LLM Integration Patterns

### Multi-Provider Architecture

The system supports multiple LLM providers through a unified interface:

1. **Google (Default)**
   - Uses Google Generative AI SDK
   - Models: gemini-pro, gemini-1.5-pro
   - Streaming support with async processing

2. **OpenAI**
   - Custom OpenAI client wrapper
   - Models: gpt-4-turbo, gpt-3.5-turbo
   - Token counting and response parsing

3. **OpenRouter**
   - Access to open-source models
   - Custom endpoint configuration
   - Provider-specific routing

4. **Azure OpenAI**
   - Uses `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_VERSION`
   - Supports classic `api-version` flow and new v1 base path via `AZURE_OPENAI_USE_V1=true`
   - Deployments map to models (e.g., `gpt-4o-mini`, `gpt-5-mini`)

5. **Ollama**
   - Local model deployment
   - Models: llama3, mistral, codellama
   - Direct HTTP API integration

6. **DeepSeek**
   - Specialized code analysis models
   - Cost-effective alternative
   - Chinese language support

### Prompt Engineering

1. **System Prompt Template**
   ```python
   RAG_SYSTEM_PROMPT = """
   You are a senior software architect (10+ years experience) analyzing a specific code repository.
   Answer user questions with clear, complete, and actionable analysis, grounded strictly in the repository's code and docs.
   ```
   - Emphasizes technical accuracy
   - Specifies language detection and response
   - Defines quality standards for production-ready insights

2. **Page Generation Prompts**
   - Multi-dimensional analysis structure
   - Source citation requirements
   - Mermaid diagram integration when beneficial
   - Language-specific output generation

### Response Processing

1. **Output Parsing**
   - Pydantic models for structured output
   - Markdown validation
   - Citation extraction and formatting

2. **Stream Handling**
   - Async chunk processing
   - Content accumulation
   - Error recovery mechanisms

## Background Job Processing

### Job Lifecycle

1. **Job Creation**
   ```python
   class CreateJobRequest(BaseModel):
       repo_url: str
       repo_type: str
       provider: str
       model: Optional[str]
       language: str
       is_comprehensive: bool
       excluded_dirs: Optional[List[str]]
       included_files: Optional[List[str]]
   ```

2. **Job Phases**
   - **Phase 0**: Prepare Embeddings (0-10%)
   - **Phase 1**: Generate Wiki Structure (10-50%)
   - **Phase 2**: Generate Page Content (50-100%)

3. **Status Transitions**
   - PENDING → PREPARING_EMBEDDINGS → GENERATING_STRUCTURE → GENERATING_PAGES → COMPLETED
   - Support for PAUSED, CANCELLED, and FAILED states
   - Per-page retry mechanism (max 3 retries)

### Page-Level Processing

1. **Wiki Structure Generation**
   - LLM analyzes repository file tree and README
   - Generates XML-based structure with sections and pages
   - Identifies relevant files for each page

2. **Content Generation**
   - Each page processed independently
   - RAG retrieval for context-aware generation
   - Progress tracking with token counting

3. **Checkpointing**
   - Database records generation state
   - Recovery from interruptions
   - Progress persistence across restarts

### Error Handling & Retries

1. **Retry Strategy**
   - Page-level retries with exponential backoff
   - Maximum 3 retries per page
   - Permanent failure after exhausting retries

2. **Error Categories**
   - Network timeouts (5-10 minute limits)
   - LLM generation failures
   - Token count exceeded
   - XML parsing errors

3. **Recovery Mechanisms**
   - Automatic stuck page reset
   - Graceful degradation on partial failures
   - Detailed error logging for debugging

## Performance Optimization Strategies

### 1. Caching and Reuse

- **Repository Caching**: Local storage to avoid redundant clones
- **Embedding Cache**: Persistent FAISS indices and document storage
  - **Important**: After enabling `USE_SYNTAX_AWARE_CHUNKING`, regenerate embeddings for existing repositories to use syntax-aware chunks
- **Wiki Cache**: JSON-based output caching for compatibility

### 2. Batch Processing

- **Embedding Batches**: Process 500 documents at a time for OpenAI/Google
- **Parallel Operations**: Async I/O for non-blocking processing
- **Streaming Responses**: Real-time content generation

### 3. Memory Management

- **Token Limit Enforcement**: 8192 token maximum for embeddings
- **Document Filtering**: Skip oversized files with warnings
- **Connection Pooling**: Reuse HTTP connections for API calls

### 4. Database Optimization

- **WAL Mode**: Write-Ahead Logging for concurrent access
- **Indexing**: Optimized queries on status, owner/repo, timestamps
- **Connection Management**: Pool database connections

## Multi-Provider Support Patterns

### Configuration-driven Architecture

```python
# Provider mapping
CLIENT_CLASSES = {
    "GoogleGenAIClient": GoogleGenAIClient,
    "OpenAIClient": OpenAIClient,
    "OpenRouterClient": OpenRouterClient,
    "OllamaClient": OllamaClient,
    "DeepSeekClient": DeepSeekClient
}
```

### Unified Interface

1. **Model Client Abstraction**
   - Common interface across providers
   - Provider-specific parameter mapping
   - Streaming response handling

2. **Embedder Selection**
   - Environment variable configuration
   - Fallback mechanisms
   - Validation of model availability

### Configuration Hierarchy

1. **Environment Variables**
   - API keys and endpoints
   - Provider selection
   - Authentication settings

2. **JSON Configuration Files**
   - Model parameters and settings
   - Embedder configurations
   - Repository filtering rules

3. **Runtime Selection**
   - Dynamic provider switching
   - Model-specific tuning
   - Load balancing considerations

## Data Flow Patterns

### Repository Processing Flow

```
Repository URL → Authentication → Clone → File Discovery →
Document Creation → Text Splitting → Embedding Generation →
Vector Storage → Wiki Structure → Page Generation → Output
```

### RAG Query Processing

```
User Query → Query Embedding → Vector Search →
Document Retrieval → Context Assembly → LLM Generation →
Structured Response → User Delivery
```

### Job Processing Flow

```
Job Creation → Phase 0 (Embeddings) → Phase 1 (Structure) →
Phase 2 (Pages) → Completion → Cache Storage
```

## Error Handling Patterns

### 1. Graceful Degradation

- Continue processing when individual files fail
- Provide meaningful error messages
- Maintain partial results on failures

### 2. Timeout Management

- Repository clone: 5-minute timeout
- LLM generation: 5-10 minute timeout per page
- Total job timeout: Configurable based on repository size

### 3. Recovery Mechanisms

- Automatic retry with exponential backoff
- State persistence across restarts
- Detailed error logging for debugging

## Monitoring and Observability

### 1. Progress Tracking

- HTTP streaming (SSE) updates
- Percentage-based progress indicators
- Page-level status tracking

### 2. Metrics Collection

- Token usage tracking
- Generation time per page
- Error rates and retry counts
- Repository processing time

### 3. Logging

- Structured logging with correlation IDs
- Error context preservation
- Performance benchmarking

## Deployment Considerations

### 1. Scalability

- Single worker to avoid rate limiting
- Asynchronous processing for throughput
- Database connection pooling

### 2. Security

- API key management
- Token sanitization in logs
- Input validation and sanitization

### 3. Reliability

- Automatic recovery mechanisms
- Checkpointing and state persistence
- Graceful shutdown handling

## Integration Points

### 1. Repository Providers

- GitHub: REST API v3
- GitLab: API v4
- Bitbucket: API v2.0
- Azure DevOps: REST API

### 2. LLM Providers

- Google Generative AI
- OpenAI API
- OpenRouter API
- Ollama (local)
- DeepSeek API

### 3. Storage Systems

- SQLite (primary)
- Local filesystem (caching)
- FAISS (vector search)
