"""Azure OpenAI ModelClient integration.

This client mirrors the existing ``OpenAIClient`` but uses the Azure-specific
SDK classes so that authentication, base URLs, and API versions are handled
according to Azure OpenAI requirements.
"""

import os
import logging
import time
from typing import Optional, Callable, Any, Dict, TypeVar, Generator, Union, Sequence, List

import backoff

from openai import (
    APITimeoutError,
    InternalServerError,
    RateLimitError,
    UnprocessableEntityError,
    BadRequestError,
)

from openai import AzureOpenAI, AsyncAzureOpenAI, OpenAI, AsyncOpenAI
from adalflow.core.types import ModelType
from api.openai_client import OpenAIClient

log = logging.getLogger(__name__)
T = TypeVar("T")


class AzureAIClient(OpenAIClient):
    """A thin wrapper around ``AzureOpenAI``/``AsyncAzureOpenAI``.

    Azure shares the same API surface as OpenAI's client, so we subclass the
    existing ``OpenAIClient`` and override the client initializers to use the
    Azure-specific classes and environment variable names.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_completion_parser: Callable[[Any], Any] = None,
        input_type: str = "text",
        api_version: Optional[str] = None,
        azure_endpoint: Optional[str] = None,
    ):
        # Azure OpenAI requires an explicit API version; "v1" is not a valid value
        # for embeddings and will return HTTP 404. Keep it configurable via env but
        # default to the stable embeddings version from the official docs.
        self._api_version = api_version or os.getenv(
            "AZURE_OPENAI_VERSION", "2025-04-01-preview"
        )
        self._azure_endpoint = azure_endpoint or os.getenv("AZURE_OPENAI_ENDPOINT")

        # Opt-in path for the new Azure v1 endpoint that drops the api-version
        # query param and uses the standard OpenAI client. Keep default False to
        # preserve classic behavior.
        self._use_v1 = os.getenv("AZURE_OPENAI_USE_V1", "false").lower() in (
            "1",
            "true",
            "yes",
        )

        super().__init__(
            api_key=api_key,
            chat_completion_parser=chat_completion_parser,
            input_type=input_type,
            base_url=self._azure_endpoint,
            env_base_url_name="AZURE_OPENAI_ENDPOINT",
            env_api_key_name="AZURE_OPENAI_API_KEY",
        )

    def init_sync_client(self):
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        endpoint = self._azure_endpoint or os.getenv(self._env_base_url_name)

        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")
        if not endpoint:
            raise ValueError(f"Environment variable {self._env_base_url_name} must be set")

        if self._use_v1:
            base_url = endpoint.rstrip("/") + "/openai/v1"
            log.debug("Initializing OpenAI client against Azure v1 endpoint %s", base_url)
            return OpenAI(
                api_key=api_key,
                base_url=base_url,
                # Azure v1 still expects `api-key` header, so send it explicitly.
                default_headers={"api-key": api_key},
            )

        log.debug("Initializing AzureOpenAI sync client")
        return AzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=self._api_version,
        )

    def init_async_client(self):
        api_key = self._api_key or os.getenv(self._env_api_key_name)
        endpoint = self._azure_endpoint or os.getenv(self._env_base_url_name)

        if not api_key:
            raise ValueError(f"Environment variable {self._env_api_key_name} must be set")
        if not endpoint:
            raise ValueError(f"Environment variable {self._env_base_url_name} must be set")

        if self._use_v1:
            base_url = endpoint.rstrip("/") + "/openai/v1"
            log.debug("Initializing OpenAI async client against Azure v1 endpoint %s", base_url)
            return AsyncOpenAI(
                api_key=api_key,
                base_url=base_url,
                default_headers={"api-key": api_key},
            )

        log.debug("Initializing AzureOpenAI async client")
        return AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=self._api_version,
        )

    def convert_inputs_to_api_kwargs(
        self,
        input: Optional[Any] = None,
        model_kwargs: Dict = {},
        model_type: ModelType = ModelType.UNDEFINED,
    ) -> Dict:
        """Normalize LLM kwargs for Azure AI Foundry quirks.

        Azure Foundry reasoning models (o-series, etc.) reject sampling params
        like ``temperature`` and ``top_p``. We strip those before calling the
        SDK to avoid ``unsupported_value`` errors.
        """

        final_kwargs = super().convert_inputs_to_api_kwargs(
            input=input, model_kwargs=model_kwargs, model_type=model_type
        )

        if model_type == ModelType.LLM:
            model_name = str(final_kwargs.get("model", "")).strip().lower()
            if self._is_reasoning_model(model_name):
                for key in [
                    "temperature",
                    "top_p",
                    "frequency_penalty",
                    "presence_penalty",
                ]:
                    if key in final_kwargs:
                        final_kwargs.pop(key, None)
                log.debug(
                    "Removed sampling params for Azure reasoning model %s", model_name
                )

        return final_kwargs

    @staticmethod
    def _is_reasoning_model(model_name: str) -> bool:
        """Return True for Azure reasoning-style deployments.

        Azure AI Foundry disallows sampling controls on o-series reasoning
        models (e.g., ``o1``, ``o3-mini``). Match on those prefixes and any
        deployment name containing ``reasoning`` to keep behavior forward-safe.
        """

        return (
            model_name.startswith("o1")
            or model_name.startswith("o3")
            or model_name.startswith("o4")
            or "reasoning" in model_name
        )

    def _validate_embedding_response(self, response) -> bool:
        """Validate that the embedding response contains non-empty embeddings.

        Args:
            response: The embedding response from the API

        Returns:
            bool: True if the response contains valid embeddings, False otherwise
        """
        try:
            if not response or not hasattr(response, 'data'):
                log.warning("Embedding response is missing or has no data attribute")
                return False

            if not response.data or len(response.data) == 0:
                log.warning("Embedding response has empty data")
                return False

            # Check if all embeddings are non-empty
            for i, item in enumerate(response.data):
                if not hasattr(item, 'embedding') or not item.embedding:
                    log.warning(f"Embedding at index {i} is missing or empty")
                    return False

                if len(item.embedding) == 0:
                    log.warning(f"Embedding at index {i} has 0 dimensions")
                    return False

            return True
        except Exception as e:
            log.error(f"Error validating embedding response: {e}")
            return False

    def _call_embeddings_with_retry(self, api_kwargs: Dict, max_retries: int = 3) -> Any:
        """Call embeddings API with retry logic for empty embeddings.

        Args:
            api_kwargs: API keyword arguments
            max_retries: Maximum number of retry attempts (default: 3)

        Returns:
            The embedding response (even if invalid - pipeline will handle skipping)
        """
        last_response = None

        for attempt in range(max_retries):
            try:
                response = self.sync_client.embeddings.create(**api_kwargs)
                last_response = response

                # Validate the response
                if self._validate_embedding_response(response):
                    if attempt > 0:
                        log.info(f"Successfully generated embeddings on attempt {attempt + 1}")
                    return response
                else:
                    log.warning(f"Received invalid/empty embeddings on attempt {attempt + 1}/{max_retries}")

                    # Don't sleep on the last attempt
                    if attempt < max_retries - 1:
                        sleep_time = 2 ** attempt
                        log.info(f"Retrying after {sleep_time} seconds...")
                        time.sleep(sleep_time)
            except Exception as e:
                log.error(f"Error generating embeddings on attempt {attempt + 1}/{max_retries}: {e}")

                # Don't sleep on the last attempt
                if attempt < max_retries - 1:
                    sleep_time = 2 ** attempt
                    log.info(f"Retrying after {sleep_time} seconds...")
                    time.sleep(sleep_time)

        # If we get here, all retries failed - return last response (or raise if never got one)
        # Pipeline will handle empty embeddings by skipping documents
        if last_response is not None:
            log.warning(f"Returning response after {max_retries} attempts - may contain empty embeddings")
            return last_response
        else:
            # Only raise if we never got a response at all
            log.error(f"Failed to get any response after {max_retries} attempts")
            raise Exception(f"Failed to get any response after {max_retries} attempts")

    async def _acall_embeddings_with_retry(self, api_kwargs: Dict, max_retries: int = 3) -> Any:
        """Async call embeddings API with retry logic for empty embeddings.

        Args:
            api_kwargs: API keyword arguments
            max_retries: Maximum number of retry attempts (default: 3)

        Returns:
            The embedding response (even if invalid - pipeline will handle skipping)
        """
        import asyncio
        last_response = None

        for attempt in range(max_retries):
            try:
                response = await self.async_client.embeddings.create(**api_kwargs)
                last_response = response

                # Validate the response
                if self._validate_embedding_response(response):
                    if attempt > 0:
                        log.info(f"Successfully generated embeddings on attempt {attempt + 1}")
                    return response
                else:
                    log.warning(f"Received invalid/empty embeddings on attempt {attempt + 1}/{max_retries}")

                    # Don't sleep on the last attempt
                    if attempt < max_retries - 1:
                        sleep_time = 2 ** attempt
                        log.info(f"Retrying after {sleep_time} seconds...")
                        await asyncio.sleep(sleep_time)
            except Exception as e:
                log.error(f"Error generating embeddings on attempt {attempt + 1}/{max_retries}: {e}")

                # Don't sleep on the last attempt
                if attempt < max_retries - 1:
                    sleep_time = 2 ** attempt
                    log.info(f"Retrying after {sleep_time} seconds...")
                    await asyncio.sleep(sleep_time)

        # If we get here, all retries failed - return last response (or raise if never got one)
        # Pipeline will handle empty embeddings by skipping documents
        if last_response is not None:
            log.warning(f"Returning response after {max_retries} attempts - may contain empty embeddings")
            return last_response
        else:
            # Only raise if we never got a response at all
            log.error(f"Failed to get any response after {max_retries} attempts")
            raise Exception(f"Failed to get any response after {max_retries} attempts")

    @backoff.on_exception(
        # Azure/OpenAI 429 responses commonly return "retry after 60s".
        backoff.expo,
        (
            APITimeoutError,
            InternalServerError,
            RateLimitError,
            UnprocessableEntityError,
            BadRequestError,
        ),
        factor=60,
        max_time=600,
        max_value=60,
    )
    def call(self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED):
        """Sync call with Azure-aware backoff (mirrors OpenAIClient)."""
        # store the api kwargs in the client
        self._api_kwargs = api_kwargs
        log.info(f"AzureOpenAI sync call - model_type: {model_type}")
        log.info(f"AzureOpenAI API kwargs: {api_kwargs}")
        log.debug(f"AzureOpenAI full API kwargs details: {api_kwargs}")

        if model_type == ModelType.EMBEDDER:
            log.debug("AzureOpenAI embeddings call")
            return self._call_embeddings_with_retry(api_kwargs)
        elif model_type == ModelType.LLM:
            model_name = api_kwargs.get('model', 'unknown')
            is_streaming = api_kwargs.get('stream', False)
            log.info(f"AzureOpenAI calling model: {model_name}, streaming: {is_streaming}")
            return self.sync_client.chat.completions.create(**api_kwargs)
        elif model_type == ModelType.IMAGE_GENERATION:
            if "image" in api_kwargs:
                if "mask" in api_kwargs:
                    response = self.sync_client.images.edit(**api_kwargs)
                else:
                    response = self.sync_client.images.create_variation(**api_kwargs)
            else:
                response = self.sync_client.images.generate(**api_kwargs)
            return response.data
        else:
            raise ValueError(f"model_type {model_type} is not supported")

    @backoff.on_exception(
        backoff.expo,
        (
            APITimeoutError,
            InternalServerError,
            RateLimitError,
            UnprocessableEntityError,
            BadRequestError,
        ),
        factor=60,
        max_time=600,
        max_value=60,
    )
    async def acall(
        self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED
    ):
        """Async call with Azure-aware backoff (mirrors OpenAIClient)."""
        self._api_kwargs = api_kwargs
        log.info(f"AzureOpenAI async call - model_type: {model_type}")
        log.info(f"AzureOpenAI API kwargs: {api_kwargs}")
        log.debug(f"AzureOpenAI full API kwargs details: {api_kwargs}")

        if self.async_client is None:
            log.debug("Initializing AzureOpenAI async client")
            self.async_client = self.init_async_client()

        if model_type == ModelType.EMBEDDER:
            log.debug("AzureOpenAI async embeddings call")
            return await self._acall_embeddings_with_retry(api_kwargs)
        elif model_type == ModelType.LLM:
            model_name = api_kwargs.get('model', 'unknown')
            is_streaming = api_kwargs.get('stream', False)
            log.info(f"AzureOpenAI async calling model: {model_name}, streaming: {is_streaming}")
            return await self.async_client.chat.completions.create(**api_kwargs)
        elif model_type == ModelType.IMAGE_GENERATION:
            if "image" in api_kwargs:
                if "mask" in api_kwargs:
                    response = await self.async_client.images.edit(**api_kwargs)
                else:
                    response = await self.async_client.images.create_variation(
                        **api_kwargs
                    )
            else:
                response = await self.async_client.images.generate(**api_kwargs)
            return response.data
        else:
            raise ValueError(f"model_type {model_type} is not supported")
