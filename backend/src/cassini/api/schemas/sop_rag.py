"""Pydantic schemas for SOP-grounded RAG.

Five resource shapes:

* ``SopDocOut`` — list / get response for an uploaded SopDoc
* ``SopDocStatus`` — short status payload after upload kicked off
* ``RagQueryRequest`` — user question + optional top_k
* ``RagAnswerResponse`` — successful answer with citation metadata
* ``RagRefusalResponse`` — 422 payload when citation lock rejects
* ``RagBudgetOut`` / ``RagBudgetUpdate`` — monthly cost ledger
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SopDocStatusLiteral = Literal["pending", "indexing", "ready", "failed"]


class SopDocOut(BaseModel):
    """An uploaded SOP document."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: int
    title: str
    filename: str
    content_type: str
    byte_size: int
    char_count: int
    chunk_count: int
    embedding_model: str | None = None
    status: SopDocStatusLiteral
    status_message: str | None = None
    pii_warning: bool = False
    pii_match_summary: str | None = None
    uploaded_by: int | None = None
    created_at: datetime
    updated_at: datetime | None = None


class SopDocStatus(BaseModel):
    """Short status returned right after upload."""

    id: int
    status: SopDocStatusLiteral
    pii_warning: bool = False
    pii_match_summary: str | None = None


class SopDocListResponse(BaseModel):
    """Paginated list of plant SOP docs."""

    items: list[SopDocOut]
    total: int


class RagQueryRequest(BaseModel):
    """User question for the citation-locked RAG flow."""

    question: str = Field(min_length=3, max_length=2000)
    top_k: int = Field(default=8, ge=1, le=20)

    @field_validator("question")
    @classmethod
    def _no_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("question must not be blank")
        return v.strip()


class RagCitation(BaseModel):
    """A single citation with chunk + doc provenance."""

    chunk_id: int
    doc_id: int
    doc_title: str
    chunk_index: int
    paragraph_label: str | None = None
    text: str
    score: float


class RagAnswerResponse(BaseModel):
    """Successful citation-locked answer."""

    refused: Literal[False] = False
    answer: str
    answer_stripped: str  # answer with [citation:N] markers removed for display
    citations: list[RagCitation]
    sentences: list[dict]  # [{text, chunk_ids: [int, ...]}]
    candidate_chunk_ids: list[int]
    cost_usd: float
    input_tokens: int
    output_tokens: int
    model: str


class RagRefusalResponse(BaseModel):
    """Returned with 422 when citation lock rejects after retry."""

    refused: Literal[True] = True
    reason: Literal[
        "uncited_sentence", "out_of_set", "cross_plant", "no_relevant_chunks", "budget_exceeded"
    ]
    failed_sentence: str | None = None
    failed_chunk_id: int | None = None
    detail: str


class RagBudgetOut(BaseModel):
    """Per-plant monthly cost ledger."""

    model_config = ConfigDict(from_attributes=True)

    plant_id: int
    year_month: str
    monthly_cap_usd: float
    cost_usd: float
    query_count: int
    remaining_usd: float


class RagBudgetUpdate(BaseModel):
    """Admin sets the monthly cap."""

    monthly_cap_usd: float = Field(ge=0, le=10_000)
