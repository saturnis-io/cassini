"""Sample and Measurement models for SPC data collection."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
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

    # Variable subgroup size tracking
    actual_n: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_undersized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Mode-specific computed values (stored for charting)
    effective_ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    effective_lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    z_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Edit tracking - indicates sample has been modified from original
    is_modified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    edit_history: Mapped[list["SampleEditHistory"]] = relationship(
        "SampleEditHistory", back_populates="sample", cascade="all, delete-orphan",
        order_by="SampleEditHistory.edited_at.desc()"
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


class SampleEditHistory(Base):
    """Audit trail for sample edits.

    Stores the history of changes made to sample measurements,
    including what was changed, when, and why.
    """

    __tablename__ = "sample_edit_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sample_id: Mapped[int] = mapped_column(ForeignKey("sample.id"), nullable=False)

    # When the edit was made
    edited_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Who made the edit (optional - could be operator_id or user identifier)
    edited_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Required reason for the change
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    # Store previous values as JSON-formatted string for audit purposes
    # Format: "[1.23, 4.56, 7.89]"
    previous_values: Mapped[str] = mapped_column(Text, nullable=False)

    # Store new values as JSON-formatted string
    new_values: Mapped[str] = mapped_column(Text, nullable=False)

    # Previous calculated mean (for quick reference)
    previous_mean: Mapped[float] = mapped_column(Float, nullable=False)

    # New calculated mean
    new_mean: Mapped[float] = mapped_column(Float, nullable=False)

    # Relationship
    sample: Mapped["Sample"] = relationship("Sample", back_populates="edit_history")

    def __repr__(self) -> str:
        return (
            f"<SampleEditHistory(id={self.id}, sample_id={self.sample_id}, "
            f"edited_at={self.edited_at})>"
        )
