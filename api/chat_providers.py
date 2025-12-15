import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, Optional

import google.generativeai as genai
from adalflow.components.model_client.ollama_client import OllamaClient
from adalflow.core.types import ModelType

from api.azure_anthropic_client import AzureAnthropicClient
from api.azureai_client import AzureAIClient
from api.config import DEEPSEEK_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY
from api.deepseek_client import DeepSeekClient
from api.openai_client import OpenAIClient
from api.openrouter_client import OpenRouterClient
from api.zhipu_anthropic_client import ZhipuAnthropicClient
from api.zhipu_openai_client import ZhipuOpenAIClient

logger = logging.getLogger(__name__)


class ProviderNotSupported(ValueError):
    pass


@dataclass
class ProviderRoute:
    provider: str
    call: Callable[[str], Awaitable[Any]]
    stream_style: str
    error_hint: Optional[str] = None


ERROR_HINTS = {
    "openrouter": "\nError with OpenRouter API: {error}\n\nPlease check that you have set the OPENROUTER_API_KEY environment variable with a valid API key.",
    "openai": "\nError with Openai API: {error}\n\nPlease check that you have set the OPENAI_API_KEY environment variable with a valid API key.",
    "azure": "\nError with Azure AI API: {error}\n\nPlease check that you have set the AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_VERSION environment variables with valid values.",
    "deepseek": "\nError with DeepSeek API: {error}\n\nPlease check that you have set the DEEPSEEK_API_KEY environment variable with a valid API key.",
    "azure_anthropic": "\nError with Azure Anthropic API: {error}\n\nPlease check AZURE_ANTHROPIC_API_KEY and AZURE_ANTHROPIC_ENDPOINT.",
    "zhipu": "\nError with Zhipu API: {error}\n\nPlease check ZHIPU_CODING_PLAN_API_KEY and base URLs.",
    "zhipu_anthropic": "\nError with Zhipu Anthropic-compatible API: {error}\n\nPlease check ZHIPU_CODING_PLAN_API_KEY and base URLs.",
}


_client_cache: Dict[str, Any] = {}


def get_provider_client(provider: str) -> Any:
    """Return a cached provider client instance."""
    if provider in _client_cache:
        return _client_cache[provider]

    if provider == "ollama":
        client = OllamaClient()
    elif provider == "openrouter":
        client = OpenRouterClient()
    elif provider == "openai":
        client = OpenAIClient()
    elif provider == "azure":
        client = AzureAIClient()
    elif provider == "deepseek":
        client = DeepSeekClient()
    elif provider == "azure_anthropic":
        client = AzureAnthropicClient()
    elif provider == "zhipu":
        client = ZhipuOpenAIClient()
    elif provider == "zhipu_anthropic":
        client = ZhipuAnthropicClient()
    elif provider == "google":
        # google client is created per route to capture generation config
        client = None
    else:
        raise ProviderNotSupported(f"Provider '{provider}' is not supported")

    if client is not None:
        _client_cache[provider] = client
    return client


def prepare_prompt_for_provider(provider: str, prompt: str) -> str:
    """Apply provider-specific prompt tweaks."""
    if provider == "ollama" and not prompt.strip().endswith("/no_think"):
        return f"{prompt} /no_think"
    return prompt


def build_provider_route(
    provider: str,
    model_name: str,
    base_model_kwargs: Dict,
) -> ProviderRoute:
    """Create a ProviderRoute with call + stream style for the provider."""
    provider = provider or "google"
    client = get_provider_client(provider)

    if provider == "ollama":
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "options": {
                "temperature": base_model_kwargs.get("temperature"),
                "top_p": base_model_kwargs.get("top_p"),
                "num_ctx": base_model_kwargs.get("num_ctx"),
            },
        }

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="ollama")

    if provider == "openrouter":
        if not OPENROUTER_API_KEY:
            logger.warning("OPENROUTER_API_KEY not configured, but continuing with request")
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "temperature": base_model_kwargs.get("temperature"),
        }
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="openai", error_hint=ERROR_HINTS[provider])

    if provider == "openai":
        if not OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY not configured, but continuing with request")
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "temperature": base_model_kwargs.get("temperature"),
        }
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="openai", error_hint=ERROR_HINTS[provider])

    if provider == "azure":
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "temperature": base_model_kwargs.get("temperature"),
        }
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="openai", error_hint=ERROR_HINTS[provider])

    if provider == "deepseek":
        if not DEEPSEEK_API_KEY:
            logger.warning("DEEPSEEK_API_KEY not configured, but continuing with request")
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "temperature": base_model_kwargs.get("temperature"),
        }
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="openai", error_hint=ERROR_HINTS[provider])

    if provider == "azure_anthropic":
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "max_tokens": base_model_kwargs.get("max_tokens", 8096),
        }
        if "temperature" in base_model_kwargs:
            model_kwargs["temperature"] = base_model_kwargs.get("temperature")
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="anthropic", error_hint=ERROR_HINTS[provider])

    if provider == "zhipu":
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "temperature": base_model_kwargs.get("temperature"),
        }
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="openai", error_hint=ERROR_HINTS[provider])

    if provider == "zhipu_anthropic":
        model_kwargs = {
            "model": model_name,
            "stream": True,
            "max_tokens": base_model_kwargs.get("max_tokens", 4096),
        }
        if "temperature" in base_model_kwargs:
            model_kwargs["temperature"] = base_model_kwargs.get("temperature")
        if "top_p" in base_model_kwargs:
            model_kwargs["top_p"] = base_model_kwargs.get("top_p")

        async def call(prompt: str):
            api_kwargs = client.convert_inputs_to_api_kwargs(
                input=prompt, model_kwargs=model_kwargs, model_type=ModelType.LLM
            )
            return await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)

        return ProviderRoute(provider=provider, call=call, stream_style="anthropic_events", error_hint=ERROR_HINTS[provider])

    if provider == "google":
        # google client is created per route because it uses generation config
        model = genai.GenerativeModel(
            model_name=model_name,
            generation_config={
                "temperature": base_model_kwargs.get("temperature", 0.7),
                "top_p": base_model_kwargs.get("top_p", 0.8),
                "top_k": base_model_kwargs.get("top_k", 40),
            },
        )

        async def call(prompt: str):
            # google SDK is sync but safe to call within async context
            return model.generate_content(prompt, stream=True)

        return ProviderRoute(provider=provider, call=call, stream_style="google")

    raise ProviderNotSupported(f"Provider '{provider}' is not supported")


def _should_retry_without_context(error_message: str) -> bool:
    lowered = error_message.lower()
    return any(
        marker in lowered
        for marker in ["maximum context length", "token limit", "too many tokens", "context length exceeded"]
    )


def _extract_text_from_content(content: Any) -> list[str]:
    """Normalize OpenAI/Azure content payloads (string or list of text blocks)."""
    if not content:
        return []

    # Plain string content
    if isinstance(content, str):
        return [content]

    texts: list[str] = []
    if isinstance(content, list):
        for part in content:
            if not part:
                continue
            if isinstance(part, str):
                texts.append(part)
                continue
            if isinstance(part, dict):
                text_val = part.get("text") or part.get("content")
                if text_val:
                    texts.append(text_val)
                continue
            text_val = getattr(part, "text", None)
            if text_val:
                texts.append(text_val)
    return texts


async def _stream_openai_style(response: Any) -> AsyncIterator[str]:
    async for chunk in response:
        if not chunk:
            continue

        choices = getattr(chunk, "choices", []) or []
        if choices:
            choice = choices[0]
            delta = getattr(choice, "delta", None)
            if delta is not None:
                for text in _extract_text_from_content(getattr(delta, "content", None)):
                    if text:
                        yield text
                # Skip prompt_filter or role-only chunks when no text content
                continue

            # Some providers place the text on the message for the final chunk
            message = getattr(choice, "message", None)
            if message is not None:
                for text in _extract_text_from_content(getattr(message, "content", None)):
                    if text:
                        yield text
                continue

        # Fallback: handle plain text streaming responses without choices
        if isinstance(chunk, str):
            yield chunk
            continue
        fallback_text = getattr(chunk, "text", None) or getattr(chunk, "data", None)
        if isinstance(fallback_text, str) and fallback_text:
            yield fallback_text


def _clean_ollama_text(text: str) -> Optional[str]:
    if not text:
        return None
    if text.startswith("model=") or text.startswith("created_at="):
        return None
    return text.replace("<think>", "").replace("</think>", "")


async def _stream_ollama_style(response: Any) -> AsyncIterator[str]:
    async for chunk in response:
        text = getattr(chunk, "response", None) or getattr(chunk, "text", None) or str(chunk)
        cleaned = _clean_ollama_text(text)
        if cleaned:
            yield cleaned


async def _stream_anthropic_context_manager(response: Any) -> AsyncIterator[str]:
    async with response as stream:
        async for text in stream.text_stream:
            if text:
                yield text


async def _stream_anthropic_events(response: Any) -> AsyncIterator[str]:
    stream_iter = getattr(response, "text_stream", None)
    if stream_iter is not None:
        async for text in stream_iter:
            if text:
                yield text
        return

    async for event in response:
        ev_type = getattr(event, "type", "")
        if ev_type in ("content_block_delta", "message_delta"):
            delta = getattr(event, "delta", None)
            text = getattr(delta, "text", None) if delta else None
            if text:
                yield text
        elif ev_type == "message_stop":
            break


async def _stream_google_style(response: Any) -> AsyncIterator[str]:
    for chunk in response:
        text = getattr(chunk, "text", None)
        if text:
            yield text


async def stream_tokens(route: ProviderRoute, prompt: str) -> AsyncIterator[str]:
    """Execute provider call and yield normalized tokens."""
    logger.info(f"Making {route.provider} API call")
    response = await route.call(prompt)

    if route.stream_style == "openai":
        async for chunk in _stream_openai_style(response):
            yield chunk
    elif route.stream_style == "ollama":
        async for chunk in _stream_ollama_style(response):
            yield chunk
    elif route.stream_style == "anthropic":
        async for chunk in _stream_anthropic_context_manager(response):
            yield chunk
    elif route.stream_style == "anthropic_events":
        async for chunk in _stream_anthropic_events(response):
            yield chunk
    elif route.stream_style == "google":
        async for chunk in _stream_google_style(response):
            yield chunk
    else:
        raise ProviderNotSupported(f"Unknown stream style '{route.stream_style}'")


async def stream_with_fallback(
    route: ProviderRoute,
    prompt: str,
    fallback_prompt: Optional[str] = None,
) -> AsyncIterator[str]:
    """Stream response, retrying with fallback prompt on token limit errors."""
    try:
        async for chunk in stream_tokens(route, prompt):
            yield chunk
    except Exception as err:
        logger.error(f"Error during primary stream for {route.provider}: {err}")
        message = str(err)
        if fallback_prompt and _should_retry_without_context(message):
            logger.warning("Token/context limit exceeded, retrying without context")
            try:
                async for chunk in stream_tokens(route, fallback_prompt):
                    yield chunk
                return
            except Exception as fallback_err:
                logger.error(f"Fallback stream failed for {route.provider}: {fallback_err}")
                yield "\nI apologize, but your request is too large for me to process. Please try a shorter query or break it into smaller parts."
                return

        hint = route.error_hint
        if hint:
            yield hint.format(error=message)
        else:
            raise
