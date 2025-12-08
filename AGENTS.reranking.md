# AGENTS.reranking.md
Enhanced RAG retrieval with re-ranking and deduplication.

## Overview

DeepWiki's Enhanced RAG feature improves search relevance through:
- **Cross-encoder re-ranking**: Re-scores FAISS results using semantic similarity
- **Deduplication**: Removes duplicate documents using cosine similarity
- **Graceful degradation**: Falls back to standard FAISS results on error

**Performance Impact:**
- Model download: ~460MB (first startup, 2-5 min)
- Query overhead: 250-450ms per request
- Model loading: 3-5 sec at startup

## Activation

### Environment Variables

```bash
# Enable re-ranking (default: false)
DEEPWIKI_ENABLE_RERANKING=true

# Custom cache directory (optional)
# Default: api/.cache/huggingface
DEEPWIKI_RERANKER_CACHE_DIR=/path/to/cache
```

### Installation

```bash
cd api
source .venv/bin/activate
uv pip install sentence-transformers
```

## Architecture

### Class Hierarchy

```
RAG (api/rag.py)
  └─ RerankRAG (api/rerank_rag.py)
       └─ uses Reranker (api/reranker.py) singleton
```

### Conditional Import Pattern

When `DEEPWIKI_ENABLE_RERANKING=true`:
- `api/simple_chat.py` imports `RerankRAG as RAG`
- `api/background/worker.py` imports `RerankRAG as RAG`

When disabled or unset:
- Both files import standard `RAG`

### Singleton Pattern

`Reranker` class uses thread-safe singleton:
- Single model instance across all requests
- Preloaded at app startup (async-safe)
- Shared by all RAG instances

## Processing Pipeline

**Standard RAG:**
```
Query → FAISS retrieval → 25 docs → Return
```

**Enhanced RAG (with re-ranking):**
```
Query → FAISS retrieval → 25 docs
      → Deduplicate (0.95 threshold) → ~20 docs
      → Re-rank with cross-encoder → Top 10 docs
      → Return
```

### Deduplication Algorithm

```python
# Cosine similarity between document embeddings
for doc in documents:
    for existing in result:
        if cosine_similarity(doc.vector, existing.vector) > 0.95:
            skip doc  # duplicate
    result.append(doc)
```

### Re-ranking Algorithm

```python
# Cross-encoder scoring
pairs = [(query, doc.text) for doc in documents]
scores = cross_encoder.predict(pairs, batch_size=32)
filtered = [doc for doc, score in zip(docs, scores) if score >= 0.3]
sorted_docs = sorted(filtered, key=score, reverse=True)[:10]
```

## Configuration

Edit `api/config/reranker.json`:

```json
{
  "enable_reranking": true,
  "enable_deduplication": true,
  "rerank_model": "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
  "similarity_threshold": 0.95,
  "top_k_initial": 25,
  "top_k_after_rerank": 10,
  "relevance_threshold": 0.3,
  "batch_size_rerank": 32
}
```

### Available Models

| Model | Size | Speed | Description |
|-------|------|-------|-------------|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` | 22M | Fast | Compact, English-only |
| `cross-encoder/ms-marco-TinyBERT-L-2-v2` | 4M | Very fast | Ultra-light |
| `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | 118M | Slower | Multilingual (default) |

### Key Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enable_reranking` | `true` | Toggle re-ranking on/off |
| `enable_deduplication` | `true` | Toggle deduplication on/off |
| `similarity_threshold` | `0.95` | Cosine similarity for dedup (0-1) |
| `top_k_after_rerank` | `10` | Final document count |
| `relevance_threshold` | `0.3` | Minimum cross-encoder score (0-1) |
| `batch_size_rerank` | `32` | Batch size for model inference |

## Implementation Details

### File Structure

**Created:**
- `api/reranker.py`: Singleton reranker with cross-encoder + deduplication
- `api/rerank_rag.py`: `RerankRAG` class extending `RAG`

**Modified:**
- `api/config.py`: Added `ENABLE_RERANKING`, `RERANKER_CACHE_DIR`, `load_reranker_config()`
- `api/simple_chat.py`: Conditional RAG import
- `api/background/worker.py`: Conditional RAG import
- `api/api.py`: Model preloading in startup event

### Model Caching

**Default location:** `api/.cache/huggingface/`

**Cache structure:**
```
api/
└─ .cache/
   └─ huggingface/
      └─ hub/
         └─ models--cross-encoder--mmarco-mMiniLMv2-L12-H384-v1/
```

**Custom location:**
```bash
export DEEPWIKI_RERANKER_CACHE_DIR=/data/models/cache
```

### Startup Sequence

```python
# api/api.py startup event
if ENABLE_RERANKING:
    logger.info("Reranking enabled - preloading reranker model...")
    await loop.run_in_executor(None, Reranker.get_instance().preload)
    # Downloads model (~460MB) if not cached
    # Sets HF_HOME and TRANSFORMERS_CACHE env vars
    logger.info("Reranker model preloaded successfully")
```

## Monitoring & Debugging

### Startup Logs

```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Expected logs
INFO: Reranking enabled - preloading reranker model...
INFO: Using cache directory: /path/to/api/.cache/huggingface
INFO: Loading reranker model: cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
INFO: Successfully loaded reranker model: cross-encoder/mmarco-mMiniLMv2-L12-H384-v1
INFO: Reranker model preloaded successfully
```

### Query Logs (DEBUG level)

```bash
DEBUG: Dedup: 25 → 21 docs
DEBUG: Rerank: returned 10 docs
```

### Error Handling

**Graceful fallback on error:**
```python
try:
    # Deduplication + Re-ranking
except Exception as e:
    logger.warning(f"Reranking failed, using FAISS results: {e}")
    # Returns original 25 FAISS documents
```

**Common errors:**
- Model download failure → Check network/disk space
- Missing `sentence-transformers` → Run `uv pip install sentence-transformers`
- Cache permission issues → Check `DEEPWIKI_RERANKER_CACHE_DIR` permissions

## Testing

### Manual Testing

```bash
# 1. Enable re-ranking
export DEEPWIKI_ENABLE_RERANKING=true
export LOG_LEVEL=DEBUG

# 2. Start server
cd api && source .venv/bin/activate
uv run python -m api.main

# 3. Watch startup logs for model loading
# 4. Make chat request via UI or API
# 5. Check DEBUG logs for dedup/rerank metrics
```

### Compare Results

**With re-ranking disabled:**
```bash
export DEEPWIKI_ENABLE_RERANKING=false
# Query returns 25 FAISS results
```

**With re-ranking enabled:**
```bash
export DEEPWIKI_ENABLE_RERANKING=true
# Query returns 10 re-ranked results
```

## Rollback

### Disable Feature

```bash
# Method 1: Set to false
export DEEPWIKI_ENABLE_RERANKING=false

# Method 2: Remove env var
unset DEEPWIKI_ENABLE_RERANKING

# Restart server - uses standard RAG
```

### Uninstall

```bash
cd api
uv pip uninstall sentence-transformers

# Remove cache (optional)
rm -rf api/.cache/huggingface
```

## Performance Tuning

### Reduce Overhead

```json
{
  "rerank_model": "cross-encoder/ms-marco-TinyBERT-L-2-v2",
  "batch_size_rerank": 64,
  "top_k_after_rerank": 5
}
```

### Improve Accuracy

```json
{
  "rerank_model": "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
  "relevance_threshold": 0.5,
  "top_k_after_rerank": 15
}
```

### Disable Deduplication Only

```json
{
  "enable_deduplication": false,
  "enable_reranking": true
}
```

## Reference

**Related Documentation:**
- Main guide: `AGENTS.md`
- API details: `AGENTS.api.md`
- RAG implementation: `api/rag.py`
- Configuration format: `api/config/reranker.json`

**External Resources:**
- Sentence Transformers: https://www.sbert.net/
- Cross-Encoders: https://www.sbert.net/examples/applications/cross-encoder/README.html
- HuggingFace Models: https://huggingface.co/cross-encoder
