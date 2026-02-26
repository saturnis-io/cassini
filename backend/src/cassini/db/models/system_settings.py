"""System-wide settings (single-row table)."""

from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from cassini.db.models.hierarchy import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SystemSettings(Base):
    __tablename__ = "system_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_system_settings_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    date_format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="YYYY-MM-DD"
    )
    datetime_format: Mapped[str] = mapped_column(
        String(50), nullable=False, default="YYYY-MM-DD HH:mm:ss"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=func.now(),
        onupdate=_utc_now,
        nullable=False,
    )
