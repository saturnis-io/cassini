"""FAI Form 2 child tables — AS9102 Rev C Product Accountability.

Structured storage for materials, special processes, and functional tests
that were previously stored as unstructured text/JSON fields on FAIReport.
"""
from __future__ import annotations

from typing import Optional

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base


class FAIMaterial(Base):
    """Material traceability record for an FAI report (Form 2)."""

    __tablename__ = "fai_material"
    __table_args__ = (
        sa.Index("ix_fai_material_report", "report_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("fai_report.id", ondelete="CASCADE"), nullable=False
    )
    material_part_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    material_spec: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cert_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="pass")

    report: Mapped["FAIReport"] = relationship("FAIReport", back_populates="materials")  # type: ignore[name-defined]  # noqa: F821


class FAISpecialProcess(Base):
    """Special process certification record for an FAI report (Form 2)."""

    __tablename__ = "fai_special_process"
    __table_args__ = (
        sa.Index("ix_fai_special_process_report", "report_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("fai_report.id", ondelete="CASCADE"), nullable=False
    )
    process_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    process_spec: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cert_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    approved_supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="pass")

    report: Mapped["FAIReport"] = relationship("FAIReport", back_populates="special_processes_items")  # type: ignore[name-defined]  # noqa: F821


class FAIFunctionalTest(Base):
    """Functional test result record for an FAI report (Form 2)."""

    __tablename__ = "fai_functional_test"
    __table_args__ = (
        sa.Index("ix_fai_functional_test_report", "report_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(
        ForeignKey("fai_report.id", ondelete="CASCADE"), nullable=False
    )
    test_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    procedure_number: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    actual_results: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    result: Mapped[str] = mapped_column(String(20), nullable=False, default="pass")

    report: Mapped["FAIReport"] = relationship("FAIReport", back_populates="functional_tests_items")  # type: ignore[name-defined]  # noqa: F821
