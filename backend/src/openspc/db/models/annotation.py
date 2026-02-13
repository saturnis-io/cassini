"""Annotation model for chart annotations.

Supports both point annotations (tied to a single sample) and period
annotations (spanning a range of samples).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.sample import Sample


class Annotation(Base):
    """Chart annotation model.

    Represents either a point annotation (tied to a single sample) or a
    period annotation (spanning from start_sample to end_sample).
    """

    __tablename__ = "annotation"
    __table_args__ = (
        CheckConstraint(
            "annotation_type IN ('point', 'period')",
            name="ck_annotation_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Type: "point" or "period"
    annotation_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Text content
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional display color (hex format, e.g., "#ff6b6b")
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # For point annotations: references a single sample
    sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )

    # For period annotations (legacy): references start and end samples
    start_sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )
    end_sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )

    # For period annotations: time-based range (not tied to specific samples)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Audit fields
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=func.now(), onupdate=_utc_now, nullable=False
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", foreign_keys=[characteristic_id]
    )
    sample: Mapped[Optional["Sample"]] = relationship(
        "Sample", foreign_keys=[sample_id]
    )
    start_sample: Mapped[Optional["Sample"]] = relationship(
        "Sample", foreign_keys=[start_sample_id]
    )
    end_sample: Mapped[Optional["Sample"]] = relationship(
        "Sample", foreign_keys=[end_sample_id]
    )
    history: Mapped[list["AnnotationHistory"]] = relationship(
        "AnnotationHistory",
        back_populates="annotation",
        cascade="all, delete-orphan",
        order_by="AnnotationHistory.changed_at.desc()",
    )

    def __repr__(self) -> str:
        return (
            f"<Annotation(id={self.id}, type={self.annotation_type}, "
            f"characteristic_id={self.characteristic_id})>"
        )


class AnnotationHistory(Base):
    """Records previous text values whenever an annotation is edited."""

    __tablename__ = "annotation_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    annotation_id: Mapped[int] = mapped_column(
        ForeignKey("annotation.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_text: Mapped[str] = mapped_column(Text, nullable=False)
    changed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=func.now(), nullable=False
    )

    # Relationships
    annotation: Mapped["Annotation"] = relationship(
        "Annotation", back_populates="history"
    )

    def __repr__(self) -> str:
        return (
            f"<AnnotationHistory(id={self.id}, annotation_id={self.annotation_id})>"
        )
