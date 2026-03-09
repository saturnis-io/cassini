---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 4 - Wave 4]]"
tags:
  - feature
  - active
aliases:
  - AI Anomaly Detection
  - AI/ML Anomaly Detection
---

# Anomaly Detection

AI/ML-powered anomaly detection using three algorithms: PELT change-point detection (ruptures library), Kolmogorov-Smirnov distribution shift testing, and Isolation Forest outlier detection (scikit-learn, optional). Subscribes to the Event Bus and runs asynchronously after each sample is processed. Results overlay on control charts as markPoints/markAreas.

## Key Backend Components

- **Detector Orchestrator**: `core/anomaly/detector.py` -- `AnomalyDetector`, `on_sample_processed()`, `run_all_detectors()`
- **Algorithms**: `core/anomaly/pelt_detector.py` (PELT/ruptures), `core/anomaly/iforest_detector.py` (Isolation Forest), `core/anomaly/ks_detector.py` (K-S test)
- **Support**: `core/anomaly/feature_builder.py`, `core/anomaly/model_store.py` (base64 joblib), `core/anomaly/summary.py`
- **Models**: `AnomalyDetectorConfig`, `AnomalyEvent`, `AnomalyModelState` in `db/models/anomaly.py`
- **Router**: `api/v1/anomaly.py` -- 12 endpoints (config, events, acknowledge, dismiss, summary, retrain, model state)
- **Repository**: `db/repositories/anomaly.py`
- **Migration**: 030

## Key Frontend Components

- `AnomalyOverlay.tsx` -- ECharts markPoint/markArea overlay on control charts
- `AnomalyConfigPanel.tsx` -- per-characteristic detector configuration
- `AnomalyEventList.tsx` -- event list with acknowledge/dismiss actions
- `AnomalyEventDetail.tsx`, `AnomalySummaryCard.tsx`, `AnomalyBadge.tsx`
- Toggle: "AI Insights" button in `ChartToolbar.tsx`
- Hooks: `useAnomalyConfig`, `useAnomalyEvents`, `useAnomalySummary`, `useAcknowledgeEvent`

## Connections

- Subscribes to [[SPC Engine]] via Event Bus (`SampleProcessedEvent`)
- Anomaly events can trigger [[Notifications]] dispatch
- Configured per-characteristic, respects [[Auth]] engineer role requirement for config changes
- Isolation Forest model state persisted as base64 joblib blobs

## Known Limitations

- scikit-learn is an optional dependency (`ml` extra) -- Isolation Forest degrades gracefully if not installed
- Model blobs can be large for Isolation Forest models (base64-encoded joblib)
- Event Bus subscriber fires asynchronously -- detection does not block SPC processing
