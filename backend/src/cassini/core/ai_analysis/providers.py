"""LLM provider abstraction for chart analysis."""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

_DEFAULT_TIMEOUT = 60.0


@dataclass
class LLMResponse:
    """Structured response from an LLM provider."""

    content: str
    input_tokens: int
    output_tokens: int
    model: str


class BaseLLMProvider(ABC):
    """Abstract base for LLM API providers."""

    @abstractmethod
    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        """Send a prompt to the LLM and return the structured response."""


class ClaudeProvider(BaseLLMProvider):
    """Anthropic Claude Messages API provider."""

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

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": self._max_tokens,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()

            content = data["content"][0]["text"]
            usage = data.get("usage", {})

            return LLMResponse(
                content=content,
                input_tokens=usage.get("input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
                model=self._model,
            )


class OpenAIProvider(BaseLLMProvider):
    """OpenAI Chat Completions API provider."""

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
        base = (base_url.rstrip("/") if base_url else self._DEFAULT_BASE)
        self._url = f"{base}/v1/chat/completions"

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": self._max_tokens,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()

            return _parse_openai_response(data, self._model)


class OpenAICompatibleProvider(BaseLLMProvider):
    """OpenAI-compatible provider for vLLM, Ollama, LM Studio, TGI, Bedrock, etc.

    Uses the same request/response schema as OpenAI but with a user-provided
    base URL. API key is optional (many local servers need no auth).
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

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers=headers,
                json={
                    "model": self._model,
                    "max_tokens": self._max_tokens,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()

            return _parse_openai_response(data, self._model)


class AzureOpenAIProvider(BaseLLMProvider):
    """Azure OpenAI Service provider.

    URL pattern: https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions
    Auth: api-key header (not Bearer token).
    Response schema matches OpenAI.
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

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "api-key": self._api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "max_tokens": self._max_tokens,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()

            return _parse_openai_response(data, self._model)


class GeminiProvider(BaseLLMProvider):
    """Google Gemini API provider.

    Translates OpenAI-style system/user messages to Gemini's
    contents/candidates schema. Auth via x-goog-api-key header.
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

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            response = await client.post(
                self._url,
                headers={
                    "Content-Type": "application/json",
                    "x-goog-api-key": self._api_key,
                },
                json={
                    "system_instruction": {
                        "parts": [{"text": system_prompt}],
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


def _parse_openai_response(data: dict[str, Any], model: str) -> LLMResponse:
    """Parse an OpenAI-compatible chat completions response."""
    content = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})

    return LLMResponse(
        content=content,
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
        model=model,
    )


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
