"""Sample and Measurement models for SPC data collection."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.violation import Violation


class Sample(Base):
    """Sample measurement event model.

    Represents a single sampling event which may contain one or more
    individual measurements (based on subgroup size).
    """

    __tablename__ = "sample"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    char_id: Mapped[int] = mapped_column(ForeignKey("characteristic.id"), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    batch_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    operator_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="samples"
    )
    measurements: Mapped[list["Measurement"]] = relationship(
        "Measurement", back_populates="sample", cascade="all, delete-orphan"
    )
    violations: Mapped[list["Violation"]] = relationship(
        "Violation", back_populates="sample", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Sample(id={self.id}, char_id={self.char_id}, "
            f"timestamp={self.timestamp}, is_excluded={self.is_excluded})>"
        )


class Measurement(Base):
    """Individual measurement value within a sample.

    For subgroup sizes > 1, a sample will have multiple measurements.
    """

    __tablename__ = "measurement"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sample_id: Mapped[int] = mapped_column(ForeignKey("sample.id"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)

    # Relationship
    sample: Mapped["Sample"] = relationship("Sample", back_populates="measurements")

    def __repr__(self) -> str:
        return f"<Measurement(id={self.id}, sample_id={self.sample_id}, value={self.value})>"
