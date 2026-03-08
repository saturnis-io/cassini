---
type: design
status: complete
created: 2026-02-13
updated: 2026-03-06
sprint: "[[Sprints/Sprint 4 - Wave 4]]"
tags: [design, complete]
---

# AI/ML Anomaly Detection

Intelligent anomaly detection that goes beyond Nelson Rules by detecting change-points, distributional anomalies, and multivariate outliers -- then surfaces results as actionable insights integrated with the notification system.

**Design philosophy**: Start with proven statistical methods (PELT, Z-score enrichment), layer ML (Isolation Forest) as a second tier, and keep the architecture extensible. Every detection must be explainable -- no black boxes.

## Algorithm Selection

### Tier 1: PELT Change-Point Detection (ruptures)

**What it detects**: Abrupt shifts in process mean or variance -- the #1 thing SPC engineers care about that Nelson Rules 2-4 catch late (requiring 6-14 consecutive points).

- O(n) average complexity, fast enough for real-time
- Auto penalty: `3 * log(n)` (BIC criterion)
- Models: `l2` (mean shift), `rbf` (mean+variance shift), `normal` (parametric)
- Configurable min segment size (default 5)

### Tier 2: Isolation Forest (scikit-learn, opt-in)

**What it detects**: Multivariate outliers using 6 features simultaneously (mean, range, sigma distance, delta mean, rolling std, time gap).

- Unsupervised -- no labeled data required
- O(n) training, O(log n) scoring
- Default contamination: 5%, retrain every 100 samples
- Off by default (Tier 2, opt-in)

### Tier 3: K-S Distribution Shift (scipy)

**What it detects**: Gradual distribution changes -- normality violations, bimodality emergence, variance inflation.

- Two-sample Kolmogorov-Smirnov test (reference window vs recent window)
- Non-parametric, zero new dependencies
- Default: 200-sample reference, 50-sample test, alpha=0.05

## Architecture: Hybrid Processing

**Real-time** for lightweight operations (K-S p-value, IsolationForest score) via Event Bus subscription to `SampleProcessedEvent`, plus **periodic background** for heavy operations (PELT full refit, IsolationForest retrain).

```
Sample submitted -> SPC Engine -> Event Bus: SampleProcessedEvent
    -> AnomalyDetector.on_sample_processed()
        -> PELT: append to window, re-run
        -> IsolationForest: score against trained model
        -> K-S: update test window, re-run
    -> If anomaly detected:
        -> Persist AnomalyEvent to DB
        -> Publish AnomalyDetectedEvent
        -> NotificationDispatcher picks it up
```

## Data Model (Migration 030)

### 3 New Tables

- **`anomaly_detector_config`**: Per-characteristic detector configuration (PELT model/penalty/min_segment, IForest contamination/estimators/threshold, K-S windows/alpha, notification toggles)
- **`anomaly_event`**: Detected anomaly records (detector type, event type, severity, JSON details, sample linkage, acknowledge/dismiss workflow, natural language summary)
- **`anomaly_model_state`**: Trained IsolationForest model persistence (base64-encoded joblib, training metadata)

## Backend Module: `core/anomaly/`

| File | Purpose |
|------|---------|
| `detector.py` | AnomalyDetector orchestrator (Event Bus subscriber) |
| `pelt_detector.py` | PELT change-point detection with in-memory known-changepoint cache |
| `iforest_detector.py` | IsolationForest scoring + async retrain + model persistence |
| `ks_detector.py` | K-S distribution shift detection |
| `feature_builder.py` | Feature extraction from SPC samples (6 features) |
| `model_store.py` | Model serialization/persistence |
| `summary.py` | Template-based natural language summary generation (not LLM) |

### Severity Classification

- **CRITICAL**: Shift >= 2 sigma, anomaly score < -0.7
- **WARNING**: Shift >= 1 sigma, anomaly score < -0.5
- **INFO**: Smaller shifts, borderline scores

## API: 12 Endpoints

Configuration (GET/PUT/DELETE config, 3), events (list/detail/acknowledge/dismiss/summary, 5), analysis trigger (analyze/status, 2), dashboard (list/stats, 2).

## Frontend: Chart Overlay + Dashboard

### Overlay on Existing Charts (Primary)

Anomaly markers rendered as ECharts markPoint/markArea:
- **Changepoints**: Diamond marker at changepoint sample with shift magnitude tooltip
- **Outliers**: Inverted triangle marker with anomaly score
- **Distribution shifts**: Shaded markArea spanning shifted region
- Toggle via "AI Insights" button on chart toolbar

### Components

- `AnomalyOverlay.tsx` -- ECharts mark generator
- `AnomalyEventList.tsx` -- Filterable event list with acknowledge/dismiss
- `AnomalyConfigPanel.tsx` -- Per-characteristic detector configuration in settings
- `AnomalySummaryCard.tsx` -- Natural language summary display
- `AnomalyBadge.tsx` -- Count badge for chart headers

## Integration Points

- **Event Bus**: SampleProcessedEvent -> AnomalyDetector -> AnomalyDetectedEvent -> NotificationDispatcher
- **Notifications**: Email/webhook on changepoints and distribution shifts (configurable)
- **Retention**: CASCADE delete on characteristic deletion; PurgeEngine extended for anomaly events
- **Audit Trail**: Configuration changes captured by existing AuditMiddleware
- **WebSocket**: Real-time anomaly push to connected clients

## Dependencies

| Package | Size | Strategy |
|---------|------|----------|
| `ruptures>=1.1.9` | ~2MB | Required (core Tier 1) |
| `scikit-learn>=1.4.0` | ~25MB | Optional (`pip install cassini[ml]`) |

## Performance

| Operation | Time | Frequency |
|-----------|------|-----------|
| PELT (200 samples, l2) | ~1ms | Every sample |
| IsolationForest score | ~0.1ms | Every sample (if enabled) |
| IsolationForest retrain | ~50ms | Every 100 samples |
| K-S test | ~0.5ms | Every sample |
| **Total overhead** | ~2-3ms | vs 5-10ms SPC engine baseline |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary algorithm | PELT via ruptures | O(n), proven, 2MB dep, catches shifts faster than Nelson |
| ML algorithm | Isolation Forest (opt-in) | Multivariate outliers, unsupervised |
| Processing model | Hybrid (real-time + background retrain) | Immediate detection with managed compute cost |
| Summary generation | Template-based (not LLM) | Deterministic, fast, no external API |
| Default state | PELT+K-S on, IF off | Conservative start, users opt into ML |
