"""LLM provider abstraction for chart analysis."""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


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

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 1024,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
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

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        max_tokens: int = 1024,
    ):
        self._api_key = api_key
        self._model = model
        self._max_tokens = max_tokens

    async def generate(self, system_prompt: str, user_prompt: str) -> LLMResponse:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
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

            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})

            return LLMResponse(
                content=content,
                input_tokens=usage.get("prompt_tokens", 0),
                output_tokens=usage.get("completion_tokens", 0),
                model=self._model,
            )


def create_provider(
    provider_type: str, api_key: str, model: str, max_tokens: int = 1024
) -> BaseLLMProvider:
    """Factory function to create the appropriate LLM provider."""
    if provider_type == "claude":
        return ClaudeProvider(api_key, model, max_tokens)
    elif provider_type == "openai":
        return OpenAIProvider(api_key, model, max_tokens)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")
