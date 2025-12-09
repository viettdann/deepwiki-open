"""
Singleton built-in embedder module.

Provides thread-safe built-in embedder using sentence-transformers models.
Supports automatic fallback on failure.
"""
import logging
import os
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional, Union

from adalflow.core.model_client import ModelClient
from adalflow.core.types import EmbedderOutput, Embedding

logger = logging.getLogger(__name__)


def _check_sentence_transformers_available() -> bool:
    """Check if sentence_transformers is available."""
    try:
        import sentence_transformers
        return True
    except ImportError:
        return False


class BuiltinEmbedder:
    """Singleton built-in embedder using sentence-transformers models."""

    _instance = None
    _model = None
    _lock = threading.Lock()
    _config = None
    _is_failed = False  # Track if model load/runtime failed
    _failure_reason = None

    def __init__(self):
        raise RuntimeError("Use BuiltinEmbedder.get_instance()")

    @classmethod
    def get_instance(cls) -> 'BuiltinEmbedder':
        """Get or create singleton instance (thread-safe)."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = object.__new__(cls)
                    cls._instance = instance
                    logger.info("Created built-in embedder singleton")
        return cls._instance

    @classmethod
    def is_failed(cls) -> bool:
        """Check if embedder has failed."""
        return cls._is_failed

    @classmethod
    def get_failure_reason(cls) -> Optional[str]:
        """Get failure reason if failed."""
        return cls._failure_reason

    @classmethod
    def mark_failed(cls, reason: str):
        """Mark embedder as failed."""
        cls._is_failed = True
        cls._failure_reason = reason
        logger.error(f"Built-in embedder marked as failed: {reason}")

    def preload(self) -> bool:
        """
        Download and load the model.
        Returns True on success, False on failure.
        """
        if self._is_failed:
            return False

        if self._model is not None:
            return True

        with self._lock:
            if self._model is not None:
                return True

            try:
                from sentence_transformers import SentenceTransformer
                from api.config import (
                    load_embedder_config,
                    EMBEDDING_DEVICE,
                    EMBEDDER_CACHE_DIR
                )

                # Set cache directory
                cache_dir = self._get_cache_dir(EMBEDDER_CACHE_DIR)
                os.environ['HF_HOME'] = str(cache_dir)
                os.environ['TRANSFORMERS_CACHE'] = str(cache_dir)

                # Load config
                embedder_config = load_embedder_config()
                builtin_config = embedder_config.get("embedder_builtin", {})
                model_name = builtin_config.get("model_kwargs", {}).get(
                    "model", "sentence-transformers/all-mpnet-base-v2"
                )

                # Determine device
                device = self._resolve_device(EMBEDDING_DEVICE)

                # Prepare model initialization kwargs
                model_kwargs = {
                    'cache_folder': str(cache_dir)
                }

                # Only add device parameter if it's not None (let SentenceTransformer handle auto)
                if device is not None:
                    model_kwargs['device'] = device
                    device_str = f" on {device}"
                else:
                    device_str = " with auto device detection"

                logger.info(f"Loading built-in embedder model: {model_name}{device_str}")
                self._model = SentenceTransformer(
                    model_name,
                    **model_kwargs
                )
                self._config = builtin_config
                logger.info(f"Successfully loaded built-in embedder: {model_name}")
                return True

            except Exception as e:
                self.mark_failed(str(e))
                logger.error(f"Failed to load built-in embedder: {e}")
                return False

    def _resolve_device(self, device_config: str) -> str:
        """Resolve device string to actual device."""
        # Handle explicit device settings
        if device_config:
            if device_config.lower() == 'auto':
                # Let SentenceTransformer handle auto-detection
                return None
            else:
                # Use the explicitly specified device (cpu, cuda, mps, cuda:0, etc.)
                return device_config.lower()

        # Default to auto-detection when not specified
        return None

    @staticmethod
    def _get_cache_dir(custom_dir: str = None) -> Path:
        """Get cache directory for model downloads."""
        if custom_dir:
            cache_dir = Path(custom_dir)
        else:
            api_dir = Path(__file__).parent
            cache_dir = api_dir / ".cache" / "huggingface"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def is_loaded(self) -> bool:
        """Check if model is loaded."""
        return self._model is not None and not self._is_failed

    def encode(
        self,
        texts: Union[str, List[str]],
        batch_size: int = 32
    ) -> List[List[float]]:
        """
        Encode texts to embeddings.

        Args:
            texts: Single text or list of texts
            batch_size: Batch size for encoding

        Returns:
            List of embedding vectors
        """
        if self._is_failed:
            raise RuntimeError(f"Embedder failed: {self._failure_reason}")

        if not self.is_loaded():
            success = self.preload()
            if not success:
                raise RuntimeError(f"Failed to load model: {self._failure_reason}")

        try:
            if isinstance(texts, str):
                texts = [texts]

            embeddings = self._model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=False,
                convert_to_numpy=True
            )

            return embeddings.tolist()

        except Exception as e:
            self.mark_failed(f"Runtime encoding error: {e}")
            raise


class BuiltinEmbedderClient(ModelClient):
    """
    AdalFlow ModelClient implementation for built-in embeddings (sentence-transformers).
    """

    def __init__(self):
        super().__init__()
        self._embedder = BuiltinEmbedder.get_instance()

    def convert_inputs_to_api_kwargs(
        self,
        input: Any,
        model_kwargs: Dict[str, Any] = {},
        model_type: str = "embedder"
    ) -> Dict[str, Any]:
        """Convert inputs to API kwargs."""
        if isinstance(input, str):
            input = [input]
        return {
            "input": input,
            "model": model_kwargs.get("model", "sentence-transformers/all-mpnet-base-v2"),
            "batch_size": model_kwargs.get("batch_size", 32)
        }

    def call(self, api_kwargs: Dict[str, Any], **kwargs) -> Any:
        """
        Synchronous embedding call.

        Args:
            api_kwargs: API arguments containing input texts
            **kwargs: Additional arguments (e.g., model_type) - ignored but accepted for compatibility
        """
        texts = api_kwargs.get("input", [])
        batch_size = api_kwargs.get("batch_size", 32)

        embeddings = self._embedder.encode(texts, batch_size=batch_size)

        return {
            "data": [
                {"embedding": emb, "index": i}
                for i, emb in enumerate(embeddings)
            ]
        }

    async def acall(self, api_kwargs: Dict[str, Any], **kwargs) -> Any:
        """
        Async embedding call (runs sync in executor).

        Args:
            api_kwargs: API arguments containing input texts
            **kwargs: Additional arguments (e.g., model_type) - ignored but accepted for compatibility
        """
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: self.call(api_kwargs, **kwargs))

    def parse_embedding_response(self, response: Any) -> EmbedderOutput:
        """Parse response to EmbedderOutput."""
        embeddings = []
        for item in response.get("data", []):
            embeddings.append(
                Embedding(embedding=item["embedding"], index=item["index"])
            )
        return EmbedderOutput(data=embeddings)

    @classmethod
    def is_available(cls) -> bool:
        """Check if embedder is available (not failed)."""
        return not BuiltinEmbedder.is_failed()

    @classmethod
    def preload(cls) -> bool:
        """Preload the model."""
        return BuiltinEmbedder.get_instance().preload()
