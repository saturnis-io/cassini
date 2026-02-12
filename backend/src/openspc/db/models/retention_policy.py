"""Retention policy model for SPC data lifecycle management.

Defines how long SPC data (samples, measurements, violations) is retained
per plant, with an inheritance model: characteristic -> hierarchy -> global default.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.hierarchy import Hierarchy
    from openspc.db.models.plant import Plant


class RetentionPolicy(Base):
    """Retention policy for SPC data lifecycle.

    Supports three scopes:
    - 'global': Plant-wide default (one per plant)
    - 'hierarchy': Override for a specific hierarchy node
    - 'characteristic': Override for a specific characteristic

    Resolution chain: characteristic -> parent hierarchy -> ... -> global default.
    """

    __tablename__ = "retention_policy"
    __table_args__ = (
        UniqueConstraint(
            "plant_id", "scope", "hierarchy_id", "characteristic_id",
            name="uq_retention_policy_scope_target",
        ),
        CheckConstraint(
            "(scope = 'global' AND hierarchy_id IS NULL AND characteristic_id IS NULL) OR "
            "(scope = 'hierarchy' AND hierarchy_id IS NOT NULL AND characteristic_id IS NULL) OR "
            "(scope = 'characteristic' AND characteristic_id IS NOT NULL AND hierarchy_id IS NULL)",
            name="ck_retention_policy_scope",
        ),
        CheckConstraint(
            "(retention_type = 'forever' AND retention_value IS NULL AND retention_unit IS NULL) OR "
            "(retention_type = 'sample_count' AND retention_value IS NOT NULL AND retention_unit IS NULL) OR "
            "(retention_type = 'time_delta' AND retention_value IS NOT NULL AND retention_unit IS NOT NULL)",
            name="ck_retention_policy_type_value",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    hierarchy_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("hierarchy.id", ondelete="CASCADE"), nullable=True
    )
    characteristic_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=True
    )
    retention_type: Mapped[str] = mapped_column(String(20), nullable=False)
    retention_value: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    retention_unit: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    hierarchy: Mapped[Optional["Hierarchy"]] = relationship("Hierarchy")
    characteristic: Mapped[Optional["Characteristic"]] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<RetentionPolicy(id={self.id}, plant_id={self.plant_id}, "
            f"scope='{self.scope}', type='{self.retention_type}')>"
        )
