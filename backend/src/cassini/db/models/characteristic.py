"""Characteristic and CharacteristicRule models for SPC configuration."""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic_config import CharacteristicConfig
    from cassini.db.models.data_source import DataSource
    from cassini.db.models.hierarchy import Hierarchy
    from cassini.db.models.sample import Sample


class SubgroupMode(str, Enum):
    """Subgroup size handling modes for variable sample sizes.

    STANDARDIZED: Plot Z-scores with fixed +/-3 control limits.
                  Requires stored_sigma and stored_center_line.
    VARIABLE_LIMITS: Recalculate UCL/LCL per point based on actual sample size.
                     Requires stored_sigma and stored_center_line.
    NOMINAL_TOLERANCE: Use nominal subgroup size for limits, with minimum threshold.
                       Default mode for backward compatibility.
    """

    STANDARDIZED = "STANDARDIZED"
    VARIABLE_LIMITS = "VARIABLE_LIMITS"
    NOMINAL_TOLERANCE = "NOMINAL_TOLERANCE"


class Characteristic(Base):
    """SPC Characteristic configuration model.

    Defines a measurable quality characteristic to be monitored
    using Statistical Process Control.
    """

    __tablename__ = "characteristic"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    hierarchy_id: Mapped[int] = mapped_column(ForeignKey("hierarchy.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    subgroup_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Upper Spec Limit
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Lower Spec Limit
    ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Upper Control Limit
    lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # Lower Control Limit
    # Subgroup mode configuration
    subgroup_mode: Mapped[str] = mapped_column(
        String(50), default="NOMINAL_TOLERANCE", nullable=False
    )
    min_measurements: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    warn_below_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Stored parameters for Mode A (STANDARDIZED) and Mode B (VARIABLE_LIMITS)
    stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    limits_calc_params: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Attribute chart configuration
    data_type: Mapped[str] = mapped_column(String(20), default="variable", nullable=False)
    attribute_chart_type: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    default_sample_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Advanced chart type (CUSUM, EWMA)
    chart_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cusum_target: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cusum_k: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cusum_h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ewma_lambda: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ewma_l: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Display formatting
    decimal_precision: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Distribution fitting (Sprint 5 - A1)
    distribution_method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    box_cox_lambda: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distribution_params: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Laney correction (Sprint 5 - A3)
    use_laney_correction: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa.text("0"), nullable=False
    )

    # Short-run charts (Sprint 6 - B2)
    short_run_mode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # CUSUM reset point
    cusum_reset_after_sample_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    hierarchy: Mapped["Hierarchy"] = relationship("Hierarchy", back_populates="characteristics")
    rules: Mapped[list["CharacteristicRule"]] = relationship(
        "CharacteristicRule", back_populates="characteristic", cascade="all, delete-orphan"
    )
    samples: Mapped[list["Sample"]] = relationship(
        "Sample", back_populates="characteristic", cascade="all, delete-orphan",
        foreign_keys="[Sample.char_id]",
    )
    config: Mapped[Optional["CharacteristicConfig"]] = relationship(
        "CharacteristicConfig", back_populates="characteristic", uselist=False,
        cascade="all, delete-orphan"
    )
    data_source: Mapped[Optional["DataSource"]] = relationship(
        "DataSource", back_populates="characteristic", uselist=False,
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return (
            f"<Characteristic(id={self.id}, name='{self.name}', "
            f"hierarchy_id={self.hierarchy_id})>"
        )


class CharacteristicRule(Base):
    """Nelson Rules configuration per characteristic.

    Tracks which Nelson Rules are enabled for a specific characteristic,
    and whether violations require acknowledgement.
    """

    __tablename__ = "characteristic_rules"

    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), primary_key=True, nullable=False
    )
    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Custom rule parameters (Sprint 5 - A2) — JSON string
    parameters: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)

    # Relationship
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="rules"
    )

    def __repr__(self) -> str:
        return (
            f"<CharacteristicRule(char_id={self.char_id}, rule_id={self.rule_id}, "
            f"is_enabled={self.is_enabled})>"
        )
