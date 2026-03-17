"""ERP/LIMS connector models for enterprise integration."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ERPConnector(Base):
    """Plant-scoped ERP/LIMS connector configuration.

    Supported connector types: ``sap_odata``, ``oracle_rest``,
    ``generic_lims``, ``generic_webhook``.

    The ``auth_config`` field stores Fernet-encrypted JSON with
    authentication credentials (passwords, client secrets, API keys, etc.).
    """

    __tablename__ = "erp_connector"
    __table_args__ = (
        sa.UniqueConstraint("plant_id", "name", name="uq_erp_connector_plant_name"),
        sa.Index("ix_erp_connector_plant_id", "plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    connector_type: Mapped[str] = mapped_column(
        String(50), nullable=False,
        doc="Free-form type key matched to adapter_map in ERPSyncEngine. "
            "Current: 'sap_qm', 'generic_rest', 'generic_lims'. "
            "To add DB-to-DB connectors (e.g. direct SQL, ODBC), add a new "
            "BaseERPAdapter subclass and register its dotted path in "
            "ERPSyncEngine._resolve_adapter(). No schema migration needed.",
    )
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    auth_type: Mapped[str] = mapped_column(String(50), nullable=False)
    auth_config: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )
    headers: Mapped[str] = mapped_column(
        Text, nullable=False, default="{}", server_default="{}"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="disconnected", server_default="disconnected"
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    field_mappings: Mapped[list["ERPFieldMapping"]] = relationship(
        "ERPFieldMapping",
        back_populates="connector",
        cascade="all, delete-orphan",
    )
    schedules: Mapped[list["ERPSyncSchedule"]] = relationship(
        "ERPSyncSchedule",
        back_populates="connector",
        cascade="all, delete-orphan",
    )
    sync_logs: Mapped[list["ERPSyncLog"]] = relationship(
        "ERPSyncLog",
        back_populates="connector",
        cascade="all, delete-orphan",
        order_by="ERPSyncLog.started_at.desc()",
    )

    def __repr__(self) -> str:
        return (
            f"<ERPConnector(id={self.id}, name='{self.name}', "
            f"type='{self.connector_type}', status='{self.status}')>"
        )


class ERPFieldMapping(Base):
    """Bidirectional field mapping between ERP and Cassini entities.

    Defines how a specific ERP field (identified by ``erp_entity`` and
    ``erp_field_path`` JSONPath) maps to an Cassini field.  An optional
    ``transform`` JSON blob can describe value transformations
    (e.g. ``{"multiply": 25.4}`` for inch-to-mm conversion).
    """

    __tablename__ = "erp_field_mapping"
    __table_args__ = (
        sa.Index("ix_erp_field_mapping_connector_id", "connector_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    connector_id: Mapped[int] = mapped_column(
        ForeignKey("erp_connector.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    erp_entity: Mapped[str] = mapped_column(String(100), nullable=False)
    erp_field_path: Mapped[str] = mapped_column(String(500), nullable=False)
    openspc_entity: Mapped[str] = mapped_column(String(50), nullable=False)
    openspc_field: Mapped[str] = mapped_column(String(100), nullable=False)
    transform: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )

    # Relationships
    connector: Mapped["ERPConnector"] = relationship(
        "ERPConnector", back_populates="field_mappings"
    )

    def __repr__(self) -> str:
        return (
            f"<ERPFieldMapping(id={self.id}, name='{self.name}', "
            f"direction='{self.direction}', "
            f"erp='{self.erp_entity}.{self.erp_field_path}' "
            f"-> openspc='{self.openspc_entity}.{self.openspc_field}')>"
        )


class ERPSyncSchedule(Base):
    """Cron-based sync schedule for an ERP connector direction.

    Each connector can have at most one inbound and one outbound schedule,
    enforced by the UNIQUE(connector_id, direction) constraint.
    """

    __tablename__ = "erp_sync_schedule"
    __table_args__ = (
        sa.UniqueConstraint(
            "connector_id", "direction",
            name="uq_erp_sync_schedule_connector_direction",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    connector_id: Mapped[int] = mapped_column(
        ForeignKey("erp_connector.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    connector: Mapped["ERPConnector"] = relationship(
        "ERPConnector", back_populates="schedules"
    )

    def __repr__(self) -> str:
        return (
            f"<ERPSyncSchedule(id={self.id}, connector_id={self.connector_id}, "
            f"direction='{self.direction}', cron='{self.cron_expression}')>"
        )


class ERPSyncLog(Base):
    """Audit log entry for a single sync operation.

    Captures the outcome of each sync run including record counts, timing,
    and any error messages.  The ``detail`` field stores a JSON blob with
    per-record results for debugging.
    """

    __tablename__ = "erp_sync_log"
    __table_args__ = (
        sa.Index("ix_erp_sync_log_connector_id", "connector_id"),
        sa.Index("ix_erp_sync_log_started_at", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    connector_id: Mapped[int] = mapped_column(
        ForeignKey("erp_connector.id", ondelete="CASCADE"), nullable=False
    )
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    records_processed: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    records_failed: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    connector: Mapped["ERPConnector"] = relationship(
        "ERPConnector", back_populates="sync_logs"
    )

    def __repr__(self) -> str:
        return (
            f"<ERPSyncLog(id={self.id}, connector_id={self.connector_id}, "
            f"direction='{self.direction}', status='{self.status}', "
            f"processed={self.records_processed}, failed={self.records_failed})>"
        )
