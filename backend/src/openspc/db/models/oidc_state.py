"""OIDC state and account-link models for SSO hardening."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.oidc_config import OIDCConfig
    from openspc.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class OIDCState(Base):
    """Transient CSRF state token for OIDC authorization code flow.

    Each row represents an in-flight authorization request.  The ``state``
    value is passed to the IdP and verified on callback to prevent CSRF.
    Rows are cleaned up after ``expires_at`` via a background sweep.
    """

    __tablename__ = "oidc_state"
    __table_args__ = (
        sa.UniqueConstraint("state", name="uq_oidc_state_state"),
        sa.Index("ix_oidc_state_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    state: Mapped[str] = mapped_column(String(64), nullable=False)
    nonce: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("oidc_config.id", ondelete="CASCADE"), nullable=False
    )
    redirect_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Relationships
    provider: Mapped["OIDCConfig"] = relationship("OIDCConfig", lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<OIDCState(id={self.id}, state='{self.state[:8]}...', "
            f"provider_id={self.provider_id}, expires_at={self.expires_at})>"
        )


class OIDCAccountLink(Base):
    """Links a local user to an OIDC provider subject identifier.

    Allows multiple OIDC providers per user while ensuring each (provider,
    subject) pair maps to exactly one local account.
    """

    __tablename__ = "oidc_account_link"
    __table_args__ = (
        sa.UniqueConstraint(
            "provider_id", "oidc_subject",
            name="uq_oidc_account_link_provider_subject",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    provider_id: Mapped[int] = mapped_column(
        ForeignKey("oidc_config.id", ondelete="CASCADE"), nullable=False
    )
    oidc_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", lazy="selectin")
    provider: Mapped["OIDCConfig"] = relationship("OIDCConfig", lazy="selectin")

    def __repr__(self) -> str:
        return (
            f"<OIDCAccountLink(id={self.id}, user_id={self.user_id}, "
            f"provider_id={self.provider_id}, sub='{self.oidc_subject}')>"
        )
