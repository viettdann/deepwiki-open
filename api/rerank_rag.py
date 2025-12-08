"""
RerankRAG: Enhanced RAG with re-ranking and deduplication.

Extends the base RAG class to add cross-encoder re-ranking and
cosine similarity-based deduplication.
"""
import logging
from typing import List, Tuple

from api.rag import RAG
from api.reranker import Reranker
from api.config import load_reranker_config

logger = logging.getLogger(__name__)


class RerankRAG(RAG):
    """RAG with re-ranking and deduplication."""

    def __init__(self, provider="google", model=None, use_s3=False):
        """
        Initialize RerankRAG with enhanced retrieval.

        Args:
            provider: Model provider (google, openai, openrouter, ollama)
            model: Model name
            use_s3: Whether to use S3 storage
        """
        super().__init__(provider, model, use_s3)
        self.reranker = Reranker.get_instance()
        self._reranker_config = load_reranker_config()
        logger.info("RerankRAG initialized with re-ranking enabled")

    def call(self, query: str, language: str = "en") -> Tuple[List]:
        """
        Process a query using RAG with re-ranking and deduplication.

        Args:
            query: The user's query
            language: Language code (default: "en")

        Returns:
            Tuple of (RAGAnswer, retrieved_documents)
        """
        # 1. Get FAISS results from parent
        retrieved_documents = super().call(query, language)

        # 2. Check if error response (when error, first element is RAGAnswer)
        if not hasattr(retrieved_documents[0], 'documents'):
            # This is an error response, return as is
            return retrieved_documents

        # 3. Extract documents
        original_docs = retrieved_documents[0].documents
        docs = original_docs

        try:
            # 4. Deduplicate (before re-ranking for efficiency)
            if self._reranker_config.get("enable_deduplication", True):
                docs = self.reranker.deduplicate(
                    docs,
                    similarity_threshold=self._reranker_config.get("similarity_threshold", 0.95)
                )
                logger.debug(f"Dedup: {len(original_docs)} → {len(docs)} docs")

            # 5. Re-rank with cross-encoder
            if self._reranker_config.get("enable_reranking", True):
                docs = self.reranker.rerank(
                    query,
                    docs,
                    top_k=self._reranker_config.get("top_k_after_rerank", 10),
                    relevance_threshold=self._reranker_config.get("relevance_threshold", 0.3)
                )
                logger.debug(f"Rerank: returned {len(docs)} docs")

        except Exception as e:
            # Graceful fallback: return original FAISS results
            logger.warning(f"Reranking failed, using FAISS results: {e}")
            docs = original_docs

        # 6. Update retrieved_documents with processed docs
        retrieved_documents[0].documents = docs
        return retrieved_documents
