"""AI provider configuration and insight models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.plant import Plant


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AIProviderConfig(Base):
    """Per-plant AI provider configuration.

    Stores the API key (Fernet-encrypted), model selection, and token
    limits for the AI analysis feature.  At most one config per plant,
    enforced by the UNIQUE constraint on ``plant_id``.

    Encryption follows the same pattern as ERP connector credentials:
    use :func:`cassini.db.dialects.encrypt_password` and
    :func:`cassini.db.dialects.decrypt_password` with
    :func:`cassini.db.dialects.get_encryption_key` at the API layer.
    The ``decrypted_api_key`` property is provided as a convenience
    for engine code that needs the plaintext key.
    """

    __tablename__ = "ai_provider_config"
    __table_args__ = (
        sa.UniqueConstraint("plant_id", name="uq_ai_provider_config_plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    provider_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="claude", server_default="claude"
    )
    api_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    model_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="claude-sonnet-4-20250514",
        server_default="claude-sonnet-4-20250514",
    )
    max_tokens: Mapped[int] = mapped_column(
        Integer, nullable=False, default=4096, server_default=sa.text("4096")
    )
    base_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    azure_resource_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    azure_deployment_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    azure_api_version: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.False_()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def decrypted_api_key(self) -> str:
        """Decrypt the stored API key using the DB encryption key.

        Returns:
            The plaintext API key, or empty string if not set.
        """
        if not self.api_key:
            return ""
        from cassini.db.dialects import decrypt_password, get_encryption_key

        enc_key = get_encryption_key()
        return decrypt_password(self.api_key, enc_key)

    @decrypted_api_key.setter
    def decrypted_api_key(self, value: str) -> None:
        """Encrypt and store an API key.

        Args:
            value: Plaintext API key to encrypt.
        """
        from cassini.db.dialects import encrypt_password, get_encryption_key

        enc_key = get_encryption_key()
        self.api_key = encrypt_password(value, enc_key)

    def __repr__(self) -> str:
        return (
            f"<AIProviderConfig(id={self.id}, plant_id={self.plant_id}, "
            f"provider='{self.provider_type}', model='{self.model_name}', "
            f"enabled={self.is_enabled})>"
        )


class AIInsight(Base):
    """Cached AI-generated analysis insight for a characteristic.

    The ``context_hash`` allows de-duplication: if the characteristic's
    data hasn't changed since the last analysis, the cached insight is
    returned instead of making a new API call.

    ``patterns``, ``risks``, and ``recommendations`` store JSON arrays
    of structured findings.
    """

    __tablename__ = "ai_insight"
    __table_args__ = (
        sa.Index(
            "ix_ai_insight_char_generated",
            "characteristic_id", "generated_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    provider_type: Mapped[str] = mapped_column(String(20), nullable=False)
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    context_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    patterns: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    risks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tool_calls_made: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<AIInsight(id={self.id}, "
            f"characteristic_id={self.characteristic_id}, "
            f"provider='{self.provider_type}', "
            f"tokens={self.tokens_used})>"
        )
