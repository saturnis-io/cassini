"""CapabilityHistory model for process capability snapshots."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic


class CapabilityHistory(Base):
    """Stores snapshots of process capability calculations.

    Each row represents a point-in-time calculation of Cp, Cpk, Pp, Ppk,
    and Cpm for a characteristic, along with normality test results.
    """

    __tablename__ = "capability_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cp: Mapped[float | None] = mapped_column(Float, nullable=True)
    cpk: Mapped[float | None] = mapped_column(Float, nullable=True)
    pp: Mapped[float | None] = mapped_column(Float, nullable=True)
    ppk: Mapped[float | None] = mapped_column(Float, nullable=True)
    cpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    normality_p_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    normality_test: Mapped[str | None] = mapped_column(String(50), nullable=True)
    calculated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    calculated_by: Mapped[str] = mapped_column(String(255), nullable=False)

    # Relationship
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<CapabilityHistory(id={self.id}, char_id={self.characteristic_id}, "
            f"cpk={self.cpk}, calculated_at={self.calculated_at})>"
        )
