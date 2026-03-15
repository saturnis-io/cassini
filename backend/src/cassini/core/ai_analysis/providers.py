"""LLM provider abstraction for chart analysis.

Supports native tool-use for Claude and OpenAI providers, and a system-prompt
fallback for Gemini and OpenAI-compatible providers.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any

import httpx
import structlog

from cassini.core.ai_analysis.tools import (
    LLMResponse,
    ToolCall,
    ToolDef,
    ToolResult,
)

logger = structlog.get_logger(__name__)

_DEFAULT_TIMEOUT = 60.0


class BaseLLMProvider(ABC):
    """Abstract base for LLM API providers."""

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        """Send a prompt to the LLM and return the structured response.

        Args:
            system_prompt: System-level instructions.
            user_prompt: User message content.
            tools: Optional tool definitions the LLM may invoke.
            tool_results: Results from prior tool calls to feed back.
            prior_messages: Raw message history for multi-turn conversations.
        """


# ---------------------------------------------------------------------------
# Claude (Anthropic Messages API)
# ---------------------------------------------------------------------------


class ClaudeProvider(BaseLLMProvider):
    """Anthropic Claude Messages API provider with native tool-use."""

    _DEFAULT_URL = "https://api.anthropic.com/v1/messages"

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 1024,
        base_url: str | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens
        self._url = base_url.rstrip("/") if base_url else self._DEFAULT_URL

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        # Build messages list
        if prior_messages:
            messages = list(prior_messages)
        else:
            messages = [{"role": "user", "content": user_prompt}]

        # If we have tool results, append assistant + tool_result blocks
        if tool_results:
            # The prior_messages should already contain the assistant's
            # tool_use response. Add the user's tool_result message.
            tool_result_blocks = [
                {
                    "type": "tool_result",
                    "tool_use_id": tr.call_id,
                    "content": tr.content,
                }
                for tr in tool_results
            ]
            messages.append({"role": "user", "content": tool_result_blocks})

        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "system": system_prompt,
            "messages": messages,
        }

        # Add tool definitions if provided
        if tools:
            body["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                }
                for t in tools
            ]

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        return _parse_claude_response(data, self._model, messages)


def _parse_claude_response(
    data: dict[str, Any], model: str, messages: list[dict]
) -> LLMResponse:
    """Parse a Claude Messages API response into an LLMResponse."""
    content_blocks = data.get("content", [])
    usage = data.get("usage", {})
    stop_reason = data.get("stop_reason", "end_turn")

    text_parts: list[str] = []
    tool_calls: list[ToolCall] = []

    for block in content_blocks:
        if block.get("type") == "text":
            text_parts.append(block["text"])
        elif block.get("type") == "tool_use":
            tool_calls.append(
                ToolCall(
                    tool_name=block["name"],
                    tool_input=block.get("input", {}),
                    call_id=block["id"],
                )
            )

    # Build updated message history for multi-turn threading
    updated_messages = list(messages)
    updated_messages.append({"role": "assistant", "content": content_blocks})

    return LLMResponse(
        content="\n".join(text_parts) if text_parts else None,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        model=model,
        tool_calls=tool_calls,
        stop_reason="tool_use" if stop_reason == "tool_use" else "end_turn",
        _raw_messages=updated_messages,
    )


# ---------------------------------------------------------------------------
# OpenAI Chat Completions API
# ---------------------------------------------------------------------------


class OpenAIProvider(BaseLLMProvider):
    """OpenAI Chat Completions API provider with native tool-use."""

    _DEFAULT_BASE = "https://api.openai.com"

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        max_tokens: int = 1024,
        base_url: str | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens
        base = base_url.rstrip("/") if base_url else self._DEFAULT_BASE
        self._url = f"{base}/v1/chat/completions"

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        # Build messages
        if prior_messages:
            messages = list(prior_messages)
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

        # Append tool result messages if present
        if tool_results:
            for tr in tool_results:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tr.call_id,
                        "content": tr.content,
                    }
                )

        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "messages": messages,
        }

        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                }
                for t in tools
            ]

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()

        return _parse_openai_response(data, self._model, messages)


# ---------------------------------------------------------------------------
# OpenAI-compatible (vLLM, Ollama, LM Studio, TGI, etc.)
# ---------------------------------------------------------------------------


class OpenAICompatibleProvider(BaseLLMProvider):
    """OpenAI-compatible provider for vLLM, Ollama, LM Studio, TGI, Bedrock, etc.

    Uses the same request/response schema as OpenAI but with a user-provided
    base URL. API key is optional (many local servers need no auth).

    Tool-use: if tools are provided but the server doesn't support native
    function calling, the tool descriptions are embedded in the system prompt
    as a fallback.
    """

    def __init__(
        self,
        base_url: str,
        model: str = "default",
        max_tokens: int = 1024,
        api_key: str | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens
        self._url = f"{base_url.rstrip('/')}/v1/chat/completions"

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        # Fallback: embed tool descriptions in system prompt
        effective_system = system_prompt
        if tools and not tool_results:
            effective_system = _embed_tools_in_prompt(system_prompt, tools)

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        messages: list[dict[str, str]]
        if prior_messages:
            messages = list(prior_messages)
        else:
            messages = [
                {"role": "system", "content": effective_system},
                {"role": "user", "content": user_prompt},
            ]

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers=headers,
                json={
                    "model": self._model,
                    "max_tokens": self._max_tokens,
                    "messages": messages,
                },
            )
            response.raise_for_status()
            data = response.json()

            return _parse_openai_response(data, self._model)


# ---------------------------------------------------------------------------
# Azure OpenAI
# ---------------------------------------------------------------------------


class AzureOpenAIProvider(BaseLLMProvider):
    """Azure OpenAI Service provider.

    URL pattern: https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions
    Auth: api-key header (not Bearer token).
    Response schema matches OpenAI. Supports native tool-use.
    """

    def __init__(
        self,
        api_key: str,
        resource_name: str,
        deployment_id: str,
        api_version: str = "2024-10-21",
        max_tokens: int = 1024,
    ):
        self._api_key = api_key
        self._max_tokens = max_tokens
        self._model = deployment_id
        self._url = (
            f"https://{resource_name}.openai.azure.com"
            f"/openai/deployments/{deployment_id}/chat/completions"
            f"?api-version={api_version}"
        )

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        if prior_messages:
            messages = list(prior_messages)
        else:
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

        if tool_results:
            for tr in tool_results:
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tr.call_id,
                        "content": tr.content,
                    }
                )

        body: dict[str, Any] = {
            "max_tokens": self._max_tokens,
            "messages": messages,
        }

        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                }
                for t in tools
            ]

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "api-key": self._api_key,
                    "Content-Type": "application/json",
                },
                json=body,
            )
            response.raise_for_status()
            data = response.json()

            return _parse_openai_response(data, self._model, messages)


# ---------------------------------------------------------------------------
# Google Gemini
# ---------------------------------------------------------------------------


class GeminiProvider(BaseLLMProvider):
    """Google Gemini API provider.

    Translates OpenAI-style system/user messages to Gemini's
    contents/candidates schema. Auth via x-goog-api-key header.

    Tool-use: embeds tool descriptions in the system prompt as a fallback
    since we don't implement Gemini's native function calling protocol.
    """

    _DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
        max_tokens: int = 1024,
        base_url: str | None = None,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens
        base = base_url.rstrip("/") if base_url else self._DEFAULT_BASE
        self._url = f"{base}/models/{model}:generateContent"

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        tools: list[ToolDef] | None = None,
        tool_results: list[ToolResult] | None = None,
        prior_messages: list[dict] | None = None,
    ) -> LLMResponse:
        # Fallback: embed tool descriptions in system prompt
        effective_system = system_prompt
        if tools and not tool_results:
            effective_system = _embed_tools_in_prompt(system_prompt, tools)

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self._api_key,
                },
                json={
                    "system_instruction": {
                        "parts": [{"text": effective_system}],
                    },
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": user_prompt}],
                        }
                    ],
                    "generationConfig": {
                        "maxOutputTokens": self._max_tokens,
                    },
                },
            )
            response.raise_for_status()
            data = response.json()

            # Parse Gemini response format
            candidates = data.get("candidates", [])
            if not candidates:
                raise ValueError("Gemini returned no candidates")

            parts = candidates[0].get("content", {}).get("parts", [])
            content = "".join(p.get("text", "") for p in parts)

            usage = data.get("usageMetadata", {})

            return LLMResponse(
                content=content,
                input_tokens=usage.get("promptTokenCount", 0),
                output_tokens=usage.get("candidatesTokenCount", 0),
                model=self._model,
            )


# ---------------------------------------------------------------------------
# Shared parsing helpers
# ---------------------------------------------------------------------------


def _parse_openai_response(
    data: dict[str, Any],
    model: str,
    messages: list[dict] | None = None,
) -> LLMResponse:
    """Parse an OpenAI-compatible chat completions response."""
    choice = data["choices"][0]
    message = choice["message"]
    usage = data.get("usage", {})
    finish_reason = choice.get("finish_reason", "stop")

    content = message.get("content")
    tool_calls: list[ToolCall] = []

    # Extract tool calls if present
    raw_tool_calls = message.get("tool_calls", [])
    for tc in raw_tool_calls:
        fn = tc.get("function", {})
        try:
            tool_input = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            tool_input = {}
        tool_calls.append(
            ToolCall(
                tool_name=fn.get("name", ""),
                tool_input=tool_input,
                call_id=tc.get("id", ""),
            )
        )

    # Build updated message history for multi-turn threading
    updated_messages: list[dict] = []
    if messages:
        updated_messages = list(messages)
        updated_messages.append(message)

    stop = "tool_use" if finish_reason == "tool_calls" else "end_turn"

    return LLMResponse(
        content=content,
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
        model=model,
        tool_calls=tool_calls,
        stop_reason=stop,
        _raw_messages=updated_messages,
    )


def _embed_tools_in_prompt(
    system_prompt: str, tools: list[ToolDef]
) -> str:
    """Embed tool descriptions in the system prompt as a fallback.

    Used for providers that don't support native function calling
    (Gemini, OpenAI-compatible local models). The LLM won't actually
    invoke tools this way -- it just has awareness of the available
    data sources and can reference them in its analysis.
    """
    tool_section = "\n\n## Available Data Sources\n"
    tool_section += (
        "The following data sources were consulted to build the context above. "
        "Their results are already included in the chart data.\n\n"
    )
    for t in tools:
        tool_section += f"- **{t.name}**: {t.description}\n"
    return system_prompt + tool_section


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def create_provider(
    provider_type: str,
    api_key: str,
    model: str,
    max_tokens: int = 1024,
    *,
    base_url: str | None = None,
    azure_resource_name: str | None = None,
    azure_deployment_id: str | None = None,
    azure_api_version: str | None = None,
) -> BaseLLMProvider:
    """Factory function to create the appropriate LLM provider."""
    if provider_type == "claude":
        return ClaudeProvider(api_key, model, max_tokens, base_url=base_url)

    elif provider_type == "openai":
        return OpenAIProvider(api_key, model, max_tokens, base_url=base_url)

    elif provider_type == "openai_compatible":
        if not base_url:
            raise ValueError("base_url is required for openai_compatible provider")
        return OpenAICompatibleProvider(
            base_url=base_url,
            model=model,
            max_tokens=max_tokens,
            api_key=api_key or None,
        )

    elif provider_type == "azure_openai":
        if not azure_resource_name or not azure_deployment_id:
            raise ValueError(
                "azure_resource_name and azure_deployment_id are required "
                "for azure_openai provider"
            )
        return AzureOpenAIProvider(
            api_key=api_key,
            resource_name=azure_resource_name,
            deployment_id=azure_deployment_id,
            api_version=azure_api_version or "2024-10-21",
            max_tokens=max_tokens,
        )

    elif provider_type == "gemini":
        return GeminiProvider(api_key, model, max_tokens, base_url=base_url)

    else:
        raise ValueError(f"Unknown provider type: {provider_type}")
