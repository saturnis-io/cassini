"""OPC-UA Server configuration model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.plant import Plant


class OPCUAServer(Base):
    """OPC-UA Server configuration for connecting to industrial OPC-UA servers.

    Stores connection settings, authentication credentials, and default
    subscription parameters for OPC-UA server connections.
    """

    __tablename__ = "opcua_server"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    endpoint_url: Mapped[str] = mapped_column(String(500), nullable=False)
    auth_mode: Mapped[str] = mapped_column(
        String(50), default="anonymous", nullable=False
    )
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    password: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    security_policy: Mapped[str] = mapped_column(
        String(50), default="None", nullable=False
    )
    security_mode: Mapped[str] = mapped_column(
        String(50), default="None", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    session_timeout: Mapped[int] = mapped_column(
        Integer, default=30000, nullable=False
    )
    publishing_interval: Mapped[int] = mapped_column(
        Integer, default=1000, nullable=False
    )
    sampling_interval: Mapped[int] = mapped_column(
        Integer, default=250, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
        onupdate=func.now(), nullable=False
    )

    plant: Mapped[Optional["Plant"]] = relationship("Plant", back_populates="opcua_servers")

    def __repr__(self) -> str:
        return (
            f"<OPCUAServer(id={self.id}, name='{self.name}', "
            f"url='{self.endpoint_url}', active={self.is_active})>"
        )
