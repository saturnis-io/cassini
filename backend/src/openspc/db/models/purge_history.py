"""Purge history model for tracking retention purge operations.

Records each purge run with statistics about what was deleted,
allowing operators to audit data lifecycle enforcement.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.plant import Plant


class PurgeHistory(Base):
    """Record of a retention purge run.

    Each row represents one purge execution against a specific plant,
    tracking how many samples/violations were deleted and whether it succeeded.
    """

    __tablename__ = "purge_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running"
    )
    samples_deleted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    violations_deleted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    characteristics_processed: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")

    def __repr__(self) -> str:
        return (
            f"<PurgeHistory(id={self.id}, plant_id={self.plant_id}, "
            f"status='{self.status}', samples_deleted={self.samples_deleted})>"
        )
