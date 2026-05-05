"""Audit log model for tracking all user and system actions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, event, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AuditLog(Base):
    """Audit log entry for tracking user actions and system events.

    Stores a denormalized record of every significant action (login,
    CRUD operations, recalculations, exports) for compliance and
    security auditing.
    """

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_timestamp", text("timestamp DESC")),
        Index("ix_audit_log_user_id_timestamp", "user_id", "timestamp"),
        Index("ix_audit_log_resource", "resource_type", "resource_id"),
        Index("ix_audit_log_action", "action"),
        Index("ix_audit_log_plant_id", "plant_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resource_display: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    plant_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("plant.id", ondelete="SET NULL"),
        nullable=True,
        doc=(
            "Plant the audited resource belongs to. Required for tenant-scoped "
            "audit-log queries; nullable for system events that aren't tied to "
            "a specific plant (logins, license changes, etc.)."
        ),
    )
    detail: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=func.now(), nullable=False
    )
    sequence_number: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, unique=True,
        doc="Auto-increment sequence for multi-instance ordering and gap detection",
    )
    sequence_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, doc="SHA-256 chain hash for tamper evidence"
    )

    # Optional relationship to User (for joining)
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id], lazy="select")

    def __repr__(self) -> str:
        return (
            f"<AuditLog(id={self.id}, action={self.action!r}, "
            f"user={self.username!r}, resource={self.resource_type}/{self.resource_id})>"
        )


def prevent_audit_deletion(mapper, connection, target):
    """ORM event listener that blocks deletion of audit log records.

    Application-level protection for 21 CFR Part 11 compliance.  A DBA
    with direct database access can still delete rows, but the ORM will
    refuse.  To remove audit records at the database level, configure
    ``REVOKE DELETE`` permissions on the ``audit_log`` table.
    """
    raise RuntimeError(
        "Audit log records cannot be deleted via the application. "
        "Contact your DBA to configure database-level REVOKE DELETE permissions."
    )


event.listen(AuditLog, "before_delete", prevent_audit_deletion)
