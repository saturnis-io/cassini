"""Anomaly detection models for AI/ML-based process monitoring.

Defines per-characteristic detector configuration, detected anomaly events,
and serialized ML model state for persistence across restarts.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.sample import Sample


class AnomalyDetectorConfig(Base):
    """Per-characteristic anomaly detector configuration.

    Stores settings for PELT change-point detection, Isolation Forest
    multivariate outlier detection, and K-S distribution shift detection.
    """

    __tablename__ = "anomaly_detector_config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Global toggle
    is_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("1"), nullable=False
    )

    # PELT configuration
    pelt_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("1"), nullable=False
    )
    pelt_model: Mapped[str] = mapped_column(
        String(20), server_default="l2", nullable=False
    )
    pelt_penalty: Mapped[str] = mapped_column(
        String(20), server_default="auto", nullable=False
    )
    pelt_min_segment: Mapped[int] = mapped_column(
        Integer, server_default=text("5"), nullable=False
    )

    # Isolation Forest configuration
    iforest_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("0"), nullable=False
    )
    iforest_contamination: Mapped[float] = mapped_column(
        Float, server_default=text("0.05"), nullable=False
    )
    iforest_n_estimators: Mapped[int] = mapped_column(
        Integer, server_default=text("100"), nullable=False
    )
    iforest_min_training: Mapped[int] = mapped_column(
        Integer, server_default=text("50"), nullable=False
    )
    iforest_retrain_interval: Mapped[int] = mapped_column(
        Integer, server_default=text("100"), nullable=False
    )

    # K-S distribution shift configuration
    ks_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("1"), nullable=False
    )
    ks_reference_window: Mapped[int] = mapped_column(
        Integer, server_default=text("200"), nullable=False
    )
    ks_test_window: Mapped[int] = mapped_column(
        Integer, server_default=text("50"), nullable=False
    )
    ks_alpha: Mapped[float] = mapped_column(
        Float, server_default=text("0.05"), nullable=False
    )

    # Notification integration
    notify_on_changepoint: Mapped[bool] = mapped_column(
        Boolean, server_default=text("1"), nullable=False
    )
    notify_on_anomaly_score: Mapped[bool] = mapped_column(
        Boolean, server_default=text("0"), nullable=False
    )
    notify_on_distribution_shift: Mapped[bool] = mapped_column(
        Boolean, server_default=text("1"), nullable=False
    )
    anomaly_score_threshold: Mapped[float] = mapped_column(
        Float, server_default=text("-0.5"), nullable=False
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<AnomalyDetectorConfig(id={self.id}, char_id={self.char_id}, "
            f"enabled={self.is_enabled})>"
        )


class AnomalyEvent(Base):
    """Detected anomaly event record.

    Stores details of anomalies detected by PELT, Isolation Forest,
    or K-S distribution shift detection, including human review state.
    """

    __tablename__ = "anomaly_event"
    __table_args__ = (
        Index("ix_anomaly_event_char_detected", "char_id", "detected_at"),
        Index("ix_anomaly_event_detector_type", "detector_type"),
        Index("ix_anomaly_event_severity", "severity"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )

    # Detection metadata
    detector_type: Mapped[str] = mapped_column(String(30), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)

    # Detection details (JSON)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    # Linkage to SPC data
    sample_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )
    window_start_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )
    window_end_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sample.id", ondelete="SET NULL"), nullable=True
    )

    # Human review
    is_acknowledged: Mapped[bool] = mapped_column(
        Boolean, server_default=text("0"), nullable=False
    )
    acknowledged_by: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_dismissed: Mapped[bool] = mapped_column(
        Boolean, server_default=text("0"), nullable=False
    )
    dismissed_by: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    dismissed_reason: Mapped[Optional[str]] = mapped_column(
        String(500), nullable=True
    )

    # Natural language summary
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Timestamp
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")
    sample: Mapped[Optional["Sample"]] = relationship(
        "Sample", foreign_keys=[sample_id]
    )

    def __repr__(self) -> str:
        return (
            f"<AnomalyEvent(id={self.id}, char_id={self.char_id}, "
            f"type={self.event_type}, severity={self.severity})>"
        )


class AnomalyModelState(Base):
    """Serialized ML model state for persistence across restarts.

    Stores trained Isolation Forest models as base64-encoded joblib blobs.
    One row per (char_id, detector_type) pair.
    """

    __tablename__ = "anomaly_model_state"
    __table_args__ = (
        UniqueConstraint(
            "char_id", "detector_type", name="uq_anomaly_model_char_detector"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    char_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    detector_type: Mapped[str] = mapped_column(String(30), nullable=False)
    model_blob: Mapped[str] = mapped_column(Text, nullable=False)
    training_samples: Mapped[int] = mapped_column(Integer, nullable=False)
    training_started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    training_completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    feature_names: Mapped[list[str]] = mapped_column(JSON, nullable=False)

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<AnomalyModelState(id={self.id}, char_id={self.char_id}, "
            f"detector={self.detector_type}, samples={self.training_samples})>"
        )
