"""Plant model for multi-site isolation.

Plants represent physical manufacturing locations. All hierarchies,
characteristics, and broker configurations are scoped to a specific plant.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.broker import MQTTBroker
    from openspc.db.models.hierarchy import Hierarchy


class Plant(Base):
    """Plant/Site model for multi-tenant data isolation.

    Each plant represents a physical manufacturing facility.
    Hierarchies, characteristics, and MQTT brokers are scoped per-plant.
    """

    __tablename__ = "plant"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    settings: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    hierarchies: Mapped[list["Hierarchy"]] = relationship(
        "Hierarchy", back_populates="plant", cascade="all, delete-orphan"
    )
    brokers: Mapped[list["MQTTBroker"]] = relationship(
        "MQTTBroker", back_populates="plant", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Plant(id={self.id}, name='{self.name}', code='{self.code}', active={self.is_active})>"
