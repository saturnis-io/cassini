"""Characteristic and CharacteristicRule models for SPC configuration."""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic_config import CharacteristicConfig
    from openspc.db.models.data_source import DataSource
    from openspc.db.models.hierarchy import Hierarchy
    from openspc.db.models.sample import Sample


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
    hierarchy_id: Mapped[int] = mapped_column(ForeignKey("hierarchy.id"), nullable=False)
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

    # Display formatting
    decimal_precision: Mapped[int] = mapped_column(Integer, default=3, nullable=False)

    # Relationships
    hierarchy: Mapped["Hierarchy"] = relationship("Hierarchy", back_populates="characteristics")
    rules: Mapped[list["CharacteristicRule"]] = relationship(
        "CharacteristicRule", back_populates="characteristic", cascade="all, delete-orphan"
    )
    samples: Mapped[list["Sample"]] = relationship(
        "Sample", back_populates="characteristic", cascade="all, delete-orphan"
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
        ForeignKey("characteristic.id"), primary_key=True, nullable=False
    )
    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    require_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relationship
    characteristic: Mapped["Characteristic"] = relationship(
        "Characteristic", back_populates="rules"
    )

    def __repr__(self) -> str:
        return (
            f"<CharacteristicRule(char_id={self.char_id}, rule_id={self.rule_id}, "
            f"is_enabled={self.is_enabled})>"
        )
