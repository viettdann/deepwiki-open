"""Zhipu Coding Plan OpenAI-compatible client."""

import os
import logging
from typing import Optional, Callable, Any, Dict, TypeVar, Generator, Union, Sequence, List

from api.openai_client import OpenAIClient

log = logging.getLogger(__name__)
T = TypeVar("T")


class ZhipuOpenAIClient(OpenAIClient):
    """OpenAI-compatible client for Zhipu Coding Plan.

    Defaults to the Coding Plan base URL and dedicated env vars so it stays
    isolated from standard Zhipu/OpenAI endpoints.

    Environment variables:
        ZHIPU_CODING_PLAN_API_KEY: API key for Coding Plan
        ZHIPU_CODING_PLAN_BASE_URL: Optional override of base URL
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        chat_completion_parser: Callable[[Any], Any] = None,
        input_type: str = "text",
        base_url: Optional[str] = None,
    ):
        super().__init__(
            api_key=api_key,
            chat_completion_parser=chat_completion_parser,
            input_type=input_type,
            base_url=base_url or os.getenv(
                "ZHIPU_CODING_PLAN_BASE_URL",
                "https://api.z.ai/api/coding/paas/v4",
            ),
            env_base_url_name="ZHIPU_CODING_PLAN_BASE_URL",
            env_api_key_name="ZHIPU_CODING_PLAN_API_KEY",
        )
