"""Polymorphic DataSource models using Joined Table Inheritance."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.broker import MQTTBroker
    from openspc.db.models.characteristic import Characteristic


class DataSourceType(str, Enum):
    """Discriminator for data source protocol type."""

    MQTT = "mqtt"
    OPCUA = "opcua"


class TriggerStrategy(str, Enum):
    """Strategy for triggering sample submission."""

    ON_CHANGE = "on_change"
    ON_TRIGGER = "on_trigger"
    ON_TIMER = "on_timer"


class DataSource(Base):
    """Base table for all data source types (polymorphic).

    Uses SQLAlchemy Joined Table Inheritance with `type` as discriminator.
    Each protocol (MQTT, OPC-UA, etc.) extends this with a sub-table.
    """

    __tablename__ = "data_source"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    trigger_strategy: Mapped[str] = mapped_column(
        String(50), default="on_change", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="data_source"
    )

    __mapper_args__ = {
        "polymorphic_on": "type",
    }

    def __repr__(self) -> str:
        return (
            f"<DataSource(id={self.id}, type='{self.type}', "
            f"char_id={self.characteristic_id})>"
        )


class MQTTDataSource(DataSource):
    """MQTT-specific data source configuration."""

    __tablename__ = "mqtt_data_source"

    id: Mapped[int] = mapped_column(
        ForeignKey("data_source.id", ondelete="CASCADE"),
        primary_key=True,
    )
    broker_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("mqtt_broker.id", ondelete="SET NULL"),
        nullable=True,
    )
    topic: Mapped[str] = mapped_column(String(500), nullable=False)
    metric_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    trigger_tag: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    broker: Mapped[Optional["MQTTBroker"]] = relationship("MQTTBroker")

    __mapper_args__ = {
        "polymorphic_identity": "mqtt",
    }

    def __repr__(self) -> str:
        return (
            f"<MQTTDataSource(id={self.id}, topic='{self.topic}', "
            f"broker_id={self.broker_id})>"
        )


class OPCUADataSource(DataSource):
    """OPC-UA data source configuration.

    Created empty in migration 017, populated in WS-2 Phase 2.
    """

    __tablename__ = "opcua_data_source"

    id: Mapped[int] = mapped_column(
        ForeignKey("data_source.id", ondelete="CASCADE"),
        primary_key=True,
    )
    server_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    node_id: Mapped[str] = mapped_column(
        String(500), nullable=False
    )

    __mapper_args__ = {
        "polymorphic_identity": "opcua",
    }

    def __repr__(self) -> str:
        return (
            f"<OPCUADataSource(id={self.id}, node_id='{self.node_id}', "
            f"server_id={self.server_id})>"
        )
