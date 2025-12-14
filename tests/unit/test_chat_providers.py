import pytest

from api.chat_providers import (
    ProviderRoute,
    build_provider_route,
    prepare_prompt_for_provider,
    stream_tokens,
    stream_with_fallback,
)


def test_prepare_prompt_for_ollama_adds_no_think():
    prompt = "hello"
    assert prepare_prompt_for_provider("ollama", prompt).endswith("/no_think")


def test_prepare_prompt_other_providers_unchanged():
    prompt = "hello"
    assert prepare_prompt_for_provider("openai", prompt) == prompt


@pytest.mark.asyncio
async def test_stream_tokens_openai_style_parses_delta_content():
    class Delta:
        def __init__(self, content: str):
            self.content = content

    class Choice:
        def __init__(self, delta):
            self.delta = delta

    class Chunk:
        def __init__(self, text: str):
            self.choices = [Choice(Delta(text))]

    async def fake_response():
        yield Chunk("hi")

    async def fake_call(prompt: str):  # pylint: disable=unused-argument
        return fake_response()

    route = ProviderRoute(provider="openai", call=fake_call, stream_style="openai")

    tokens = []
    async for tok in stream_tokens(route, "prompt"):
        tokens.append(tok)

    assert tokens == ["hi"]


@pytest.mark.asyncio
async def test_stream_tokens_anthropic_events_handles_deltas():
    class Delta:
        def __init__(self, text: str):
            self.text = text

    class Event:
        def __init__(self, type_, text=None):
            self.type = type_
            self.delta = Delta(text) if text else None

    async def fake_response():
        yield Event("content_block_delta", text="part1")
        yield Event("message_delta", text="part2")
        yield Event("message_stop")

    async def fake_call(prompt: str):  # pylint: disable=unused-argument
        return fake_response()

    route = ProviderRoute(provider="anthropic", call=fake_call, stream_style="anthropic_events")

    tokens = []
    async for tok in stream_tokens(route, "prompt"):
        tokens.append(tok)

    assert tokens == ["part1", "part2"]


@pytest.mark.asyncio
async def test_stream_with_fallback_retries_on_token_error():
    class Delta:
        def __init__(self, content: str):
            self.content = content

    class Choice:
        def __init__(self, delta):
            self.delta = delta

    class Chunk:
        def __init__(self, text: str):
            self.choices = [Choice(Delta(text))]

    async def fake_response_success():
        yield Chunk("ok")

    async def fake_call(prompt: str):
        if "<START_OF_CONTEXT>" in prompt:
            raise Exception("maximum context length exceeded")
        return fake_response_success()

    route = ProviderRoute(provider="openai", call=fake_call, stream_style="openai")

    primary_prompt = "<START_OF_CONTEXT> big prompt"
    fallback_prompt = "no context"

    tokens = []
    async for tok in stream_with_fallback(route, primary_prompt, fallback_prompt):
        tokens.append(tok)

    assert tokens == ["ok"]


def test_build_provider_route_sets_stream_style():
    route = build_provider_route("openai", "gpt-4o", {"temperature": 0.1})
    assert route.stream_style == "openai"
