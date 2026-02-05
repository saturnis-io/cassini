"""MQTT Broker configuration model for data collection."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.plant import Plant


class MQTTBroker(Base):
    """MQTT Broker configuration for connecting to external data sources.

    Stores connection settings for MQTT brokers that provide tag data
    for SPC characteristics configured with TAG provider type.
    """

    __tablename__ = "mqtt_broker"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=1883, nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_id: Mapped[str] = mapped_column(String(100), default="openspc-client", nullable=False)
    keepalive: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    max_reconnect_delay: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    use_tls: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Plant relationship
    plant: Mapped[Optional["Plant"]] = relationship("Plant", back_populates="brokers")

    def __repr__(self) -> str:
        return (
            f"<MQTTBroker(id={self.id}, name='{self.name}', "
            f"host='{self.host}:{self.port}', active={self.is_active})>"
        )
