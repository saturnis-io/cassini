"""SOP document and chunk models for citation-locked RAG (Enterprise).

Schema contract:
- ``SopDoc`` is a plant-scoped uploaded document (PDF, DOCX, MD, TXT).
- ``SopChunk`` is a 512-token (configurable) text chunk with optional
  embedding bytes. The embedding column is nullable so a doc can be
  ingested even if the embedding provider is offline; the indexer will
  back-fill on next run.
- ``SopRagBudget`` tracks per-plant monthly LLM spend so the cost guard
  in ``api/v1/sop_rag.py`` can enforce a monthly cap.

The chunk embedding is stored as raw bytes (numpy ``.tobytes()`` of a
float32 vector). The dimension is recorded on each chunk so we can mix
embedders and refuse to compare cross-dimension vectors at query time.

Multi-tenancy:
- Every ``SopDoc`` row carries ``plant_id``. The retrieval layer MUST
  filter by plant before scoring. There is no shared / global doc pool.

Citation lock:
- The LLM response carries ``[citation:<chunk_id>]`` markers. ``chunk_id``
  is the integer primary key of ``SopChunk``. The citation_lock module
  validates that each chunk_id (a) parses as int, (b) is in the
  retrieved candidate set for this query, and (c) belongs to the
  caller's plant.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SopDoc(Base):
    """A plant-scoped SOP / work-instruction / control-plan document.

    The raw document bytes are NOT stored in the DB. They live on disk
    under ``<data_dir>/sop_docs/<plant_id>/<doc_id>.<ext>`` so the DB
    stays small and we can rotate / archive separately.

    ``status`` lifecycle:
        ``pending`` -> file written, not yet chunked
        ``indexing`` -> chunker running
        ``ready`` -> all chunks embedded
        ``failed`` -> indexer crashed; ``status_message`` has the reason

    ``pii_warning`` is a soft flag set during ingest if a PII regex
    matches. The upload endpoint surfaces it in the response so the
    operator can decide to leave it indexed or delete the doc.
    """

    __tablename__ = "sop_doc"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    char_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )
    chunk_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )
    embedding_model: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", server_default="pending"
    )
    status_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pii_warning: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.false()
    )
    pii_match_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    uploaded_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    chunks: Mapped[list["SopChunk"]] = relationship(
        "SopChunk", back_populates="doc", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<SopDoc(id={self.id}, plant_id={self.plant_id}, "
            f"title='{self.title}', status='{self.status}', "
            f"chunks={self.chunk_count})>"
        )


class SopChunk(Base):
    """A single text chunk extracted from a ``SopDoc``.

    Chunks are produced by the indexer with a target size of
    ``chunk_tokens`` (default 512) and ``overlap_tokens`` (default 64).
    Token counts here mean "whitespace-delimited words" — we avoid the
    tiktoken dependency by default because the chunker is a fallback
    when tiktoken is not installed.

    ``embedding`` is float32 numpy bytes. ``embedding_dim`` is recorded
    so we can detect dimension mismatches at query time and refuse to
    score a chunk against a mismatched query embedding.
    """

    __tablename__ = "sop_chunk"
    __table_args__ = (
        sa.Index("ix_sop_chunk_doc_id_chunk_index", "doc_id", "chunk_index"),
        sa.Index("ix_sop_chunk_plant_id", "plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    doc_id: Mapped[int] = mapped_column(
        ForeignKey("sop_doc.id", ondelete="CASCADE"), nullable=False
    )
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False)
    paragraph_label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    embedding: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    embedding_dim: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    doc: Mapped["SopDoc"] = relationship("SopDoc", back_populates="chunks")

    def __repr__(self) -> str:
        return (
            f"<SopChunk(id={self.id}, doc_id={self.doc_id}, "
            f"chunk_index={self.chunk_index}, tokens={self.token_count})>"
        )


class SopRagBudget(Base):
    """Per-plant monthly LLM cost ledger for the SOP RAG feature.

    One row per (plant_id, year_month) where ``year_month`` is the
    ISO-8601 ``YYYY-MM`` string. The endpoint atomically increments the
    ``cost_usd`` column on each query and rejects queries that would
    push the total above ``monthly_cap_usd``.
    """

    __tablename__ = "sop_rag_budget"
    __table_args__ = (
        sa.UniqueConstraint(
            "plant_id", "year_month", name="uq_sop_rag_budget_plant_month"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)
    monthly_cap_usd: Mapped[float] = mapped_column(
        Float, nullable=False, default=50.0, server_default=sa.text("50.0")
    )
    cost_usd: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0, server_default=sa.text("0.0")
    )
    query_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
