"""Rule preset model for named rule configuration sets."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from openspc.db.models.hierarchy import Base


class RulePreset(Base):
    """Named rule preset with configurable parameters for all 8 Nelson Rules.

    Built-in presets (is_builtin=True) are seeded by migration 032 and cover
    the Nelson, AIAG, Western Electric, and Wheeler rulesets.  Plant-scoped
    presets (plant_id IS NOT NULL) are user-created and private to that plant.
    Global user-created presets have plant_id IS NULL and is_builtin=False.
    """

    __tablename__ = "rule_preset"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_builtin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=sa.text("0")
    )
    rules_config: Mapped[str] = mapped_column(sa.Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=sa.func.now()
    )
    plant_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<RulePreset(id={self.id}, name='{self.name}', "
            f"is_builtin={self.is_builtin})>"
        )
