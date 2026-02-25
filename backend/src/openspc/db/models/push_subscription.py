"""Web Push subscription model for browser push notifications."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PushSubscription(Base):
    """Browser Web Push subscription for a user.

    Stores the three pieces of information needed to send a push message
    via the Web Push protocol: the push service ``endpoint``, the
    ``p256dh_key`` (client public key), and the ``auth_key`` (shared auth
    secret).  Each endpoint is unique across all users.
    """

    __tablename__ = "push_subscription"
    __table_args__ = (
        sa.UniqueConstraint("endpoint", name="uq_push_subscription_endpoint"),
        sa.Index("ix_push_subscription_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    p256dh_key: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<PushSubscription(id={self.id}, user_id={self.user_id}, "
            f"endpoint='{self.endpoint[:40]}...')>"
        )
