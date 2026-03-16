"""First Article Inspection (FAI) models — AS9102 Rev C compliance."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.fai_detail import (
        FAIFunctionalTest,
        FAIMaterial,
        FAISpecialProcess,
    )


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FAIReport(Base):
    """First Article Inspection report — combines AS9102 Forms 1, 2, and 3."""

    __tablename__ = "fai_report"
    __table_args__ = (
        sa.Index("ix_fai_report_plant", "plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plant.id", ondelete="CASCADE"), nullable=False)

    # FAI type: "full" (default) or "partial"
    fai_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="full", server_default=sa.text("'full'")
    )

    # Form 1: Part Number Accountability
    part_number: Mapped[str] = mapped_column(String(100), nullable=False)
    part_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    revision: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    lot_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    drawing_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    organization_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    purchase_order: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    reason_for_inspection: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Form 2: Product Accountability (legacy text fields — read-only after migration)
    material_supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    material_spec: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    special_processes: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)  # JSON array
    functional_test_results: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)  # JSON

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=sa.func.now(), nullable=False
    )
    # Separation of duties (AS9102 Rev C Section 4.4): the approver must differ
    # from the submitter.  Enforced at the API layer in api/v1/fai.py
    # (approve_report checks submitted_by != current_user.id).  A DB-level CHECK
    # constraint is not used because approved_by is NULL at insert time and
    # cross-column CHECK behaviour varies across dialects.
    submitted_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Relationships
    items: Mapped[list["FAIItem"]] = relationship(
        "FAIItem", back_populates="report", cascade="all, delete-orphan",
        order_by="FAIItem.sequence_order"
    )
    # Form 2 child tables (structured data — replaces legacy text fields)
    materials: Mapped[list["FAIMaterial"]] = relationship(
        "FAIMaterial", back_populates="report", cascade="all, delete-orphan",
    )
    special_processes_items: Mapped[list["FAISpecialProcess"]] = relationship(
        "FAISpecialProcess", back_populates="report", cascade="all, delete-orphan",
    )
    functional_tests_items: Mapped[list["FAIFunctionalTest"]] = relationship(
        "FAIFunctionalTest", back_populates="report", cascade="all, delete-orphan",
    )


class FAIItem(Base):
    """Individual inspection characteristic within an FAI report — AS9102 Form 3 row."""

    __tablename__ = "fai_item"
    __table_args__ = (
        sa.Index("ix_fai_item_report", "report_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("fai_report.id", ondelete="CASCADE"), nullable=False)
    balloon_number: Mapped[int] = mapped_column(Integer, nullable=False)
    characteristic_name: Mapped[str] = mapped_column(String(255), nullable=False)
    drawing_zone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    nominal: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    actual_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    value_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="numeric", server_default=sa.text("'numeric'")
    )
    actual_value_text: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    measurements: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)  # JSON array of floats
    unit: Mapped[str] = mapped_column(String(50), nullable=False, default="mm")
    tools_used: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    designed_char: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.text("0")
    )
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="pass")
    deviation_reason: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    characteristic_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("characteristic.id", ondelete="SET NULL"), nullable=True
    )
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    report: Mapped["FAIReport"] = relationship("FAIReport", back_populates="items")
