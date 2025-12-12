"""Azure OpenAI ModelClient with High Availability (HA) support for multiple endpoints.

This client extends the existing AzureAIClient to support multiple Azure endpoints
with automatic failover when rate limits are hit. Each endpoint has its own
API key and URL configuration.
"""

import os
import json
import logging
from typing import Optional, Callable, Any, Dict, TypeVar, Generator, Union, Sequence, List
from dataclasses import dataclass, field
from collections import defaultdict

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
from api.azureai_client import AzureAIClient

log = logging.getLogger(__name__)
T = TypeVar("T")


@dataclass
class AzureEndpoint:
    """Configuration for a single Azure endpoint."""
    name: str
    endpoint: str
    api_key: str
    api_version: str = "2025-04-01-preview"
    use_v1: bool = False
    rate_limit_until: Optional[float] = None  # Timestamp until which this endpoint is rate limited
    failure_count: int = 0  # Track consecutive failures

    def __post_init__(self):
        """Convert rate_limit_until to float if it's a string."""
        if isinstance(self.rate_limit_until, str):
            self.rate_limit_until = float(self.rate_limit_until)

    @property
    def is_rate_limited(self) -> bool:
        """Check if this endpoint is currently rate limited."""
        if self.rate_limit_until is None:
            return False
        import time
        return time.time() < self.rate_limit_until

    def mark_rate_limited(self, retry_after_seconds: int = 60):
        """Mark this endpoint as rate limited until the specified time."""
        import time
        self.rate_limit_until = time.time() + retry_after_seconds
        log.warning(f"Azure endpoint '{self.name}' marked as rate limited until {self.rate_limit_until}")

    def reset_rate_limit(self):
        """Reset the rate limit status for this endpoint."""
        self.rate_limit_until = None
        self.failure_count = 0
        log.debug(f"Azure endpoint '{self.name}' rate limit status reset")

    def increment_failure(self):
        """Increment the failure count for this endpoint."""
        self.failure_count += 1
        log.warning(f"Azure endpoint '{self.name}' failure count: {self.failure_count}")


class AzureHAClient(AzureAIClient):
    """Azure OpenAI client with High Availability (HA) support for multiple endpoints.

    This client manages multiple Azure OpenAI endpoints and automatically
    switches to an alternative endpoint when one hits rate limits or fails.
    """

    def __init__(
        self,
        chat_completion_parser: Callable[[Any], Any] = None,
        input_type: str = "text",
        endpoints_config: Optional[str] = None,
    ):
        # Initialize with empty endpoint list - will be populated in _init_endpoints
        self.endpoints: List[AzureEndpoint] = []
        self.current_endpoint_index = 0
        self.endpoints_config = endpoints_config or os.getenv("AZURE_HA_CONFIG")

        # Initialize endpoints before calling parent constructor
        self._init_endpoints()

        # Set the current endpoint as the active one for parent class
        current = self.get_current_endpoint()

        # Call parent constructor with current endpoint details
        super().__init__(
            api_key=current.api_key,
            chat_completion_parser=chat_completion_parser,
            input_type=input_type,
            api_version=current.api_version,
            azure_endpoint=current.endpoint,
        )

        # Override the v1 setting from the current endpoint
        self._use_v1 = current.use_v1

    def _init_endpoints(self):
        """Initialize Azure endpoints from configuration."""
        # Method 1: Use JSON configuration file
        if self.endpoints_config and os.path.exists(self.endpoints_config):
            try:
                with open(self.endpoints_config, 'r') as f:
                    config = json.load(f)
                    self._parse_endpoints_config(config)
                log.info(f"Loaded {len(self.endpoints)} Azure endpoints from {self.endpoints_config}")
                return
            except Exception as e:
                log.error(f"Failed to load Azure endpoints config from {self.endpoints_config}: {e}")

        # Method 2: Use array format in environment variable (most concise)
        azure_embedding_ha = os.getenv("AZURE_EMBEDDING_HA")
        if azure_embedding_ha:
            try:
                # Parse format: ["endpoint1:key1", "endpoint2:key2"]
                # or format: ["endpoint1:key1:version1", "endpoint2:key2:version2", ...]
                import ast
                endpoint_list = ast.literal_eval(azure_embedding_ha)

                for i, endpoint_str in enumerate(endpoint_list, 1):
                    # Split on the first ':' to separate endpoint from key
                    # Then check if there's a second ':' for version
                    if ':' in endpoint_str:
                        # Split endpoint and key
                        endpoint, remainder = endpoint_str.split(':', 1)
                        parts = remainder.split(':', 1)
                        api_key = parts[0]
                        api_version = parts[1] if len(parts) > 1 else "2025-04-01-preview"

                        # Ensure endpoint has protocol
                        if not endpoint.startswith(('http://', 'https://')):
                            endpoint = f"https://{endpoint}"

                        self.endpoints.append(AzureEndpoint(
                            name=f"endpoint_{i}",
                            endpoint=endpoint,
                            api_key=api_key,
                            api_version=api_version,
                            use_v1=False
                        ))

                if self.endpoints:
                    log.info(f"Loaded {len(self.endpoints)} Azure endpoints from AZURE_EMBEDDING_HA array")
                    return

            except (ValueError, SyntaxError) as e:
                log.error(f"Failed to parse AZURE_EMBEDDING_HA array: {e}")
            except Exception as e:
                log.error(f"Error processing AZURE_EMBEDDING_HA: {e}")

        # Method 3: Use JSON string in environment variable
        azure_ha_endpoints = os.getenv("AZURE_HA_ENDPOINTS")
        if azure_ha_endpoints:
            try:
                config = json.loads(azure_ha_endpoints)
                self._parse_endpoints_config(config)
                log.info(f"Loaded {len(self.endpoints)} Azure endpoints from AZURE_HA_ENDPOINTS")
                return
            except json.JSONDecodeError as e:
                log.error(f"Failed to parse AZURE_HA_ENDPOINTS JSON: {e}")

        # Method 4: Use numbered environment variables (fallback)
        # Support multiple endpoints numbered: AZURE_HA_ENDPOINT_1, AZURE_HA_KEY_1, etc.
        endpoint_keys = [k for k in os.environ.keys() if k.startswith('AZURE_HA_ENDPOINT_')]
        if endpoint_keys:
            self._parse_env_endpoints(endpoint_keys)
            if self.endpoints:
                log.info(f"Loaded {len(self.endpoints)} Azure endpoints from environment variables")
                return

        # Method 5: Fallback to single endpoint configuration
        # This maintains backward compatibility with existing single endpoint setup
        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        api_key = os.getenv("AZURE_OPENAI_API_KEY")
        api_version = os.getenv("AZURE_OPENAI_VERSION", "2025-04-01-preview")
        use_v1 = os.getenv("AZURE_OPENAI_USE_V1", "false").lower() in ("1", "true", "yes")

        if endpoint and api_key:
            self.endpoints.append(AzureEndpoint(
                name="default",
                endpoint=endpoint,
                api_key=api_key,
                api_version=api_version,
                use_v1=use_v1
            ))
            log.info("Using default single Azure endpoint configuration")
        else:
            raise ValueError("No Azure HA endpoints configured. Please set either AZURE_EMBEDDING_HA, AZURE_HA_CONFIG, AZURE_HA_ENDPOINTS, or AZURE_HA_ENDPOINT_1/KEY_1 pair(s)")

    def _parse_endpoints_config(self, config: Dict):
        """Parse endpoints from JSON configuration."""
        if 'endpoints' not in config:
            raise ValueError("Invalid config: 'endpoints' key not found")

        for ep_config in config['endpoints']:
            self.endpoints.append(AzureEndpoint(
                name=ep_config['name'],
                endpoint=ep_config['endpoint'],
                api_key=ep_config['api_key'],
                api_version=ep_config.get('api_version', '2025-04-01-preview'),
                use_v1=ep_config.get('use_v1', False)
            ))

    def _parse_env_endpoints(self, endpoint_keys):
        """Parse endpoints from numbered environment variables."""
        # Extract numbers from keys like AZURE_HA_ENDPOINT_1 -> 1
        indices = set()
        for key in endpoint_keys:
            try:
                suffix = key.split('_')[-1]
                indices.add(int(suffix))
            except (ValueError, IndexError):
                continue

        # Create endpoints for each index
        for idx in sorted(indices):
            endpoint = os.getenv(f"AZURE_HA_ENDPOINT_{idx}")
            api_key = os.getenv(f"AZURE_HA_KEY_{idx}")
            api_version = os.getenv(f"AZURE_HA_VERSION_{idx}", "2025-04-01-preview")
            use_v1 = os.getenv(f"AZURE_HA_USE_V1_{idx}", "false").lower() in ("1", "true", "yes")

            if endpoint and api_key:
                self.endpoints.append(AzureEndpoint(
                    name=f"endpoint_{idx}",
                    endpoint=endpoint,
                    api_key=api_key,
                    api_version=api_version,
                    use_v1=use_v1
                ))

    def get_current_endpoint(self) -> AzureEndpoint:
        """Get the currently selected endpoint."""
        if not self.endpoints:
            raise ValueError("No Azure endpoints available")
        return self.endpoints[self.current_endpoint_index]

    def get_available_endpoints(self) -> List[AzureEndpoint]:
        """Get all endpoints that are not currently rate limited."""
        return [ep for ep in self.endpoints if not ep.is_rate_limited]

    def select_next_available_endpoint(self) -> bool:
        """Select the next available endpoint.

        Returns:
            bool: True if an available endpoint was found, False otherwise.
        """
        available = self.get_available_endpoints()
        if not available:
            log.error("All Azure endpoints are rate limited")
            return False

        # Find the next available endpoint (circular)
        start_idx = self.current_endpoint_index
        for i in range(len(self.endpoints)):
            idx = (start_idx + 1 + i) % len(self.endpoints)
            if not self.endpoints[idx].is_rate_limited:
                self.current_endpoint_index = idx
                current = self.get_current_endpoint()

                # Update parent class attributes
                self._azure_endpoint = current.endpoint
                self._api_key = current.api_key
                self._api_version = current.api_version
                self._use_v1 = current.use_v1

                # Reinitialize clients
                self.sync_client = None
                self.async_client = None

                log.info(f"Switched to Azure endpoint: {current.name} ({current.endpoint})")
                return True

        return False

    def _handle_rate_limit_error(self, error: RateLimitError):
        """Handle rate limit error by marking current endpoint and switching."""
        current = self.get_current_endpoint()

        # Try to extract retry-after from the error
        retry_after = 60  # Default to 60 seconds
        if hasattr(error, 'response') and error.response is not None:
            retry_after_header = error.response.headers.get('retry-after')
            if retry_after_header:
                try:
                    retry_after = int(retry_after_header)
                except ValueError:
                    pass

        current.mark_rate_limited(retry_after)
        log.warning(f"Rate limit hit on endpoint '{current.name}', retrying after {retry_after} seconds")

        # Try to switch to next available endpoint
        if self.select_next_available_endpoint():
            return True  # Successfully switched
        else:
            log.error("No available endpoints to switch to")
            return False  # No endpoints available

    def _handle_api_error(self, error: Exception):
        """Handle other API errors by tracking failure counts."""
        current = self.get_current_endpoint()
        current.increment_failure()

        # If an endpoint fails too many times, temporarily mark it as rate limited
        if current.failure_count >= 3:
            current.mark_rate_limited(90)  # 90 seconds cooldown
            log.warning(f"Endpoint '{current.name}' marked as unavailable due to repeated failures")
            self.select_next_available_endpoint()

    def init_sync_client(self):
        """Initialize sync client with current endpoint settings."""
        current = self.get_current_endpoint()

        if current.use_v1:
            base_url = current.endpoint.rstrip("/") + "/openai/v1"
            log.debug("Initializing OpenAI sync client against Azure v1 endpoint %s for endpoint %s",
                     base_url, current.name)
            return OpenAI(
                api_key=current.api_key,
                base_url=base_url,
                default_headers={"api-key": current.api_key},
            )

        log.debug("Initializing AzureOpenAI sync client for endpoint %s", current.name)
        return AzureOpenAI(
            api_key=current.api_key,
            azure_endpoint=current.endpoint,
            api_version=current.api_version,
        )

    def init_async_client(self):
        """Initialize async client with current endpoint settings."""
        current = self.get_current_endpoint()

        if current.use_v1:
            base_url = current.endpoint.rstrip("/") + "/openai/v1"
            log.debug("Initializing OpenAI async client against Azure v1 endpoint %s for endpoint %s",
                     base_url, current.name)
            return AsyncOpenAI(
                api_key=current.api_key,
                base_url=base_url,
                default_headers={"api-key": current.api_key},
            )

        log.debug("Initializing AzureOpenAI async client for endpoint %s", current.name)
        return AsyncAzureOpenAI(
            api_key=current.api_key,
            azure_endpoint=current.endpoint,
            api_version=current.api_version,
        )

    def call(self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED):
        """Sync call with automatic fallback on rate limits."""
        max_retries = len(self.endpoints) * 2  # Allow multiple rounds through all endpoints
        last_error = None

        for attempt in range(max_retries):
            current = self.get_current_endpoint()

            try:
                # Ensure we have a client for the current endpoint
                if self.sync_client is None:
                    self.sync_client = self.init_sync_client()

                # Use parent's call method but with fallback logic
                return super().call(api_kwargs=api_kwargs, model_type=model_type)

            except RateLimitError as e:
                last_error = e
                log.warning(f"Rate limit error on endpoint '{current.name}' (attempt {attempt + 1}/{max_retries})")

                # Mark current endpoint as rate limited and try to switch
                if self._handle_rate_limit_error(e):
                    self.sync_client = None  # Reset client to use new endpoint
                    continue  # Retry with new endpoint

                # No more endpoints available, raise the error
                break

            except (APITimeoutError, InternalServerError, UnprocessableEntityError, BadRequestError) as e:
                last_error = e
                self._handle_api_error(e)

                if attempt < max_retries - 1:
                    # Try with next endpoint
                    if self.select_next_available_endpoint():
                        self.sync_client = None
                        continue

                # If we've exhausted retries, break
                break

        # If we get here, all retries failed
        log.error("All Azure endpoints failed or are rate limited")
        raise last_error or RuntimeError("All Azure endpoints are unavailable")

    async def acall(
        self, api_kwargs: Dict = {}, model_type: ModelType = ModelType.UNDEFINED
    ):
        """Async call with automatic fallback on rate limits."""
        max_retries = len(self.endpoints) * 2
        last_error = None

        for attempt in range(max_retries):
            current = self.get_current_endpoint()

            try:
                # Ensure we have a client for the current endpoint
                if self.async_client is None:
                    self.async_client = self.init_async_client()

                # Use parent's acall method but with fallback logic
                return await super().acall(api_kwargs=api_kwargs, model_type=model_type)

            except RateLimitError as e:
                last_error = e
                log.warning(f"Rate limit error on endpoint '{current.name}' (attempt {attempt + 1}/{max_retries})")

                # Mark current endpoint as rate limited and try to switch
                if self._handle_rate_limit_error(e):
                    self.async_client = None  # Reset client to use new endpoint
                    continue  # Retry with new endpoint

                # No more endpoints available, raise the error
                break

            except (APITimeoutError, InternalServerError, UnprocessableEntityError, BadRequestError) as e:
                last_error = e
                self._handle_api_error(e)

                if attempt < max_retries - 1:
                    # Try with next endpoint
                    if self.select_next_available_endpoint():
                        self.async_client = None
                        continue

                # If we've exhausted retries, break
                break

        # If we get here, all retries failed
        log.error("All Azure endpoints failed or are rate limited")
        raise last_error or RuntimeError("All Azure endpoints are unavailable")