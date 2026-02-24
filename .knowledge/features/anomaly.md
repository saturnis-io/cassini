# AI/ML Anomaly Detection

## Data Flow
```
AnomalyDetector subscribes to SampleProcessedEvent on Event Bus
  → for each sample, loads AnomalyDetectorConfig for characteristic
  → runs enabled detectors on analysis window (up to 1000 samples):
    - PELTDetector: change-point detection (ruptures library)
    - IsolationForestDetector: multivariate outlier scoring (scikit-learn)
    - KSDetector: Kolmogorov-Smirnov distribution shift test
  → persists AnomalyEvent with summary → publishes AnomalyDetectedEvent

AnomalyConfigPanel.tsx → useAnomalyConfig(charId)
  → GET /api/v1/anomaly/{charId}/config
  → PUT /api/v1/anomaly/{charId}/config (update thresholds, toggles)

AnomalyEventList.tsx → useAnomalyEvents(charId)
  → GET /api/v1/anomaly/{charId}/events (paginated, filtered)
  → POST /{charId}/events/{id}/acknowledge
  → POST /{charId}/events/{id}/dismiss

ChartToolbar "AI Insights" toggle → AnomalyOverlay.tsx
  → ECharts markPoint/markArea overlay on ControlChart
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| AnomalyDetectorConfig | db/models/anomaly.py | id, char_id(FK unique), is_enabled, pelt_enabled, pelt_model, pelt_penalty, pelt_min_segment, iforest_enabled, iforest_contamination, iforest_n_estimators, iforest_min_training, iforest_retrain_interval, ks_enabled, ks_reference_window, ks_test_window, ks_alpha, notify_on_changepoint, notify_on_anomaly_score, notify_on_distribution_shift, anomaly_score_threshold, created_at, updated_at | 030 |
| AnomalyEvent | db/models/anomaly.py | id, char_id(FK), detector_type, event_type, severity, details(JSON), sample_id(FK nullable), window_start_id(FK nullable), window_end_id(FK nullable), is_acknowledged, acknowledged_by, acknowledged_at, is_dismissed, dismissed_by, dismissed_reason, summary, detected_at; indexes: (char_id, detected_at), (detector_type), (severity) | 030 |
| AnomalyModelState | db/models/anomaly.py | id, char_id(FK), detector_type, model_blob(Text), training_samples, training_started_at, training_completed_at, feature_names(JSON); unique: (char_id, detector_type) | 030 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/anomaly/dashboard | offset, limit | list[DashboardEventResponse] | get_current_user (supervisor+) |
| GET | /api/v1/anomaly/dashboard/stats | - | DashboardStatsResponse | get_current_user (supervisor+) |
| GET | /api/v1/anomaly/{char_id}/config | - | AnomalyConfigResponse | get_current_user (supervisor+) |
| PUT | /api/v1/anomaly/{char_id}/config | body: AnomalyConfigUpdate | AnomalyConfigResponse | get_current_user (engineer+) |
| DELETE | /api/v1/anomaly/{char_id}/config | - | 204 | get_current_user (engineer+) |
| GET | /api/v1/anomaly/{char_id}/events | detector_type, severity, acknowledged, dismissed, offset, limit | AnomalyEventListResponse | get_current_user (operator+) |
| GET | /api/v1/anomaly/{char_id}/events/{event_id} | - | AnomalyEventResponse | get_current_user (operator+) |
| POST | /api/v1/anomaly/{char_id}/events/{event_id}/acknowledge | body: AcknowledgeRequest | AnomalyEventResponse | get_current_user (operator+) |
| POST | /api/v1/anomaly/{char_id}/events/{event_id}/dismiss | body: DismissRequest | AnomalyEventResponse | get_current_user (engineer+) |
| GET | /api/v1/anomaly/{char_id}/summary | - | AnomalySummaryResponse | get_current_user (supervisor+) |
| GET | /api/v1/anomaly/{char_id}/status | - | AnomalyStatusResponse | get_current_user (supervisor+) |
| POST | /api/v1/anomaly/{char_id}/analyze | - | AnalysisResultResponse | get_current_user (engineer+) |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| AnomalyDetector | core/anomaly/detector.py | setup_subscriptions(), analyze_characteristic(), _process_sample(), _persist_event(), _publish_notification() |
| PELTDetector | core/anomaly/pelt_detector.py | analyze() — ruptures-based change-point detection |
| IsolationForestDetector | core/anomaly/iforest_detector.py | score() — scikit-learn IsolationForest with persistent model state |
| KSDetector | core/anomaly/ks_detector.py | analyze() — Kolmogorov-Smirnov two-sample test |
| generate_event_summary | core/anomaly/summary.py | Natural language summary generation for anomaly events |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| AnomalyConfigRepository | db/repositories/anomaly.py | get_by_char_id, upsert, delete_by_char_id |
| AnomalyEventRepository | db/repositories/anomaly.py | get_events, count_events, acknowledge, dismiss, get_active_events_for_plant, get_stats_for_plant, get_latest_for_char |
| AnomalyModelStateRepository | db/repositories/anomaly.py | get_by_char_and_type |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| AnomalyConfigPanel | components/anomaly/AnomalyConfigPanel.tsx | charId | useAnomalyConfig, useUpdateAnomalyConfig |
| AnomalyEventList | components/anomaly/AnomalyEventList.tsx | charId | useAnomalyEvents, useAcknowledgeAnomaly, useDismissAnomaly |
| AnomalyEventDetail | components/anomaly/AnomalyEventDetail.tsx | eventId | useAnomalyEvent |
| AnomalyOverlay | components/anomaly/AnomalyOverlay.tsx | charId, chartInstance | useAnomalyEvents — renders ECharts markPoint/markArea |
| AnomalySummaryCard | components/anomaly/AnomalySummaryCard.tsx | charId | useAnomalySummary |
| AnomalyBadge | components/anomaly/AnomalyBadge.tsx | charId | useAnomalyStatus |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useAnomalyConfig | anomalyApi.getConfig | GET /anomaly/{charId}/config | ['anomaly', 'config', charId] |
| useUpdateAnomalyConfig | anomalyApi.updateConfig | PUT /anomaly/{charId}/config | invalidates config |
| useResetAnomalyConfig | anomalyApi.resetConfig | DELETE /anomaly/{charId}/config | invalidates config |
| useAnomalyEvents | anomalyApi.getEvents | GET /anomaly/{charId}/events | ['anomaly', 'events', charId, params] |
| useAnomalyEvent | anomalyApi.getEvent | GET /anomaly/{charId}/events/{id} | ['anomaly', 'event', charId, id] |
| useAcknowledgeAnomaly | anomalyApi.acknowledge | POST /anomaly/{charId}/events/{id}/acknowledge | invalidates events |
| useDismissAnomaly | anomalyApi.dismiss | POST /anomaly/{charId}/events/{id}/dismiss | invalidates events |
| useAnomalySummary | anomalyApi.getSummary | GET /anomaly/{charId}/summary | ['anomaly', 'summary', charId] |
| useAnomalyStatus | anomalyApi.getStatus | GET /anomaly/{charId}/status | ['anomaly', 'status', charId] |
| useAnomalyDashboard | anomalyApi.getDashboard | GET /anomaly/dashboard | ['anomaly', 'dashboard'] |
| useAnomalyDashboardStats | anomalyApi.getDashboardStats | GET /anomaly/dashboard/stats | ['anomaly', 'dashboard-stats'] |
| useTriggerAnalysis | anomalyApi.analyze | POST /anomaly/{charId}/analyze | invalidates events+summary |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /dashboard | OperatorDashboard.tsx | AnomalyOverlay (via ChartToolbar "AI Insights" toggle) |
| /characteristics/{id} | CharacteristicDetailView.tsx | AnomalyConfigPanel, AnomalyEventList, AnomalyOverlay |

## Migrations
- 030 (ai_anomaly_detection): anomaly_detector_config, anomaly_event, anomaly_model_state tables

## Known Issues / Gotchas
- AnomalyDetector subscribes to SampleProcessedEvent via Event Bus (fire-and-forget, does not block SPC pipeline)
- Isolation Forest model state persisted as base64-encoded joblib blob in anomaly_model_state table
- Dashboard routes (static paths) MUST come before /{char_id} routes due to FastAPI top-to-bottom matching
- Minimum 10 samples required in analysis window before any detector runs
- PELT requires `ruptures>=1.1.9`, Isolation Forest requires optional `scikit-learn>=1.4.0` (ml extra)
- AnomalyOverlay uses ECharts markPoint (point anomalies) and markArea (change-point regions)
