"""Design of Experiments (DOE) models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant
    from cassini.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DOEStudy(Base):
    """Design of Experiments study.

    Supports full factorial, fractional factorial (with resolution),
    central composite, and Box-Behnken designs.  The ``status`` field
    tracks the study lifecycle: ``design`` -> ``collecting`` -> ``analyzed``.

    The ``created_by`` FK is SET NULL on user deletion to preserve
    the study even if the creator account is removed.
    """

    __tablename__ = "doe_study"
    __table_args__ = (
        sa.Index("ix_doe_study_plant_status", "plant_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    design_type: Mapped[str] = mapped_column(String(30), nullable=False)
    resolution: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="design", server_default="design"
    )
    response_name: Mapped[str] = mapped_column(
        String(255), nullable=False, default="Response", server_default="Response"
    )
    response_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
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
    factors: Mapped[list["DOEFactor"]] = relationship(
        "DOEFactor",
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="DOEFactor.display_order",
    )
    runs: Mapped[list["DOERun"]] = relationship(
        "DOERun",
        back_populates="study",
        cascade="all, delete-orphan",
        order_by="DOERun.run_order",
    )
    analyses: Mapped[list["DOEAnalysis"]] = relationship(
        "DOEAnalysis",
        back_populates="study",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<DOEStudy(id={self.id}, name='{self.name}', "
            f"design_type='{self.design_type}', status='{self.status}')>"
        )


class DOEFactor(Base):
    """Factor (independent variable) in a DOE study.

    Each factor has low and high coded levels.  The optional
    ``center_point`` is the midpoint used for center-point runs
    in Box-Behnken or augmented factorial designs.
    """

    __tablename__ = "doe_factor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("doe_study.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    low_level: Mapped[float] = mapped_column(Float, nullable=False)
    high_level: Mapped[float] = mapped_column(Float, nullable=False)
    center_point: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )

    # Relationships
    study: Mapped["DOEStudy"] = relationship("DOEStudy", back_populates="factors")

    def __repr__(self) -> str:
        return (
            f"<DOEFactor(id={self.id}, name='{self.name}', "
            f"low={self.low_level}, high={self.high_level})>"
        )


class DOERun(Base):
    """Experimental run within a DOE study.

    ``factor_values`` stores the designed (coded or natural) factor
    settings as a JSON object keyed by factor name.  ``factor_actuals``
    stores the actual measured factor settings (may differ from design).
    ``response_value`` is populated after the run is completed.
    """

    __tablename__ = "doe_run"
    __table_args__ = (
        sa.Index("ix_doe_run_study_order", "study_id", "run_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("doe_study.id", ondelete="CASCADE"), nullable=False
    )
    run_order: Mapped[int] = mapped_column(Integer, nullable=False)
    standard_order: Mapped[int] = mapped_column(Integer, nullable=False)
    factor_values: Mapped[str] = mapped_column(Text, nullable=False)
    factor_actuals: Mapped[str] = mapped_column(Text, nullable=False)
    response_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_center_point: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.text("0")
    )
    replicate: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=sa.text("1")
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    study: Mapped["DOEStudy"] = relationship("DOEStudy", back_populates="runs")

    def __repr__(self) -> str:
        return (
            f"<DOERun(id={self.id}, study_id={self.study_id}, "
            f"run_order={self.run_order}, response={self.response_value})>"
        )


class DOEAnalysis(Base):
    """ANOVA and regression analysis results for a DOE study.

    ``anova_table`` stores the full ANOVA table as JSON (source, df,
    SS, MS, F, p-value).  ``effects`` stores the estimated main effects.
    ``interactions`` stores two-factor interaction effects.
    ``regression_model`` stores the fitted regression equation coefficients.
    ``optimal_settings`` stores the factor levels that optimize the response.
    """

    __tablename__ = "doe_analysis"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("doe_study.id", ondelete="CASCADE"), nullable=False
    )
    anova_table: Mapped[str] = mapped_column(Text, nullable=False)
    effects: Mapped[str] = mapped_column(Text, nullable=False)
    interactions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    r_squared: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    adj_r_squared: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    grand_mean: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    regression_model: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    optimal_settings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    residuals_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fitted_values_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    normality_test_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    outlier_indices_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    residual_stats_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    study: Mapped["DOEStudy"] = relationship("DOEStudy", back_populates="analyses")

    def __repr__(self) -> str:
        return (
            f"<DOEAnalysis(id={self.id}, study_id={self.study_id}, "
            f"r_squared={self.r_squared})>"
        )
