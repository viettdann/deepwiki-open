import os

from api.zhipu_openai_client import ZhipuOpenAIClient
from api.zhipu_anthropic_client import ZhipuAnthropicClient
from adalflow.core.types import ModelType


def test_zhipu_openai_base_url(monkeypatch):
    monkeypatch.setenv("ZHIPU_CODING_PLAN_API_KEY", "test-key")
    monkeypatch.setenv("ZHIPU_CODING_PLAN_BASE_URL", "https://example.com/openai")

    client = ZhipuOpenAIClient()

    assert client.base_url == "https://example.com/openai"


def test_zhipu_anthropic_base_url(monkeypatch):
    monkeypatch.setenv("ZHIPU_CODING_PLAN_API_KEY", "test-key")
    monkeypatch.setenv("ZHIPU_ANTHROPIC_CODING_PLAN_BASE_URL", "https://example.com/anthropic")

    client = ZhipuAnthropicClient()

    assert client._base_url == "https://example.com/anthropic"
    assert client.sync_client.base_url == "https://example.com/anthropic"


def test_zhipu_anthropic_message_conversion(monkeypatch):
    monkeypatch.setenv("ZHIPU_CODING_PLAN_API_KEY", "test-key")
    client = ZhipuAnthropicClient()

    api_kwargs = client.convert_inputs_to_api_kwargs(
        input="hello world",
        model_kwargs={"model": "glm-4.6", "temperature": 0.3, "top_p": 0.9},
        model_type=ModelType.LLM,
    )

    assert api_kwargs["messages"][0]["role"] == "user"
    assert api_kwargs["messages"][0]["content"] == "hello world"
    assert "max_tokens" in api_kwargs
    # top_p should be dropped when temperature is present for Anthropic compatibility
    assert "top_p" not in api_kwargs
