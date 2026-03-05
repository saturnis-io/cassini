"""Pydantic schemas for the Explain API."""

from pydantic import BaseModel


class ExplanationStepSchema(BaseModel):
    label: str
    formula_latex: str
    substitution_latex: str
    result: float
    note: str | None = None


class CitationSchema(BaseModel):
    standard: str
    reference: str
    section: str | None = None


class ExplanationResponse(BaseModel):
    metric: str
    display_name: str
    value: float
    formula_latex: str
    steps: list[ExplanationStepSchema]
    inputs: dict[str, float | str]
    citation: CitationSchema | None = None
    method: str | None = None
    sigma_estimator: str | None = None
    warnings: list[str] = []
