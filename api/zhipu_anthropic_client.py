"""Zhipu Coding Plan Anthropic-compatible client."""

import os
import logging
from typing import Optional, Callable, Any, Dict, TypeVar

import backoff
from anthropic import Anthropic, AsyncAnthropic
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
    """Extract text content from Anthropic message response."""
    log.debug(f"raw message: {message}")
    if message.content and len(message.content) > 0:
        return message.content[0].text
    return ""


class ZhipuAnthropicClient(ModelClient):
    """Anthropic-compatible client for Zhipu Coding Plan.

    Uses the standard Anthropic Messages API shape, pointing to Zhipu's Coding
    Plan endpoint.

    Environment variables:
        ZHIPU_CODING_PLAN_API_KEY: API key for Coding Plan
        ZHIPU_ANTHROPIC_CODING_PLAN_BASE_URL: Optional override (default: https://api.z.ai/api/anthropic)
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        chat_completion_parser: Callable[[Any], Any] = None,
        input_type: str = "text",
    ):
        super().__init__()
        self._api_key = api_key
        self._base_url = base_url or os.getenv(
            "ZHIPU_ANTHROPIC_CODING_PLAN_BASE_URL",
            "https://api.z.ai/api/anthropic",
        )
        self._env_api_key_name = "ZHIPU_CODING_PLAN_API_KEY"

        self.sync_client = self.init_sync_client()
        self.async_client = None  # Lazy initialization
        self.chat_completion_parser = chat_completion_parser or get_first_message_content
        self._input_type = input_type
        self._api_kwargs = {}

    def init_sync_client(self):
        """Initialize synchronous Anthropic client."""
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")

        log.debug(f"Initializing Anthropic sync client with base_url: {self._base_url}")
        return Anthropic(
            api_key=api_key,
            base_url=self._base_url,
        )

    def init_async_client(self):
        """Initialize asynchronous Anthropic client."""
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")

        log.debug(f"Initializing Anthropic async client with base_url: {self._base_url}")
        return AsyncAnthropic(
            api_key=api_key,
            base_url=self._base_url,
        )

    def convert_inputs_to_api_kwargs(
        self,
        input: Optional[Any] = None,
        model_kwargs: Dict = {},
        model_type: ModelType = ModelType.UNDEFINED,
    ) -> Dict:
        """Convert inputs to Anthropic API format."""
        if model_type == ModelType.EMBEDDER:
            raise NotImplementedError("Zhipu Anthropic endpoint does not support embeddings")

        final_kwargs = model_kwargs.copy()

        if model_type == ModelType.LLM:
            messages = []
            system_prompt = None

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

            if system_prompt:
                final_kwargs["system"] = system_prompt

            if "max_tokens" not in final_kwargs:
                final_kwargs["max_tokens"] = 4096

            # Anthropic API disallows both temperature and top_p simultaneously
            if "temperature" in final_kwargs and "top_p" in final_kwargs:
                log.warning("Anthropic-compatible endpoint: dropping top_p because temperature is set.")
                final_kwargs.pop("top_p", None)
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
            if hasattr(message, "usage"):
                usage_obj = message.usage
                return CompletionUsage(
                    completion_tokens=getattr(usage_obj, "output_tokens", None),
                    prompt_tokens=getattr(usage_obj, "input_tokens", None),
                    total_tokens=getattr(usage_obj, "input_tokens", 0)
                    + getattr(usage_obj, "output_tokens", 0),
                )
        except Exception as e:
            log.error(f"Error tracking usage: {e}")

        return CompletionUsage(
            completion_tokens=None, prompt_tokens=None, total_tokens=None
        )

    @backoff.on_exception(
        backoff.expo,
        (
            APITimeoutError,
            InternalServerError,
            RateLimitError,
            BadRequestError,
            APIStatusError,
        ),
        max_time=5,
    )
    def call(self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED):
        """Synchronous call with basic retry for transient Anthropic errors."""
        self._api_kwargs = api_kwargs
        log.info(f"Zhipu Anthropic sync call - model_type: {model_type}")
        log.info(f"API kwargs: {api_kwargs}")
        if model_type != ModelType.LLM:
            raise ValueError(f"model_type {model_type} is not supported")
        return self.sync_client.messages.create(**api_kwargs)

    @backoff.on_exception(
        backoff.expo,
        (
            APITimeoutError,
            InternalServerError,
            RateLimitError,
            BadRequestError,
            APIStatusError,
        ),
        max_time=5,
    )
    async def acall(
        self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED
    ):
        """Async call with retry."""
        self._api_kwargs = api_kwargs
        log.info(f"Zhipu Anthropic async call - model_type: {model_type}")
        log.info(f"API kwargs: {api_kwargs}")

        if self.async_client is None:
            self.async_client = self.init_async_client()

        if model_type != ModelType.LLM:
            raise ValueError(f"model_type {model_type} is not supported")

        return await self.async_client.messages.create(**api_kwargs)
