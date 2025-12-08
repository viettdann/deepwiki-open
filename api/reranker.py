"""
Singleton reranker module for RAG retrieval enhancement.

Provides re-ranking using cross-encoder models and deduplication using cosine similarity.
"""
import logging
import os
import threading
import numpy as np
from pathlib import Path
from typing import List
from adalflow.core.types import Document

logger = logging.getLogger(__name__)


class Reranker:
    """Singleton reranker for cross-encoder scoring and deduplication."""

    _instance = None
    _model = None
    _lock = threading.Lock()
    _config = None

    def __init__(self):
        """Private constructor - use get_instance() instead."""
        raise RuntimeError("Use Reranker.get_instance() to get the singleton instance")

    @classmethod
    def get_instance(cls) -> 'Reranker':
        """Get or create the singleton Reranker instance (thread-safe)."""
        if cls._instance is None:
            with cls._lock:
                # Double-check locking pattern
                if cls._instance is None:
                    # Bypass __init__ to create instance
                    instance = object.__new__(cls)
                    cls._instance = instance
                    logger.info("Created Reranker singleton instance")
        return cls._instance

    def preload(self) -> None:
        """
        Download and load the cross-encoder model.

        This is async-safe and should be called during app startup.
        """
        if self._model is not None:
            logger.info("Reranker model already loaded")
            return

        with self._lock:
            # Double-check locking
            if self._model is not None:
                return

            try:
                from sentence_transformers import CrossEncoder
                from api.config import load_reranker_config, RERANKER_CACHE_DIR

                # Set cache directory for HuggingFace models
                cache_dir = self._get_cache_dir(RERANKER_CACHE_DIR)
                os.environ['HF_HOME'] = str(cache_dir)
                os.environ['TRANSFORMERS_CACHE'] = str(cache_dir)
                logger.info(f"Using cache directory: {cache_dir}")

                self._config = load_reranker_config()
                model_name = self._config.get("rerank_model", "cross-encoder/ms-marco-MiniLM-L-6-v2")

                logger.info(f"Loading reranker model: {model_name}")
                self._model = CrossEncoder(model_name, cache_folder=str(cache_dir))
                logger.info(f"Successfully loaded reranker model: {model_name}")

            except Exception as e:
                logger.error(f"Failed to load reranker model: {e}")
                raise

    @staticmethod
    def _get_cache_dir(custom_dir: str = None) -> Path:
        """
        Get the cache directory for model downloads.

        Args:
            custom_dir: Custom cache directory path from env var

        Returns:
            Path to cache directory
        """
        if custom_dir:
            cache_dir = Path(custom_dir)
        else:
            # Default: api/.cache/huggingface (inside project)
            api_dir = Path(__file__).parent
            cache_dir = api_dir / ".cache" / "huggingface"

        # Create directory if it doesn't exist
        cache_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Cache directory: {cache_dir}")

        return cache_dir

    def is_loaded(self) -> bool:
        """Check if the reranker model is loaded and ready."""
        return self._model is not None

    def rerank(
        self,
        query: str,
        documents: List[Document],
        top_k: int = 10,
        relevance_threshold: float = 0.3
    ) -> List[Document]:
        """
        Re-rank documents using cross-encoder scoring.

        Args:
            query: The search query
            documents: List of documents to re-rank
            top_k: Number of top documents to return
            relevance_threshold: Minimum relevance score (0-1)

        Returns:
            List of re-ranked documents, filtered and sorted by relevance
        """
        if not self.is_loaded():
            logger.warning("Reranker model not loaded, skipping re-ranking")
            return documents

        if not documents:
            return documents

        try:
            # Prepare pairs for cross-encoder
            pairs = [(query, doc.text) for doc in documents]

            # Get batch size from config
            batch_size = self._config.get("batch_size_rerank", 32)

            # Predict relevance scores
            scores = self._model.predict(pairs, batch_size=batch_size)

            # Combine documents with scores
            scored_docs = list(zip(documents, scores))

            # Filter by relevance threshold
            filtered = [(doc, float(score)) for doc, score in scored_docs if score >= relevance_threshold]

            # Sort by score (descending)
            sorted_docs = sorted(filtered, key=lambda x: x[1], reverse=True)

            # Take top k and update document scores
            result = []
            for doc, score in sorted_docs[:top_k]:
                # Update the document's score attribute
                doc.score = score
                result.append(doc)

            logger.debug(f"Re-ranked {len(documents)} docs → {len(result)} docs (threshold={relevance_threshold}, top_k={top_k})")

            return result

        except Exception as e:
            logger.error(f"Re-ranking failed: {e}")
            raise

    def deduplicate(
        self,
        documents: List[Document],
        similarity_threshold: float = 0.95
    ) -> List[Document]:
        """
        Remove duplicate documents using cosine similarity on embeddings.

        Args:
            documents: List of documents to deduplicate
            similarity_threshold: Cosine similarity threshold (0-1)

        Returns:
            List of unique documents (keeps first occurrence)
        """
        if not documents:
            return documents

        try:
            result = []

            for doc in documents:
                # Check if this document is similar to any already in result
                is_duplicate = False

                if not hasattr(doc, 'vector') or doc.vector is None:
                    # If no vector, can't deduplicate - keep it
                    result.append(doc)
                    continue

                # Convert to numpy array for cosine similarity
                doc_vector = np.array(doc.vector)

                for existing in result:
                    if not hasattr(existing, 'vector') or existing.vector is None:
                        continue

                    existing_vector = np.array(existing.vector)

                    # Calculate cosine similarity
                    similarity = self._cosine_similarity(doc_vector, existing_vector)

                    if similarity > similarity_threshold:
                        is_duplicate = True
                        logger.debug(f"Found duplicate document (similarity={similarity:.3f})")
                        break

                if not is_duplicate:
                    result.append(doc)

            logger.debug(f"Deduplicated {len(documents)} docs → {len(result)} docs (threshold={similarity_threshold})")

            return result

        except Exception as e:
            logger.error(f"Deduplication failed: {e}")
            raise

    @staticmethod
    def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two vectors.

        Args:
            vec1: First vector
            vec2: Second vector

        Returns:
            Cosine similarity score (0-1)
        """
        # Normalize vectors
        vec1_norm = vec1 / (np.linalg.norm(vec1) + 1e-10)
        vec2_norm = vec2 / (np.linalg.norm(vec2) + 1e-10)

        # Compute dot product
        return float(np.dot(vec1_norm, vec2_norm))
