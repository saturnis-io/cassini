"""Notification configuration models for SMTP, webhooks, and user preferences."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from openspc.db.models.hierarchy import Base


class SmtpConfig(Base):
    """Singleton SMTP configuration for email notifications.

    Only one row should exist. The router enforces singleton semantics
    via upsert logic on PUT.
    """

    __tablename__ = "smtp_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    server: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    use_tls: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    from_address: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<SmtpConfig(id={self.id}, server='{self.server}', active={self.is_active})>"


class WebhookConfig(Base):
    """Webhook endpoint configuration for outbound notifications.

    Multiple webhooks can be configured. Each can filter which event
    types it receives via the events_filter JSON column.
    """

    __tablename__ = "webhook_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    secret: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    events_filter: Mapped[Optional[str]] = mapped_column(
        String(1000), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<WebhookConfig(id={self.id}, name='{self.name}', active={self.is_active})>"


class NotificationPreference(Base):
    """Per-user notification preference for a specific event type and channel.

    Each row represents one user's preference for receiving notifications
    of a specific event_type via a specific channel (email or webhook).
    """

    __tablename__ = "notification_preference"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"<NotificationPreference(user_id={self.user_id}, "
            f"event='{self.event_type}', channel='{self.channel}', "
            f"enabled={self.is_enabled})>"
        )
