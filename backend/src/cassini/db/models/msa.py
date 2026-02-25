"""Measurement System Analysis (MSA) models for Gage R&R studies."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant
    from cassini.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MSAStudy(Base):
    """Measurement System Analysis study definition."""

    __tablename__ = "msa_study"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(ForeignKey("plant.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    study_type: Mapped[str] = mapped_column(String(30), nullable=False)  # crossed_anova, nested_anova, range_method, attribute_agreement
    characteristic_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("characteristic.id", ondelete="SET NULL"), nullable=True
    )
    num_operators: Mapped[int] = mapped_column(Integer, nullable=False)
    num_parts: Mapped[int] = mapped_column(Integer, nullable=False)
    num_replicates: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    tolerance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="setup")  # setup, collecting, complete
    # NOTE: user FK intentionally lacks ondelete — users should be soft-deleted
    # (is_active=False) rather than physically removed to preserve audit trail.
    created_by: Mapped[int] = mapped_column(ForeignKey("user.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=sa.func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    results_json: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Relationships
    operators: Mapped[list["MSAOperator"]] = relationship(
        "MSAOperator", back_populates="study", cascade="all, delete-orphan",
        order_by="MSAOperator.sequence_order"
    )
    parts: Mapped[list["MSAPart"]] = relationship(
        "MSAPart", back_populates="study", cascade="all, delete-orphan",
        order_by="MSAPart.sequence_order"
    )
    measurements: Mapped[list["MSAMeasurement"]] = relationship(
        "MSAMeasurement", back_populates="study", cascade="all, delete-orphan"
    )


class MSAOperator(Base):
    """Operator (appraiser) within an MSA study."""

    __tablename__ = "msa_operator"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("msa_study.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    study: Mapped["MSAStudy"] = relationship("MSAStudy", back_populates="operators")


class MSAPart(Base):
    """Part (sample) within an MSA study."""

    __tablename__ = "msa_part"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("msa_study.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    reference_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    study: Mapped["MSAStudy"] = relationship("MSAStudy", back_populates="parts")


class MSAMeasurement(Base):
    """Individual measurement within an MSA study."""

    __tablename__ = "msa_measurement"
    __table_args__ = (
        sa.Index("ix_msa_measurement_study", "study_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("msa_study.id", ondelete="CASCADE"), nullable=False)
    operator_id: Mapped[int] = mapped_column(ForeignKey("msa_operator.id", ondelete="CASCADE"), nullable=False)
    part_id: Mapped[int] = mapped_column(ForeignKey("msa_part.id", ondelete="CASCADE"), nullable=False)
    replicate_num: Mapped[int] = mapped_column(Integer, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    attribute_value: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utc_now, server_default=sa.func.now(), nullable=False
    )

    study: Mapped["MSAStudy"] = relationship("MSAStudy", back_populates="measurements")
