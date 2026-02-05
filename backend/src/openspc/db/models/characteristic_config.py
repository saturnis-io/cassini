"""CharacteristicConfig model for polymorphic configuration storage."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic


class CharacteristicConfig(Base):
    """Stores polymorphic configuration as JSON.

    The config column stores the discriminated union (ManualConfig or TagConfig)
    as a JSON blob, validated by Pydantic on read/write.
    """

    __tablename__ = "characteristic_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )

    # JSON blob storing the config (ManualConfig or TagConfig)
    config_json: Mapped[str] = mapped_column(Text, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Relationship
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="config"
    )

    def __repr__(self) -> str:
        return f"<CharacteristicConfig(id={self.id}, characteristic_id={self.characteristic_id})>"
