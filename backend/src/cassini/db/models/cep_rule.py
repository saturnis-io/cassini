"""CEP (Complex Event Processing) rule model — multi-stream YAML patterns.

Each row is a YAML-defined pattern that combines per-characteristic Nelson
rule conditions across a sliding time window. The engine subscribes to
``SampleProcessedEvent`` and fires ``CepMatchEvent`` (and a violation row)
when all conditions are satisfied within the window.

Storage layout:
- ``yaml_text`` — authoritative source-of-truth (operator-readable, edited)
- ``parsed_json`` — cached JSON of the parsed Pydantic model (fast hot-path)

The engine MUST validate ``yaml_text`` and refresh ``parsed_json`` on every
write; readers SHOULD trust ``parsed_json`` until they encounter a parse
error, in which case they fall back to re-parsing ``yaml_text``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cassini.db.models.hierarchy import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CepRule(Base):
    """A multi-stream YAML-based pattern rule, scoped to a single plant.

    The ``yaml_text`` column is the source-of-truth — it round-trips
    through the editor unchanged so users see exactly what they wrote.
    ``parsed_json`` is a cache populated by the API layer after schema
    validation; the engine reads it on every sample event.
    """

    __tablename__ = "cep_rule"
    __table_args__ = (
        UniqueConstraint("plant_id", "name", name="uq_cep_rule_plant_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # YAML source — authoritative, length-bounded to keep editor responsive
    yaml_text: Mapped[str] = mapped_column(Text, nullable=False)
    # Cached Pydantic-validated JSON — refreshed on every write
    parsed_json: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa.true(), default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        server_default=sa.func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_utc_now,
        onupdate=_utc_now,
        server_default=sa.func.now(),
    )

    def __repr__(self) -> str:
        return (
            f"<CepRule(id={self.id}, plant_id={self.plant_id}, "
            f"name='{self.name}', enabled={self.enabled})>"
        )
