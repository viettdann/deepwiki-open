import adalflow as adal
import logging
from typing import Optional

from api.config import configs, get_embedder_type, EMBEDDER_FALLBACK_CHAIN

logger = logging.getLogger(__name__)

# Track fallback state
_active_embedder_type: Optional[str] = None
_fallback_attempted = False


def _check_embedder_available(embedder_type: str) -> bool:
    """Check if an embedder type is available."""
    from api.config import OPENAI_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY

    if embedder_type == 'builtin':
        from api.builtin_embedder_client import BuiltinEmbedderClient
        return BuiltinEmbedderClient.is_available()
    elif embedder_type == 'openai':
        return bool(OPENAI_API_KEY)
    elif embedder_type == 'google':
        return bool(GOOGLE_API_KEY)
    elif embedder_type == 'openrouter':
        return bool(OPENROUTER_API_KEY)
    elif embedder_type == 'ollama':
        return True  # Always potentially available
    return False


def _get_fallback_embedder_type(failed_type: str) -> Optional[str]:
    """Get next available embedder type in fallback chain."""
    try:
        current_idx = EMBEDDER_FALLBACK_CHAIN.index(failed_type)
        for next_type in EMBEDDER_FALLBACK_CHAIN[current_idx + 1:]:
            if _check_embedder_available(next_type):
                logger.warning(f"Falling back from {failed_type} to {next_type}")
                return next_type
    except ValueError:
        pass

    # If not in chain, try from beginning
    for embedder_type in EMBEDDER_FALLBACK_CHAIN:
        if embedder_type != failed_type and _check_embedder_available(embedder_type):
            logger.warning(f"Falling back from {failed_type} to {embedder_type}")
            return embedder_type

    return None


def _create_embedder(embedder_type: str) -> adal.Embedder:
    """Create embedder instance for given type."""

    # Map embedder type to config key
    config_key_map = {
        'builtin': 'embedder_builtin',
        'openai': 'embedder',
        'google': 'embedder_google',
        'ollama': 'embedder_ollama',
        'openrouter': 'embedder_openrouter'
    }

    config_key = config_key_map.get(embedder_type, 'embedder')
    embedder_config = configs.get(config_key)

    if not embedder_config:
        raise ValueError(f"No configuration found for embedder type: {embedder_type}")

    # Get model client class
    model_client_class = embedder_config.get("model_client")
    if not model_client_class:
        raise ValueError(f"No model_client configured for {embedder_type}")

    # Initialize client
    if "initialize_kwargs" in embedder_config:
        model_client = model_client_class(**embedder_config["initialize_kwargs"])
    else:
        model_client = model_client_class()

    # Create embedder
    embedder = adal.Embedder(
        model_client=model_client,
        model_kwargs=embedder_config.get("model_kwargs", {})
    )

    # Set batch_size if available
    if "batch_size" in embedder_config:
        embedder.batch_size = embedder_config["batch_size"]

    return embedder


def get_embedder(
    is_local_ollama: bool = False,
    use_google_embedder: bool = False,
    embedder_type: str = None,
    allow_fallback: bool = True
) -> adal.Embedder:
    """
    Get embedder based on configuration with automatic fallback.

    Args:
        is_local_ollama: Legacy parameter for Ollama embedder
        use_google_embedder: Legacy parameter for Google embedder
        embedder_type: Direct specification of embedder type
        allow_fallback: Whether to allow automatic fallback on failure

    Returns:
        adal.Embedder: Configured embedder instance

    Raises:
        RuntimeError: If no embedders are available after fallback attempts
    """
    global _active_embedder_type, _fallback_attempted

    # Determine target embedder type
    if embedder_type:
        target_type = embedder_type
    elif is_local_ollama:
        target_type = 'ollama'
    elif use_google_embedder:
        target_type = 'google'
    else:
        target_type = get_embedder_type()

    # Try to create embedder with fallback
    attempted_types = set()
    current_type = target_type

    while current_type and current_type not in attempted_types:
        attempted_types.add(current_type)

        try:
            embedder = _create_embedder(current_type)
            _active_embedder_type = current_type

            if current_type != target_type:
                logger.info(f"Using fallback embedder: {current_type} (requested: {target_type})")

            return embedder

        except Exception as e:
            logger.error(f"Failed to create {current_type} embedder: {e}")

            if not allow_fallback:
                raise

            current_type = _get_fallback_embedder_type(current_type)

    raise RuntimeError(
        f"No embedders available. Attempted: {attempted_types}. "
        "Please configure at least one embedder (builtin, openai, google, or ollama)."
    )


def get_active_embedder_type() -> Optional[str]:
    """Get the currently active embedder type."""
    return _active_embedder_type
