"""Annotation model for chart annotations.

Supports both point annotations (tied to a single sample) and period
annotations (spanning a range of samples).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text
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

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id"), nullable=False, index=True
    )

    # Type: "point" or "period"
    annotation_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Text content
    text: Mapped[str] = mapped_column(Text, nullable=False)

    # Optional display color (hex format, e.g., "#ff6b6b")
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # For point annotations: references a single sample
    sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id"), nullable=True
    )

    # For period annotations: references start and end samples
    start_sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id"), nullable=True
    )
    end_sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id"), nullable=True
    )

    # Audit fields
    created_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
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

    def __repr__(self) -> str:
        return (
            f"<Annotation(id={self.id}, type={self.annotation_type}, "
            f"characteristic_id={self.characteristic_id})>"
        )
