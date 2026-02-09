"""Violation model for Nelson Rules breaches."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.sample import Sample


class Severity(str, Enum):
    """Violation severity levels."""

    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class Violation(Base):
    """Nelson Rules violation model.

    Records when a sample triggers a Nelson Rule, including
    acknowledgment tracking and whether acknowledgement is required.
    """

    __tablename__ = "violation"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sample_id: Mapped[int] = mapped_column(ForeignKey("sample.id"), nullable=False)
    rule_id: Mapped[int] = mapped_column(Integer, nullable=False)
    rule_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ack_user: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ack_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ack_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationship
    sample: Mapped["Sample"] = relationship("Sample", back_populates="violations")

    def __repr__(self) -> str:
        return (
            f"<Violation(id={self.id}, sample_id={self.sample_id}, "
            f"rule_id={self.rule_id}, severity='{self.severity}', "
            f"acknowledged={self.acknowledged})>"
        )
