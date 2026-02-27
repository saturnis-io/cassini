"""Pydantic schemas for the Ishikawa / Fishbone variance decomposition API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class IshikawaFactorSchema(BaseModel):
    name: str
    sample_count: int


class IshikawaCategorySchema(BaseModel):
    name: str
    eta_squared: float | None = None
    p_value: float | None = None
    significant: bool = False
    sufficient_data: bool = False
    factors: list[IshikawaFactorSchema] = []
    detail: str = ""


class IshikawaResultSchema(BaseModel):
    effect: str
    total_variance: float
    sample_count: int
    categories: list[IshikawaCategorySchema]
    analysis_window: dict[str, str | int | None] = {}
    warnings: list[str] = []


class IshikawaDiagnoseRequest(BaseModel):
    start_date: str | None = Field(None, description="ISO start date for analysis window")
    end_date: str | None = Field(None, description="ISO end date for analysis window")
    limit: int | None = Field(None, ge=10, le=10000, description="Max samples to analyze")
