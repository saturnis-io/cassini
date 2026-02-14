"""Pydantic schemas for anomaly detection API endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Configuration Schemas ---


class AnomalyConfigResponse(BaseModel):
    """Response schema for anomaly detector configuration."""

    id: int
    char_id: int
    is_enabled: bool

    # PELT
    pelt_enabled: bool
    pelt_model: str
    pelt_penalty: str
    pelt_min_segment: int

    # Isolation Forest
    iforest_enabled: bool
    iforest_contamination: float
    iforest_n_estimators: int
    iforest_min_training: int
    iforest_retrain_interval: int

    # K-S
    ks_enabled: bool
    ks_reference_window: int
    ks_test_window: int
    ks_alpha: float

    # Notification
    notify_on_changepoint: bool
    notify_on_anomaly_score: bool
    notify_on_distribution_shift: bool
    anomaly_score_threshold: float

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AnomalyConfigUpdate(BaseModel):
    """Request schema for updating anomaly detector configuration."""

    is_enabled: bool | None = None

    # PELT
    pelt_enabled: bool | None = None
    pelt_model: str | None = Field(None, pattern=r"^(l2|rbf|normal)$")
    pelt_penalty: str | None = None
    pelt_min_segment: int | None = Field(None, ge=2, le=50)

    # Isolation Forest
    iforest_enabled: bool | None = None
    iforest_contamination: float | None = Field(None, ge=0.01, le=0.20)
    iforest_n_estimators: int | None = Field(None, ge=50, le=500)
    iforest_min_training: int | None = Field(None, ge=20, le=500)
    iforest_retrain_interval: int | None = Field(None, ge=50, le=1000)

    # K-S
    ks_enabled: bool | None = None
    ks_reference_window: int | None = Field(None, ge=50, le=1000)
    ks_test_window: int | None = Field(None, ge=20, le=200)
    ks_alpha: float | None = Field(None, ge=0.01, le=0.10)

    # Notification
    notify_on_changepoint: bool | None = None
    notify_on_anomaly_score: bool | None = None
    notify_on_distribution_shift: bool | None = None
    anomaly_score_threshold: float | None = Field(None, ge=-1.0, le=0.0)


# --- Event Schemas ---


class AnomalyEventResponse(BaseModel):
    """Response schema for an anomaly event."""

    id: int
    char_id: int
    detector_type: str
    event_type: str
    severity: str
    details: dict[str, Any]
    sample_id: int | None = None
    window_start_id: int | None = None
    window_end_id: int | None = None
    summary: str | None = None
    is_acknowledged: bool
    acknowledged_by: str | None = None
    acknowledged_at: datetime | None = None
    is_dismissed: bool
    dismissed_by: str | None = None
    dismissed_reason: str | None = None
    detected_at: datetime

    model_config = {"from_attributes": True}


class AnomalyEventListResponse(BaseModel):
    """Paginated response for anomaly events."""

    events: list[AnomalyEventResponse]
    total: int
    offset: int
    limit: int


class AcknowledgeRequest(BaseModel):
    """Request schema for acknowledging an anomaly event."""

    pass


class DismissRequest(BaseModel):
    """Request schema for dismissing an anomaly event as false positive."""

    reason: str | None = Field(None, max_length=500)


# --- Summary Schemas ---


class DetectorStatusResponse(BaseModel):
    """Status of a single detector for a characteristic."""

    detector_type: str
    enabled: bool
    last_detection_at: datetime | None = None
    model_age_samples: int | None = None
    events_last_24h: int = 0


class AnomalySummaryResponse(BaseModel):
    """Summary response for a characteristic's anomaly state."""

    characteristic_id: int
    characteristic_name: str
    active_anomalies: int
    latest_summary: str
    detectors: list[DetectorStatusResponse]
    last_analysis_at: datetime | None = None


class AnomalyStatusResponse(BaseModel):
    """Detector status response for a characteristic."""

    characteristic_id: int
    is_enabled: bool
    detectors: list[DetectorStatusResponse]
    total_events: int
    active_events: int
    last_event_at: datetime | None = None


# --- Dashboard Schemas ---


class DashboardEventResponse(BaseModel):
    """Anomaly event with characteristic name for dashboard display."""

    id: int
    char_id: int
    characteristic_name: str | None = None
    detector_type: str
    event_type: str
    severity: str
    summary: str | None = None
    is_acknowledged: bool
    detected_at: datetime

    model_config = {"from_attributes": True}


class DashboardStatsResponse(BaseModel):
    """Summary statistics for the anomaly dashboard."""

    total: int
    active: int
    acknowledged: int
    dismissed: int
    by_severity: dict[str, int]
    by_detector: dict[str, int]


# --- Analysis Schemas ---


class AnalysisResultResponse(BaseModel):
    """Response for on-demand analysis trigger."""

    characteristic_id: int
    events_detected: int
    events: list[AnomalyEventResponse]
