"""Azure AI Foundry Anthropic (Claude) ModelClient integration.

This client uses the Anthropic SDK with AnthropicFoundry to connect to
Claude models hosted on Azure AI Foundry. Unlike Azure OpenAI, Claude on
Azure uses the Anthropic Messages API format.
"""

import os
import logging
from typing import Optional, Callable, Any, Dict, TypeVar

import backoff
from anthropic import AnthropicFoundry, AsyncAnthropicFoundry
from anthropic import (
    APITimeoutError,
    InternalServerError,
    RateLimitError,
    BadRequestError,
    APIStatusError,
)

from adalflow.core.model_client import ModelClient
from adalflow.core.types import (
    ModelType,
    CompletionUsage,
    GeneratorOutput,
)

log = logging.getLogger(__name__)
T = TypeVar("T")


def get_first_message_content(message) -> str:
    """Extract content from Anthropic message response.

    Anthropic returns content as a list of ContentBlock objects.
    For text responses, access message.content[0].text
    """
    log.debug(f"raw message: {message}")
    if message.content and len(message.content) > 0:
        return message.content[0].text
    return ""


class AzureAnthropicClient(ModelClient):
    """A client for Azure AI Foundry Claude models using the Anthropic SDK.

    Azure AI Foundry hosts Claude models that use the Anthropic Messages API,
    not the OpenAI Chat Completions API. This client uses AnthropicFoundry
    from the anthropic SDK.

    Environment Variables:
        AZURE_ANTHROPIC_ENDPOINT: Base URL (e.g., https://<resource>.services.ai.azure.com/anthropic)
        AZURE_ANTHROPIC_API_KEY: API key for authentication

    Example:
        ```python
        client = AzureAnthropicClient()
        # or with explicit config
        client = AzureAnthropicClient(
            api_key="your-api-key",
            azure_endpoint="https://your-resource.services.ai.azure.com/anthropic"
        )
        ```
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        azure_endpoint: Optional[str] = None,
        chat_completion_parser: Callable[[Any], Any] = None,
        input_type: str = "text",
    ):
        super().__init__()
        self._api_key = api_key
        self._azure_endpoint = azure_endpoint or os.getenv("AZURE_ANTHROPIC_ENDPOINT")
        self._env_api_key_name = "AZURE_ANTHROPIC_API_KEY"

        self.sync_client = self.init_sync_client()
        self.async_client = None  # Lazy initialization
        self.chat_completion_parser = chat_completion_parser or get_first_message_content
        self._input_type = input_type
        self._api_kwargs = {}

    def init_sync_client(self):
        """Initialize synchronous Anthropic client for Azure."""
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        endpoint = self._azure_endpoint or os.getenv("AZURE_ANTHROPIC_ENDPOINT")

        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")
        if not endpoint:
            raise ValueError("AZURE_ANTHROPIC_ENDPOINT must be set")

        log.debug(f"Initializing AnthropicFoundry sync client with endpoint: {endpoint}")
        return AnthropicFoundry(
            api_key=api_key,
            base_url=endpoint,
        )

    def init_async_client(self):
        """Initialize asynchronous Anthropic client for Azure."""
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        endpoint = self._azure_endpoint or os.getenv("AZURE_ANTHROPIC_ENDPOINT")

        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")
        if not endpoint:
            raise ValueError("AZURE_ANTHROPIC_ENDPOINT must be set")

        log.debug(f"Initializing AsyncAnthropicFoundry client with endpoint: {endpoint}")
        return AsyncAnthropicFoundry(
            api_key=api_key,
            base_url=endpoint,
        )

    def convert_inputs_to_api_kwargs(
        self,
        input: Optional[Any] = None,
        model_kwargs: Dict = {},
        model_type: ModelType = ModelType.UNDEFINED,
    ) -> Dict:
        """Convert inputs to Anthropic API format.

        Anthropic uses a different message format than OpenAI:
        - No 'role: system' in messages array (use system parameter)
        - Messages must alternate between user/assistant roles
        - CRITICAL: Claude API does NOT allow both temperature and top_p together
        """
        if model_type == ModelType.EMBEDDER:
            raise NotImplementedError("Claude on Azure does not support embeddings")

        final_kwargs = model_kwargs.copy()

        if model_type == ModelType.LLM:
            messages = []
            system_prompt = None

            # Parse system prompt if using message tags
            if self._input_type == "messages":
                import re
                system_start_tag = "<START_OF_SYSTEM_PROMPT>"
                system_end_tag = "<END_OF_SYSTEM_PROMPT>"
                user_start_tag = "<START_OF_USER_PROMPT>"
                user_end_tag = "<END_OF_USER_PROMPT>"

                pattern = (
                    rf"{system_start_tag}\s*(.*?)\s*{system_end_tag}\s*"
                    rf"{user_start_tag}\s*(.*?)\s*{user_end_tag}"
                )
                regex = re.compile(pattern, re.DOTALL)
                match = regex.match(input)

                if match:
                    system_prompt = match.group(1)
                    input_str = match.group(2)
                    messages.append({"role": "user", "content": input_str})

            if len(messages) == 0:
                messages.append({"role": "user", "content": input})

            final_kwargs["messages"] = messages

            # Anthropic uses 'system' as a separate parameter, not in messages
            if system_prompt:
                final_kwargs["system"] = system_prompt

            # Ensure max_tokens is set (required for Anthropic)
            if "max_tokens" not in final_kwargs:
                final_kwargs["max_tokens"] = 8096

            # CRITICAL: Claude API does not allow both temperature and top_p
            if "temperature" in final_kwargs and "top_p" in final_kwargs:
                log.warning("Claude API does not allow both temperature and top_p parameters. Dropping top_p and keeping temperature.")
                del final_kwargs["top_p"]
        else:
            raise ValueError(f"model_type {model_type} is not supported")

        return final_kwargs

    def parse_chat_completion(self, message) -> "GeneratorOutput":
        """Parse Anthropic message response."""
        log.debug(f"message: {message}, parser: {self.chat_completion_parser}")
        try:
            data = self.chat_completion_parser(message)
        except Exception as e:
            log.error(f"Error parsing the message: {e}")
            return GeneratorOutput(data=None, error=str(e), raw_response=message)

        try:
            usage = self.track_completion_usage(message)
            return GeneratorOutput(
                data=None, error=None, raw_response=data, usage=usage
            )
        except Exception as e:
            log.error(f"Error tracking usage: {e}")
            return GeneratorOutput(data=None, error=str(e), raw_response=data)

    def track_completion_usage(self, message) -> CompletionUsage:
        """Track token usage from Anthropic response."""
        try:
            usage = CompletionUsage(
                completion_tokens=message.usage.output_tokens,
                prompt_tokens=message.usage.input_tokens,
                total_tokens=message.usage.input_tokens + message.usage.output_tokens,
            )
            return usage
        except Exception as e:
            log.error(f"Error tracking usage: {e}")
            return CompletionUsage(
                completion_tokens=None, prompt_tokens=None, total_tokens=None
            )

    @backoff.on_exception(
        backoff.expo,
        (APITimeoutError, InternalServerError, RateLimitError, BadRequestError, APIStatusError),
        factor=60,
        max_time=600,
        max_value=60,
    )
    def call(self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED):
        """Synchronous call to Azure Anthropic API."""
        self._api_kwargs = api_kwargs
        log.info(f"AzureAnthropic sync call - model_type: {model_type}")
        log.debug(f"AzureAnthropic API kwargs: {api_kwargs}")

        if model_type == ModelType.EMBEDDER:
            raise NotImplementedError("Claude on Azure does not support embeddings")

        elif model_type == ModelType.LLM:
            model_name = api_kwargs.get('model', 'unknown')
            is_streaming = api_kwargs.get('stream', False)
            log.info(f"AzureAnthropic calling model: {model_name}, streaming: {is_streaming}")

            # Remove 'stream' from api_kwargs as Anthropic SDK doesn't accept it
            # The stream() method itself indicates streaming
            clean_kwargs = {k: v for k, v in api_kwargs.items() if k != 'stream'}

            if is_streaming:
                # Return streaming context manager
                return self.sync_client.messages.stream(**clean_kwargs)
            else:
                return self.sync_client.messages.create(**clean_kwargs)
        else:
            raise ValueError(f"model_type {model_type} is not supported")

    @backoff.on_exception(
        backoff.expo,
        (APITimeoutError, InternalServerError, RateLimitError, BadRequestError, APIStatusError),
        factor=60,
        max_time=600,
        max_value=60,
    )
    async def acall(
        self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED
    ):
        """Asynchronous call to Azure Anthropic API."""
        self._api_kwargs = api_kwargs
        log.info(f"AzureAnthropic async call - model_type: {model_type}")
        log.debug(f"AzureAnthropic API kwargs: {api_kwargs}")

        if self.async_client is None:
            log.debug("Initializing AzureAnthropic async client")
            self.async_client = self.init_async_client()

        if model_type == ModelType.EMBEDDER:
            raise NotImplementedError("Claude on Azure does not support embeddings")

        elif model_type == ModelType.LLM:
            model_name = api_kwargs.get('model', 'unknown')
            is_streaming = api_kwargs.get('stream', False)
            log.info(f"AzureAnthropic async calling model: {model_name}, streaming: {is_streaming}")

            # Remove 'stream' from api_kwargs as Anthropic SDK doesn't accept it
            # The stream() method itself indicates streaming
            clean_kwargs = {k: v for k, v in api_kwargs.items() if k != 'stream'}

            if is_streaming:
                # Return async streaming context manager
                return self.async_client.messages.stream(**clean_kwargs)
            else:
                return await self.async_client.messages.create(**clean_kwargs)
        else:
            raise ValueError(f"model_type {model_type} is not supported")

    @classmethod
    def from_dict(cls, data: Dict[str, Any]):
        obj = super().from_dict(data)
        obj.sync_client = obj.init_sync_client()
        obj.async_client = obj.init_async_client()
        return obj

    def to_dict(self) -> Dict[str, Any]:
        exclude = ["sync_client", "async_client"]
        output = super().to_dict(exclude=exclude)
        return output
