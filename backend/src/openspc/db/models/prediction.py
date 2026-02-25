"""Predictive analytics models for SPC forecasting."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PredictionConfig(Base):
    """Per-characteristic prediction configuration.

    Controls whether predictive analytics are enabled for a characteristic
    and how models are fitted.  The ``confidence_levels`` field stores a
    JSON array of confidence interval widths (e.g. ``[0.8, 0.95]``).
    """

    __tablename__ = "prediction_config"
    __table_args__ = (
        sa.UniqueConstraint(
            "characteristic_id",
            name="uq_prediction_config_characteristic_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.text("0")
    )
    model_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="auto", server_default="auto"
    )
    forecast_horizon: Mapped[int] = mapped_column(
        Integer, nullable=False, default=20, server_default=sa.text("20")
    )
    refit_interval: Mapped[int] = mapped_column(
        Integer, nullable=False, default=50, server_default=sa.text("50")
    )
    confidence_levels: Mapped[str] = mapped_column(
        Text, nullable=False, default="[0.8, 0.95]", server_default="[0.8, 0.95]"
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
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<PredictionConfig(id={self.id}, "
            f"characteristic_id={self.characteristic_id}, "
            f"model_type='{self.model_type}', enabled={self.is_enabled})>"
        )


class PredictionModel(Base):
    """Fitted prediction model snapshot.

    Each time a model is refitted, a new row is created with
    ``is_current=True`` and the previous model is marked as
    ``is_current=False``.  The ``model_params`` field stores
    JSON-serialized model coefficients.
    """

    __tablename__ = "prediction_model"
    __table_args__ = (
        sa.Index(
            "ix_prediction_model_char_current",
            "characteristic_id", "is_current",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    model_type: Mapped[str] = mapped_column(String(30), nullable=False)
    model_params: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    aic: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    training_samples: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    is_current: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")
    forecasts: Mapped[list["Forecast"]] = relationship(
        "Forecast",
        back_populates="model",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<PredictionModel(id={self.id}, "
            f"characteristic_id={self.characteristic_id}, "
            f"type='{self.model_type}', current={self.is_current})>"
        )


class Forecast(Base):
    """Individual forecast data point with prediction intervals.

    Each forecast belongs to a prediction model and projects one step
    ahead.  Confidence bounds at 80% and 95% levels are standard but
    the actual levels are configured in PredictionConfig.
    """

    __tablename__ = "forecast"
    __table_args__ = (
        sa.Index(
            "ix_forecast_char_generated",
            "characteristic_id", "generated_at",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_id: Mapped[int] = mapped_column(
        ForeignKey("prediction_model.id", ondelete="CASCADE"), nullable=False
    )
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    step: Mapped[int] = mapped_column(Integer, nullable=False)
    predicted_value: Mapped[float] = mapped_column(Float, nullable=False)
    lower_80: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upper_80: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lower_95: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    upper_95: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    predicted_ooc: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=sa.text("0")
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )

    # Relationships
    model: Mapped["PredictionModel"] = relationship(
        "PredictionModel", back_populates="forecasts"
    )
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<Forecast(id={self.id}, model_id={self.model_id}, "
            f"step={self.step}, value={self.predicted_value:.4f}, "
            f"ooc={self.predicted_ooc})>"
        )
