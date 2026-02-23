"""Gage Bridge models for RS-232/USB serial gage integration."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.broker import MQTTBroker
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.plant import Plant
    from openspc.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class GageBridge(Base):
    """Registered gage bridge agent on a shop floor PC."""

    __tablename__ = "gage_bridge"
    __table_args__ = (
        sa.Index("ix_gage_bridge_plant", "plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plant.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    api_key_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    mqtt_broker_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("mqtt_broker.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="offline")
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    registered_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=sa.func.now(), nullable=False
    )

    # Relationships
    ports: Mapped[list["GagePort"]] = relationship(
        "GagePort", back_populates="bridge", cascade="all, delete-orphan"
    )


class GagePort(Base):
    """Serial port configuration on a gage bridge."""

    __tablename__ = "gage_port"
    __table_args__ = (
        sa.Index("ix_gage_port_bridge", "bridge_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bridge_id: Mapped[int] = mapped_column(ForeignKey("gage_bridge.id", ondelete="CASCADE"), nullable=False)
    port_name: Mapped[str] = mapped_column(String(50), nullable=False)
    baud_rate: Mapped[int] = mapped_column(Integer, nullable=False, default=9600)
    data_bits: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    parity: Mapped[str] = mapped_column(String(10), nullable=False, default="none")
    stop_bits: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    protocol_profile: Mapped[str] = mapped_column(String(50), nullable=False, default="generic")
    parse_pattern: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    mqtt_topic: Mapped[str] = mapped_column(String(500), nullable=False)
    characteristic_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("characteristic.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.text("1"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=sa.func.now(), nullable=False
    )

    bridge: Mapped["GageBridge"] = relationship("GageBridge", back_populates="ports")
