"""AI Analysis API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AIConfigResponse(BaseModel):
    id: int | None = None
    plant_id: int
    provider_type: str = "claude"
    model_name: str = "claude-sonnet-4-20250514"
    max_tokens: int = 1024
    is_enabled: bool = False
    has_api_key: bool = False  # True if key is set, never expose actual key
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AIConfigUpdate(BaseModel):
    provider_type: str | None = Field(None, pattern=r"^(claude|openai)$")
    api_key: str | None = Field(None, min_length=10)  # Only set, never returned
    model_name: str | None = Field(None, max_length=100)
    max_tokens: int | None = Field(None, ge=256, le=4096)
    is_enabled: bool | None = None


class AIInsightResponse(BaseModel):
    id: int
    characteristic_id: int
    characteristic_name: str | None = None
    provider_type: str
    model_name: str
    summary: str
    patterns: list[str] = []
    risks: list[str] = []
    recommendations: list[str] = []
    tokens_used: int | None = None
    latency_ms: int | None = None
    generated_at: datetime


class AITestResponse(BaseModel):
    success: bool
    message: str
    latency_ms: int | None = None
