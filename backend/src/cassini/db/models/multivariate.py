"""Multivariate SPC and correlation models."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.plant import Plant


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MultivariateGroup(Base):
    """Plant-scoped multivariate chart group.

    Groups multiple characteristics for T-squared or MEWMA analysis.
    The ``reference_mean`` and ``reference_covariance`` fields store
    JSON-serialized vectors/matrices from Phase I baseline estimation.
    """

    __tablename__ = "multivariate_group"
    __table_args__ = (
        sa.UniqueConstraint("plant_id", "name", name="uq_multivariate_group_plant_name"),
        sa.Index("ix_multivariate_group_plant_id", "plant_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chart_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="t_squared", server_default="t_squared"
    )
    lambda_param: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.1, server_default=sa.text("0.1")
    )
    alpha: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0027, server_default=sa.text("0.0027")
    )
    covariance_method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="classical", server_default="classical"
    )
    phase: Mapped[str] = mapped_column(
        String(10), nullable=False, default="phase_ii", server_default="phase_ii"
    )
    reference_mean: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reference_covariance: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    min_samples: Mapped[int] = mapped_column(
        Integer, nullable=False, default=100, server_default=sa.text("100")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.True_()
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
    members: Mapped[list["MultivariateGroupMember"]] = relationship(
        "MultivariateGroupMember",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    samples: Mapped[list["MultivariateSample"]] = relationship(
        "MultivariateSample",
        back_populates="group",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<MultivariateGroup(id={self.id}, name='{self.name}', "
            f"chart_type='{self.chart_type}', phase='{self.phase}')>"
        )


class MultivariateGroupMember(Base):
    """Membership of a characteristic in a multivariate group.

    The ``display_order`` field controls the column ordering in the
    covariance matrix and chart legend.
    """

    __tablename__ = "multivariate_group_member"
    __table_args__ = (
        sa.UniqueConstraint(
            "group_id", "characteristic_id",
            name="uq_mv_group_member_group_char",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("multivariate_group.id", ondelete="CASCADE"), nullable=False
    )
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    display_order: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )

    # Relationships
    group: Mapped["MultivariateGroup"] = relationship(
        "MultivariateGroup", back_populates="members"
    )
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<MultivariateGroupMember(id={self.id}, group_id={self.group_id}, "
            f"characteristic_id={self.characteristic_id})>"
        )


class MultivariateSample(Base):
    """Computed T-squared data point for a multivariate group.

    The ``decomposition`` field stores JSON with per-variable contributions
    to the T-squared statistic (for MYT decomposition diagnostics).
    The ``raw_values`` field stores the original measurement vector as JSON.
    """

    __tablename__ = "multivariate_sample"
    __table_args__ = (
        sa.Index(
            "ix_multivariate_sample_group_ts",
            "group_id", "sample_timestamp",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("multivariate_group.id", ondelete="CASCADE"), nullable=False
    )
    t_squared: Mapped[float] = mapped_column(Float, nullable=False)
    ucl: Mapped[float] = mapped_column(Float, nullable=False)
    in_control: Mapped[bool] = mapped_column(Boolean, nullable=False)
    decomposition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_values: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sample_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    group: Mapped["MultivariateGroup"] = relationship(
        "MultivariateGroup", back_populates="samples"
    )

    def __repr__(self) -> str:
        return (
            f"<MultivariateSample(id={self.id}, group_id={self.group_id}, "
            f"t_squared={self.t_squared:.4f}, in_control={self.in_control})>"
        )


class CorrelationResult(Base):
    """Cached correlation matrix computation result.

    The ``characteristic_ids`` field stores a JSON array of characteristic IDs
    that were included in the analysis.  ``matrix`` and ``p_values`` store
    the full NxN matrices as nested JSON arrays.  ``pca_eigenvalues`` and
    ``pca_loadings`` store PCA decomposition results when requested.
    """

    __tablename__ = "correlation_result"
    __table_args__ = (
        sa.Index(
            "ix_correlation_result_plant_computed",
            "plant_id", "computed_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    characteristic_ids: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pearson", server_default="pearson"
    )
    matrix: Mapped[str] = mapped_column(Text, nullable=False)
    p_values: Mapped[str] = mapped_column(Text, nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, nullable=False)
    pca_eigenvalues: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pca_loadings: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f"<CorrelationResult(id={self.id}, plant_id={self.plant_id}, "
            f"method='{self.method}', sample_count={self.sample_count})>"
        )
