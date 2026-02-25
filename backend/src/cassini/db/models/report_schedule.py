"""Report schedule models for scheduled PDF report generation and email delivery.

Defines the schedule configuration and execution history for automated SPC reports.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant
    from cassini.db.models.user import User


class ReportSchedule(Base):
    """Scheduled report configuration.

    Each schedule defines what report to generate (template + scope), how often (frequency),
    and who receives it (recipients list). The scheduler checks periodically and triggers
    report generation + email delivery for due schedules.
    """

    __tablename__ = "report_schedule"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    template_id: Mapped[str] = mapped_column(String(50), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    hour: Mapped[int] = mapped_column(Integer, nullable=False, server_default="6")
    day_of_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recipients: Mapped[str] = mapped_column(Text, nullable=False)
    window_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default="7")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    creator: Mapped[Optional["User"]] = relationship("User")
    runs: Mapped[list["ReportRun"]] = relationship(
        "ReportRun", back_populates="schedule", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<ReportSchedule(id={self.id}, name='{self.name}', "
            f"template='{self.template_id}', frequency='{self.frequency}')>"
        )


class ReportRun(Base):
    """Execution history for a report schedule.

    Each run tracks when the report was generated, its status, and metadata
    like recipient count and PDF size.
    """

    __tablename__ = "report_run"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    schedule_id: Mapped[int] = mapped_column(
        ForeignKey("report_schedule.id", ondelete="CASCADE"), nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recipients_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    pdf_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    schedule: Mapped["ReportSchedule"] = relationship(
        "ReportSchedule", back_populates="runs"
    )

    def __repr__(self) -> str:
        return (
            f"<ReportRun(id={self.id}, schedule_id={self.schedule_id}, "
            f"status='{self.status}')>"
        )
