"""OpenRouter ModelClient integration."""

import os
from typing import Dict, Sequence, Optional, Any, List
import logging
import json
import time
import asyncio
import aiohttp
import requests
from requests.exceptions import RequestException, Timeout

from adalflow.core.model_client import ModelClient
from adalflow.core.types import (
    CompletionUsage,
    ModelType,
    GeneratorOutput,
    EmbedderOutput,
    Embedding,
    Usage,
)
from adalflow.components.model_client.utils import parse_embedding_response

log = logging.getLogger(__name__)

class OpenRouterClient(ModelClient):
    __doc__ = r"""A component wrapper for the OpenRouter API client.

    OpenRouter provides a unified API that gives access to hundreds of AI models through a single endpoint.
    The API is compatible with OpenAI's API format with a few small differences.

    Supports both LLM generation and embeddings.

    Environment Variables:
        OPENROUTER_API_KEY: API key for OpenRouter
        OPENROUTER_BASE_URL: Custom base URL (default: https://openrouter.ai/api/v1)

    Visit https://openrouter.ai/docs for more details.

    Example:
        ```python
        from api.openrouter_client import OpenRouterClient
        import adalflow as adal

        # For LLM
        client = OpenRouterClient()
        generator = adal.Generator(
            model_client=client,
            model_kwargs={"model": "openai/gpt-4o"}
        )

        # For Embeddings
        embedder = adal.Embedder(
            model_client=client,
            model_kwargs={"model": "openai/text-embedding-3-small"}
        )
        ```
    """

    def __init__(self, *args, **kwargs) -> None:
        """Initialize the OpenRouter client."""
        super().__init__(*args, **kwargs)
        self.sync_client = self.init_sync_client()
        self.async_client = None  # Initialize async client only when needed

    def init_sync_client(self):
        """Initialize the synchronous OpenRouter client."""
        from api.config import OPENROUTER_API_KEY
        api_key = OPENROUTER_API_KEY
        if not api_key:
            log.warning("OPENROUTER_API_KEY not configured")

        # Use OPENROUTER_BASE_URL if set, otherwise use hardcoded OpenRouter URL
        # NOTE: Do NOT use OPENAI_BASE_URL as fallback because it may be set by other providers (e.g., DeepSeek)
        base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

        # OpenRouter doesn't have a dedicated client library, so we'll use requests directly
        return {
            "api_key": api_key,
            "base_url": base_url
        }

    def init_async_client(self):
        """Initialize the asynchronous OpenRouter client."""
        from api.config import OPENROUTER_API_KEY
        api_key = OPENROUTER_API_KEY
        if not api_key:
            log.warning("OPENROUTER_API_KEY not configured")

        # Use OPENROUTER_BASE_URL if set, otherwise use hardcoded OpenRouter URL
        # NOTE: Do NOT use OPENAI_BASE_URL as fallback because it may be set by other providers (e.g., DeepSeek)
        base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

        # For async, we'll use aiohttp
        return {
            "api_key": api_key,
            "base_url": base_url
        }

    def _validate_embedding_response(self, response) -> bool:
        """Validate that the embedding response contains non-empty embeddings.

        Args:
            response: The embedding response from the API (dict format)

        Returns:
            bool: True if the response contains valid embeddings, False otherwise
        """
        try:
            if not response or not isinstance(response, dict):
                log.warning("Embedding response is missing or not a dict")
                return False

            if 'data' not in response or not response['data']:
                log.warning("Embedding response has no data key or empty data")
                return False

            # Check if all embeddings are non-empty
            for i, item in enumerate(response['data']):
                if 'embedding' not in item or not item['embedding']:
                    log.warning(f"Embedding at index {i} is missing or empty")
                    return False

                if len(item['embedding']) == 0:
                    log.warning(f"Embedding at index {i} has 0 dimensions")
                    return False

            return True
        except Exception as e:
            log.error(f"Error validating embedding response: {e}")
            return False

    def _call_embeddings_with_retry(self, api_kwargs: Dict, max_retries: int = 3) -> Dict:
        """Call embeddings API with retry logic for empty embeddings.

        Args:
            api_kwargs: API keyword arguments
            max_retries: Maximum number of retry attempts (default: 3)

        Returns:
            The embedding response dict (even if invalid - pipeline will handle skipping)
        """
        headers = {
            "Authorization": f"Bearer {self.sync_client['api_key']}",
            "Content-Type": "application/json"
        }

        last_response = None
        model_name = api_kwargs.get('model', 'unknown')

        for attempt in range(max_retries):
            try:
                log.info(f"OpenRouter embeddings sync call - model: {model_name} (attempt {attempt + 1}/{max_retries})")
                log.info(f"Making sync OpenRouter embeddings API call to {self.sync_client['base_url']}/embeddings")
                log.debug(f"Request body: {api_kwargs}")

                response = requests.post(
                    f"{self.sync_client['base_url']}/embeddings",
                    headers=headers,
                    json=api_kwargs,
                    timeout=600
                )

                if response.status_code != 200:
                    error_text = response.text
                    log.error(f"OpenRouter embeddings API error ({response.status_code}): {error_text}")

                    # Don't sleep on the last attempt
                    if attempt < max_retries - 1:
                        sleep_time = 2 ** attempt
                        log.info(f"Retrying after {sleep_time} seconds...")
                        time.sleep(sleep_time)
                    continue

                data = response.json()
                last_response = data
                log.info(f"Received embeddings response from OpenRouter")
                log.debug(f"Response: {data}")

                # Validate the response
                if self._validate_embedding_response(data):
                    if attempt > 0:
                        log.info(f"Successfully generated embeddings on attempt {attempt + 1}")
                    return data
                else:
                    log.warning(f"Received invalid/empty embeddings on attempt {attempt + 1}/{max_retries}")

                    # Don't sleep on the last attempt
                    if attempt < max_retries - 1:
                        sleep_time = 2 ** attempt
                        log.info(f"Retrying after {sleep_time} seconds...")
                        time.sleep(sleep_time)

            except Exception as e:
                log.error(f"Error calling OpenRouter embeddings API on attempt {attempt + 1}/{max_retries}: {str(e)}")

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

    async def _acall_embeddings_with_retry(self, api_kwargs: Dict, max_retries: int = 3) -> Dict:
        """Async call embeddings API with retry logic for empty embeddings.

        Args:
            api_kwargs: API keyword arguments
            max_retries: Maximum number of retry attempts (default: 3)

        Returns:
            The embedding response dict (even if invalid - pipeline will handle skipping)
        """
        headers = {
            "Authorization": f"Bearer {self.async_client['api_key']}",
            "Content-Type": "application/json"
        }

        last_response = None
        model_name = api_kwargs.get('model', 'unknown')

        for attempt in range(max_retries):
            try:
                log.info(f"OpenRouter embeddings async call - model: {model_name} (attempt {attempt + 1}/{max_retries})")
                log.info(f"Making async OpenRouter embeddings API call to {self.async_client['base_url']}/embeddings")
                log.debug(f"Request body: {api_kwargs}")

                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        f"{self.async_client['base_url']}/embeddings",
                        headers=headers,
                        json=api_kwargs,
                        timeout=60
                    ) as response:
                        if response.status != 200:
                            error_text = await response.text()
                            log.error(f"OpenRouter embeddings API error ({response.status}): {error_text}")

                            # Don't sleep on the last attempt
                            if attempt < max_retries - 1:
                                sleep_time = 2 ** attempt
                                log.info(f"Retrying after {sleep_time} seconds...")
                                await asyncio.sleep(sleep_time)
                            continue

                        data = await response.json()
                        last_response = data
                        log.info(f"Received embeddings response from OpenRouter")
                        log.debug(f"Response: {data}")

                        # Validate the response
                        if self._validate_embedding_response(data):
                            if attempt > 0:
                                log.info(f"Successfully generated embeddings on attempt {attempt + 1}")
                            return data
                        else:
                            log.warning(f"Received invalid/empty embeddings on attempt {attempt + 1}/{max_retries}")

                            # Don't sleep on the last attempt
                            if attempt < max_retries - 1:
                                sleep_time = 2 ** attempt
                                log.info(f"Retrying after {sleep_time} seconds...")
                                await asyncio.sleep(sleep_time)

            except Exception as e:
                log.error(f"Error calling OpenRouter embeddings API on attempt {attempt + 1}/{max_retries}: {str(e)}")

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

    def convert_inputs_to_api_kwargs(
        self, input: Any, model_kwargs: Dict = None, model_type: ModelType = None
    ) -> Dict:
        """Convert AdalFlow inputs to OpenRouter API format."""
        model_kwargs = model_kwargs or {}

        if model_type == ModelType.LLM:
            # Handle LLM generation
            messages = []

            # Convert input to messages format if it's a string
            if isinstance(input, str):
                messages = [{"role": "user", "content": input}]
            elif isinstance(input, list) and all(isinstance(msg, dict) for msg in input):
                messages = input
            else:
                raise ValueError(f"Unsupported input format for OpenRouter: {type(input)}")

            # For debugging
            log.info(f"Messages for OpenRouter: {messages}")

            api_kwargs = {
                "messages": messages,
                **model_kwargs
            }

            # Ensure model is specified
            if "model" not in api_kwargs:
                api_kwargs["model"] = "openai/gpt-3.5-turbo"

            return api_kwargs

        elif model_type == ModelType.EMBEDDER:
            # Handle embeddings - OpenRouter supports embeddings via /embeddings endpoint
            # Convert input to list format
            if isinstance(input, str):
                input_list = [input]
            elif isinstance(input, Sequence):
                input_list = list(input)
            else:
                raise TypeError("input must be a string or sequence of strings")

            api_kwargs = {
                "input": input_list,
                **model_kwargs
            }

            # Ensure model is specified
            if "model" not in api_kwargs:
                api_kwargs["model"] = "openai/text-embedding-3-small"

            return api_kwargs

        else:
            raise ValueError(f"Unsupported model type: {model_type}")

    async def acall(self, api_kwargs: Dict = None, model_type: ModelType = None) -> Any:
        """Make an asynchronous call to the OpenRouter API."""
        log.info(f"OpenRouter async call - model_type: {model_type}")
        log.info(f"OpenRouter API kwargs: {api_kwargs}")
        log.debug(f"OpenRouter full API kwargs details: {api_kwargs}")
        
        if not self.async_client:
            log.debug("Initializing OpenRouter async client")
            self.async_client = self.init_async_client()

        # Check if API key is set
        if not self.async_client.get("api_key"):
            error_msg = "OPENROUTER_API_KEY not configured. Please set this environment variable to use OpenRouter."
            log.error(error_msg)
            raise ValueError(error_msg)

        api_kwargs = api_kwargs or {}

        if model_type == ModelType.LLM:
            # Prepare headers
            headers = {
                "Authorization": f"Bearer {self.async_client['api_key']}",
                "Content-Type": "application/json"
            }

            # Always use non-streaming mode for OpenRouter
            api_kwargs["stream"] = False

            # Make the API call
            try:
                model_name = api_kwargs.get('model', 'unknown')
                log.info(f"OpenRouter calling model: {model_name}")
                log.info(f"Making async OpenRouter API call to {self.async_client['base_url']}/chat/completions")
                log.debug(f"Request headers: {headers}")
                log.debug(f"Request body: {api_kwargs}")

                async with aiohttp.ClientSession() as session:
                    try:
                        async with session.post(
                            f"{self.async_client['base_url']}/chat/completions",
                            headers=headers,
                            json=api_kwargs,
                            # Increase timeout to 10 minutes (600 seconds)
                            timeout=600
                        ) as response:
                            if response.status != 200:
                                error_text = await response.text()
                                log.error(f"OpenRouter API error ({response.status}): {error_text}")
                                raise Exception(f"OpenRouter API error ({response.status}): {error_text}")

                            # Get the full response
                            data = await response.json()
                            log.info(f"Received response from OpenRouter: {data}")

                            # Create a generator that yields the content
                            async def content_generator():
                                if "choices" in data and len(data["choices"]) > 0:
                                    choice = data["choices"][0]
                                    if "message" in choice and "content" in choice["message"]:
                                        content = choice["message"]["content"]
                                        log.info("Successfully retrieved response")
                                        # XML validation is now handled in worker.py for all providers
                                        yield content
                                    else:
                                        log.error(f"Unexpected response format: {data}")
                                        raise Exception("Unexpected response format from OpenRouter API")
                                else:
                                    log.error(f"No choices in response: {data}")
                                    raise Exception("No response content from OpenRouter API")

                            return content_generator()
                    except aiohttp.ClientError as e:
                        log.error(f"Connection error with OpenRouter API: {str(e)}")
                        raise Exception(f"Connection error with OpenRouter API: {str(e)}. Please check your internet connection and that the OpenRouter API is accessible.")

            except RequestException as e:
                log.error(f"Error calling OpenRouter API asynchronously: {str(e)}")
                raise Exception(f"Error calling OpenRouter API: {str(e)}")

            except Exception as e:
                log.error(f"Unexpected error calling OpenRouter API asynchronously: {str(e)}")
                raise

        elif model_type == ModelType.EMBEDDER:
            # Handle embeddings with retry logic
            return await self._acall_embeddings_with_retry(api_kwargs)

        else:
            error_msg = f"Unsupported model type: {model_type}"
            log.error(error_msg)
            raise ValueError(error_msg)

    def call(self, api_kwargs: Dict = None, model_type: ModelType = None) -> Any:
        """Make a synchronous call to the OpenRouter API."""
        log.info(f"OpenRouter sync call - model_type: {model_type}")
        log.info(f"OpenRouter API kwargs: {api_kwargs}")
        log.debug(f"OpenRouter full API kwargs details: {api_kwargs}")

        if not self.sync_client:
            log.debug("Initializing OpenRouter sync client")
            self.sync_client = self.init_sync_client()

        # Check if API key is set
        if not self.sync_client.get("api_key"):
            error_msg = "OPENROUTER_API_KEY not configured. Please set this environment variable to use OpenRouter."
            log.error(error_msg)
            raise ValueError(error_msg)

        api_kwargs = api_kwargs or {}

        if model_type == ModelType.EMBEDDER:
            # Handle embeddings with retry logic
            return self._call_embeddings_with_retry(api_kwargs)

        elif model_type == ModelType.LLM:
            raise NotImplementedError("Sync LLM calls not implemented for OpenRouter. Use acall() instead.")

        else:
            raise ValueError(f"Unsupported model type: {model_type}")

    def parse_embedding_response(self, response) -> EmbedderOutput:
        """Parse OpenRouter embedding response to EmbedderOutput format."""
        try:
            # OpenRouter returns a dict, not an object with .data attribute
            # Handle both dict and object-like responses
            if isinstance(response, dict):
                # Extract embeddings from dict response
                embeddings_data = response.get('data', [])
                log.debug(f"Parsing {len(embeddings_data)} embeddings from OpenRouter response")

                # Create Embedding objects with proper structure
                # Each item in embeddings_data has: {"object": "embedding", "embedding": [...], "index": 0}
                embedding_objects = [
                    Embedding(
                        embedding=item.get('embedding', []),
                        index=item.get('index', i)
                    )
                    for i, item in enumerate(embeddings_data)
                ]

                log.debug(f"Created {len(embedding_objects)} Embedding objects")

                # Extract usage information if available
                usage = None
                if 'usage' in response:
                    usage = Usage(
                        prompt_tokens=response['usage'].get('prompt_tokens', 0),
                        total_tokens=response['usage'].get('total_tokens', 0)
                    )

                # Extract model name
                model = response.get('model', None)

                return EmbedderOutput(
                    data=embedding_objects,
                    model=model,
                    usage=usage,
                    raw_response=response
                )
            else:
                # Try the utility function for object-like responses
                return parse_embedding_response(response)
        except Exception as e:
            log.error(f"Error parsing OpenRouter embedding response: {e}")
            return EmbedderOutput(data=[], error=str(e), raw_response=response)

    def _process_completion_response(self, data: Dict) -> GeneratorOutput:
        """Process a non-streaming completion response from OpenRouter."""
        try:
            # Extract the completion text from the response
            if not data.get("choices"):
                raise ValueError(f"No choices in OpenRouter response: {data}")

            choice = data["choices"][0]

            if "message" in choice:
                content = choice["message"].get("content", "")
            elif "text" in choice:
                content = choice.get("text", "")
            else:
                raise ValueError(f"Unexpected response format from OpenRouter: {choice}")

            # Extract usage information if available
            usage = None
            if "usage" in data:
                usage = CompletionUsage(
                    prompt_tokens=data["usage"].get("prompt_tokens", 0),
                    completion_tokens=data["usage"].get("completion_tokens", 0),
                    total_tokens=data["usage"].get("total_tokens", 0)
                )

            # Create and return the GeneratorOutput
            return GeneratorOutput(
                data=content,
                usage=usage,
                raw_response=data
            )

        except Exception as e_proc:
            log.error(f"Error processing OpenRouter completion response: {str(e_proc)}")
            raise

    def _process_streaming_response(self, response):
        """Process a streaming response from OpenRouter."""
        try:
            log.info("Starting to process streaming response from OpenRouter")
            buffer = ""

            for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                try:
                    # Add chunk to buffer
                    buffer += chunk

                    # Process complete lines in the buffer
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()

                        if not line:
                            continue

                        log.debug(f"Processing line: {line}")

                        # Skip SSE comments (lines starting with :)
                        if line.startswith(':'):
                            log.debug(f"Skipping SSE comment: {line}")
                            continue

                        if line.startswith("data: "):
                            data = line[6:]  # Remove "data: " prefix

                            # Check for stream end
                            if data == "[DONE]":
                                log.info("Received [DONE] marker")
                                break

                            try:
                                data_obj = json.loads(data)
                                log.debug(f"Parsed JSON data: {data_obj}")

                                # Extract content from delta
                                if "choices" in data_obj and len(data_obj["choices"]) > 0:
                                    choice = data_obj["choices"][0]

                                    if "delta" in choice and "content" in choice["delta"] and choice["delta"]["content"]:
                                        content = choice["delta"]["content"]
                                        log.debug(f"Yielding delta content: {content}")
                                        yield content
                                    elif "text" in choice:
                                        log.debug(f"Yielding text content: {choice['text']}")
                                        yield choice["text"]
                                    else:
                                        log.debug(f"No content found in choice: {choice}")
                                else:
                                    log.debug(f"No choices found in data: {data_obj}")

                            except json.JSONDecodeError:
                                log.warning(f"Failed to parse SSE data: {data}")
                                continue
                except Exception as e_chunk:
                    log.error(f"Error processing streaming chunk: {str(e_chunk)}")
                    raise Exception(f"Error processing response chunk: {str(e_chunk)}")
        except Exception as e_stream:
            log.error(f"Error in streaming response: {str(e_stream)}")
            raise

    async def _process_async_streaming_response(self, response):
        """Process an asynchronous streaming response from OpenRouter."""
        buffer = ""
        try:
            log.info("Starting to process async streaming response from OpenRouter")
            async for chunk in response.content:
                try:
                    # Convert bytes to string and add to buffer
                    if isinstance(chunk, bytes):
                        chunk_str = chunk.decode('utf-8')
                    else:
                        chunk_str = str(chunk)

                    buffer += chunk_str

                    # Process complete lines in the buffer
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()

                        if not line:
                            continue

                        log.debug(f"Processing line: {line}")

                        # Skip SSE comments (lines starting with :)
                        if line.startswith(':'):
                            log.debug(f"Skipping SSE comment: {line}")
                            continue

                        if line.startswith("data: "):
                            data = line[6:]  # Remove "data: " prefix

                            # Check for stream end
                            if data == "[DONE]":
                                log.info("Received [DONE] marker")
                                break

                            try:
                                data_obj = json.loads(data)
                                log.debug(f"Parsed JSON data: {data_obj}")

                                # Extract content from delta
                                if "choices" in data_obj and len(data_obj["choices"]) > 0:
                                    choice = data_obj["choices"][0]

                                    if "delta" in choice and "content" in choice["delta"] and choice["delta"]["content"]:
                                        content = choice["delta"]["content"]
                                        log.debug(f"Yielding delta content: {content}")
                                        yield content
                                    elif "text" in choice:
                                        log.debug(f"Yielding text content: {choice['text']}")
                                        yield choice["text"]
                                    else:
                                        log.debug(f"No content found in choice: {choice}")
                                else:
                                    log.debug(f"No choices found in data: {data_obj}")

                            except json.JSONDecodeError:
                                log.warning(f"Failed to parse SSE data: {data}")
                                continue
                except Exception as e_chunk:
                    log.error(f"Error processing streaming chunk: {str(e_chunk)}")
                    raise Exception(f"Error processing response chunk: {str(e_chunk)}")
        except Exception as e_stream:
            log.error(f"Error in async streaming response: {str(e_stream)}")
            raise
