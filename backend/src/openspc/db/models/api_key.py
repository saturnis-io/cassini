"""API Key model for external data entry authentication."""

from datetime import datetime, timezone
from typing import Optional
import uuid


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)

from sqlalchemy import Boolean, DateTime, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from openspc.db.models.hierarchy import Base


class APIKey(Base):
    """API key for authenticating external data entry requests.

    Attributes:
        id: Unique identifier (UUID string)
        name: Human-readable name for the key
        key_hash: Bcrypt hash of the API key
        created_at: When the key was created
        expires_at: Optional expiration timestamp
        permissions: JSON with characteristic IDs or "all"
        rate_limit_per_minute: Max requests per minute
        is_active: Whether the key is currently active
        last_used_at: When the key was last used
    """

    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    key_prefix: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=_utc_now,
        nullable=False,
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )
    permissions: Mapped[dict] = mapped_column(
        JSON,
        default={"characteristics": "all"},
        nullable=False,
    )
    rate_limit_per_minute: Mapped[int] = mapped_column(
        Integer,
        default=60,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )

    def is_expired(self) -> bool:
        """Check if the API key has expired.

        Returns:
            True if the key has an expiration date and it has passed.
        """
        if self.expires_at is None:
            return False
        return datetime.now(timezone.utc) > self.expires_at

    def can_access_characteristic(self, char_id: int) -> bool:
        """Check if key has permission for a specific characteristic.

        Args:
            char_id: The characteristic ID to check access for.

        Returns:
            True if the key has permission to access the characteristic.
        """
        chars = self.permissions.get("characteristics", "all")
        if chars == "all":
            return True
        if isinstance(chars, list):
            return char_id in chars
        return False

    def __repr__(self) -> str:
        return (
            f"<APIKey(id='{self.id}', name='{self.name}', "
            f"is_active={self.is_active}, expires_at={self.expires_at})>"
        )
