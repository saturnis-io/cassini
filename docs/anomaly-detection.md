# AI/ML Anomaly Detection

OpenSPC includes three machine learning detectors that run per-characteristic
alongside traditional Nelson rules. This document covers the algorithms,
configuration, chart overlay, event management, and the full API surface.

---

## 1. Overview -- Beyond Nelson Rules

Traditional SPC relies on Nelson rules (Western Electric rules) to detect
out-of-control conditions. These rules are effective for clear patterns --
a point beyond 3-sigma, 9 consecutive points on one side of the center line --
but they have blind spots:

| Nelson Rule | What It Catches | Blind Spot |
|---|---|---|
| Rule 1 | Single point > 3 sigma | Misses gradual drift below 3 sigma |
| Rule 2 | 9+ points same side | Requires 9 samples -- slow to trigger |
| Rule 3 | 6+ points trending | Requires 6 samples of monotonic trend |
| Rule 4 | 14+ alternating | Only catches alternation patterns |

OpenSPC's anomaly detection fills these gaps with three complementary
algorithms:

| Detector | Detection Type | Strength |
|---|---|---|
| **PELT** | Changepoint (process shift) | Catches mean shifts in O(n) time, often before Nelson Rule 2 triggers |
| **K-S Test** | Distribution shift | Detects gradual drift and variance changes by comparing windows |
| **Isolation Forest** | Multivariate outlier | Catches anomalies across 6 features simultaneously |

The detectors are **complementary to Nelson rules**, not replacements. Nelson
rules remain the primary SPC mechanism; anomaly detection provides a secondary
layer for subtle or complex process changes.

---

## 2. Quick Start with the FDA Demo

The pre-seeded demo database includes anomaly data for immediate exploration.

```bash
cd backend
python scripts/seed_fda_demo.py --db openspc.db
uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
```

**Step-by-step walkthrough:**

1. Start both backend and frontend servers.
2. Log in and navigate to the **Dashboard**.
3. Select a characteristic (e.g., "Tablet Weight" under PharmaCorp).
4. In the chart toolbar, click the **AI Insights** toggle.
5. Anomaly markers appear on the control chart:
   - **Diamond markers + dashed vertical lines**: Changepoints detected by PELT.
   - **Shaded regions**: Distribution shifts detected by K-S.
   - **Inverted triangle markers**: Outliers detected by Isolation Forest.
6. Click any marker to see the event details in the tooltip.
7. Open the **Anomaly Events** panel below the chart to see the full event list.
8. Acknowledge or dismiss events from the event detail view.

---

## 3. Algorithms

### 3.1 PELT -- Changepoint Detection

**What it detects:** Abrupt shifts in process mean or variance.

**Library:** `ruptures` (Pruned Exact Linear Time algorithm).

**How it works:**

1. Extracts sample means from the analysis window (up to 1000 samples).
2. Fits a PELT model with the configured cost function.
3. Predicts changepoint locations using the configured penalty.
4. Filters out previously detected changepoints (cached per characteristic).
5. For each new changepoint, computes the mean shift magnitude in sigma units.

**Parameters:**

| Parameter | Config Key | Default | Range | Description |
|---|---|---|---|---|
| Cost model | `pelt_model` | `l2` | `l2`, `rbf`, `normal` | `l2` detects mean shifts. `rbf` detects mean + variance changes. `normal` uses a parametric Gaussian model. |
| Penalty | `pelt_penalty` | `auto` | `auto` or numeric | Controls sensitivity. `auto` uses `3.0 * ln(n)`. Lower values detect more changepoints. |
| Min segment | `pelt_min_segment` | 5 | 2-50 | Minimum samples between changepoints. Prevents over-fragmentation. |

**Severity classification:**

| Shift Magnitude | Severity |
|---|---|
| >= 2.0 sigma | CRITICAL |
| >= 1.0 sigma | WARNING |
| < 1.0 sigma | INFO |

**Example summary:** "Process shift detected: mean changed by 0.350 (1.8 sigma)"

### 3.2 Kolmogorov-Smirnov -- Distribution Shift Detection

**What it detects:** Gradual changes in the process distribution shape, mean, or
variance.

**Library:** `scipy.stats.ks_2samp` (two-sample K-S test).

**How it works:**

1. Splits the sample window into a reference window (older, presumably stable
   samples) and a test window (most recent samples).
2. Runs the two-sample K-S test to compare the distributions.
3. If the p-value falls below the significance level (alpha), a distribution
   shift is detected.
4. Computes reference and test window statistics (mean, standard deviation) for
   context.

**Parameters:**

| Parameter | Config Key | Default | Range | Description |
|---|---|---|---|---|
| Reference window | `ks_reference_window` | 200 | 50-1000 | Number of samples in the older reference window. |
| Test window | `ks_test_window` | 50 | 20-200 | Number of samples in the recent test window. |
| Significance | `ks_alpha` | 0.05 | 0.01-0.10 | P-value threshold. Lower = fewer false positives. |

**Severity classification:**

| P-value | Severity |
|---|---|
| < alpha / 10 | CRITICAL |
| < alpha / 2 | WARNING |
| < alpha | INFO |

**Example summary:** "Process distribution has shifted (K-S statistic: 0.3142,
p-value: 0.0023). Recent data does not match the established reference
distribution."

### 3.3 Isolation Forest -- Multivariate Outlier Detection

**What it detects:** Anomalous data points that are unusual across multiple
process features simultaneously.

**Library:** `scikit-learn` (optional dependency -- install with
`pip install openspc[ml]`).

**How it works:**

1. Builds a 6-dimensional feature vector for each sample:
   - `mean` -- Sample mean (plotted value)
   - `range` -- Range value within the subgroup
   - `sigma_distance` -- Distance from center line in sigma units
   - `delta_mean` -- Change from previous sample mean
   - `rolling_std_5` -- Standard deviation of the last 5 sample means
   - `time_gap` -- Seconds since the previous sample
2. Trains an Isolation Forest model on the full sample window.
3. Scores each new sample against the trained model.
4. If the anomaly score falls below the threshold, the point is flagged.

**Parameters:**

| Parameter | Config Key | Default | Range | Description |
|---|---|---|---|---|
| Contamination | `iforest_contamination` | 0.05 | 0.01-0.20 | Expected proportion of outliers. Higher = more sensitive. |
| N estimators | `iforest_n_estimators` | 100 | 50-500 | Number of trees in the forest. More = better accuracy, slower training. |
| Min training | `iforest_min_training` | 50 | 20-500 | Minimum samples required before the model can train. |
| Retrain interval | `iforest_retrain_interval` | 100 | 50-1000 | Samples between model retraining. |
| Score threshold | `anomaly_score_threshold` | -0.5 | -1.0 to 0.0 | Decision boundary. More negative = fewer detections. |

**Severity classification:**

| Anomaly Score | Severity |
|---|---|
| < -0.7 | CRITICAL |
| < threshold | WARNING |

**Model persistence:** Trained models are serialized via joblib, base64-encoded,
and stored in the `anomaly_model_state` table. On restart, models are loaded
from the database, avoiding retraining from scratch.

**Example summary:** "Multivariate anomaly detected (score: -0.682,
threshold: -0.5)"

---

## 4. Configuration

Configuration is managed per-characteristic through the **Anomaly Config Panel**
in the chart view, or via the API.

### 4.1 UI Configuration

1. Navigate to a characteristic's control chart.
2. Toggle **AI Insights** in the chart toolbar to activate the panel.
3. The config panel appears with sections for each detector.

**Global toggle:** The top-level **Enable** checkbox controls whether any anomaly
detection runs for this characteristic. When disabled, no detectors execute on
new samples.

**Per-detector toggles:** Each detector (PELT, K-S, Isolation Forest) has its
own enable/disable checkbox.

### 4.2 Sensitivity Presets

The PELT detector offers three sensitivity presets that adjust the penalty
parameter:

| Preset | Penalty Value | Behavior |
|---|---|---|
| **Low** (conservative) | 8.0 | Detects only large, unambiguous shifts |
| **Medium** (balanced) | `auto` (3.0 * ln(n)) | Recommended starting point |
| **High** (sensitive) | 1.5 | Detects subtle shifts; may produce more false positives |

### 4.3 Notification Preferences

Each detector type has a notification toggle:

| Setting | Config Key | Default |
|---|---|---|
| Notify on changepoints | `notify_on_changepoint` | true |
| Notify on outlier scores | `notify_on_anomaly_score` | false |
| Notify on distribution shifts | `notify_on_distribution_shift` | true |

These settings control which anomaly events trigger notifications through the
Event Bus and NotificationDispatcher.

### 4.4 API Configuration

```bash
# Get current config
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/anomaly/42/config

# Update config
curl -X PUT http://localhost:8000/api/v1/anomaly/42/config \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_enabled": true,
    "pelt_enabled": true,
    "pelt_penalty": "auto",
    "pelt_min_segment": 5,
    "ks_enabled": true,
    "ks_alpha": 0.05,
    "iforest_enabled": true,
    "iforest_contamination": 0.05
  }'

# Reset to defaults
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/anomaly/42/config
```

---

## 5. Chart Overlay

When **AI Insights** is toggled on in the chart toolbar, anomaly events are
rendered directly on the ECharts control chart using three visual elements:

### 5.1 Visual Elements

| Anomaly Type | Visual | Symbol | Color |
|---|---|---|---|
| **Changepoint** | Diamond marker at the shift point + vertical dashed line | Diamond, labeled "CP" | Severity-coded |
| **Distribution shift** | Shaded region across the affected window | Area fill, labeled "Dist. Shift" | Severity-coded (translucent) |
| **Outlier** | Inverted triangle marker at the anomalous point | Triangle (inverted), labeled "AI" | Severity-coded |

### 5.2 Color Coding by Severity

| Severity | Color |
|---|---|
| CRITICAL | Red (#ef4444) |
| WARNING | Amber (#f59e0b) |
| INFO | Blue (#3b82f6) |

### 5.3 Implementation

The `AnomalyOverlay` module (`components/anomaly/AnomalyOverlay.tsx`) converts
anomaly events into ECharts `markPoint`, `markLine`, and `markArea` options.
These are merged into the existing chart series configuration. Dismissed events
are automatically filtered out.

Each marker includes tooltip content showing the event type, detector,
severity, summary, and acknowledgment status.

---

## 6. Event Management

### 6.1 Event List Panel

The `AnomalyEventList` component displays all anomaly events for a
characteristic with filtering and action capabilities.

**Filtering options:**

| Filter | Options |
|---|---|
| Severity | All, CRITICAL, WARNING, INFO |
| Detector | All, PELT, Isolation Forest, K-S Test |
| Status | All, Active, Acknowledged, Dismissed |

### 6.2 Event Detail

Expand any event in the list to see:

- **Detector type and event type** (e.g., "PELT -- Changepoint")
- **Severity badge** (color-coded)
- **Summary** (natural language description of the anomaly)
- **Detection details** (algorithm-specific parameters and statistics)
- **Timestamps** (detection time, acknowledgment time if applicable)

### 6.3 Actions

| Action | Minimum Role | Effect |
|---|---|---|
| **Acknowledge** | operator | Marks the event as seen. Sets `is_acknowledged = true` with the username and timestamp. The event remains visible but is marked as reviewed. |
| **Dismiss** | engineer | Marks the event as a false positive. Requires an optional reason. Dismissed events are hidden from the chart overlay. |

### 6.4 Severity Levels

| Level | Meaning | Examples |
|---|---|---|
| CRITICAL | Immediate attention required | >= 2 sigma shift (PELT), p < alpha/10 (K-S), score < -0.7 (IForest) |
| WARNING | Review recommended | 1-2 sigma shift (PELT), p < alpha/2 (K-S), score < threshold (IForest) |
| INFO | Informational | < 1 sigma shift (PELT), p < alpha (K-S) |

---

## 7. Integration with Notifications

Anomaly events flow through OpenSPC's notification system:

```
Sample Processed
      |
      v
AnomalyDetector (Event Bus subscriber)
      |
      v
PELT / K-S / IForest analysis
      |
      v
AnomalyEvent persisted to DB
      |
      v
AnomalyDetectedEvent published to Event Bus
      |
      v
NotificationDispatcher
      |
      +---> Email (aiosmtplib)
      |
      +---> Webhook (httpx + HMAC signing)
```

### 7.1 Configuring Anomaly Notifications

1. Navigate to **Settings > Notifications**.
2. Configure SMTP or webhook endpoints.
3. In the anomaly config panel for each characteristic, enable the notification
   toggles for the event types you want to be notified about.

### 7.2 Event Payload

The `AnomalyDetectedEvent` published to the Event Bus includes:

| Field | Description |
|---|---|
| `anomaly_event_id` | Database ID of the persisted event |
| `characteristic_id` | Which characteristic the anomaly was detected on |
| `detector_type` | `pelt`, `ks_test`, or `isolation_forest` |
| `event_type` | `changepoint`, `distribution_shift`, or `outlier` |
| `severity` | `INFO`, `WARNING`, or `CRITICAL` |
| `summary` | Natural language description |
| `sample_id` | The sample that triggered the detection (if applicable) |

---

## 8. API Reference

All endpoints are prefixed with `/api/v1/anomaly`. Authentication is required
via JWT Bearer token.

### 8.1 Dashboard Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/dashboard` | List active anomaly events across accessible plants | supervisor |
| GET | `/dashboard/stats` | Summary statistics (totals, by severity, by detector) | supervisor |

### 8.2 Configuration Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/{char_id}/config` | Get anomaly detector configuration (returns defaults if none exists) | supervisor |
| PUT | `/{char_id}/config` | Update anomaly detector configuration | engineer |
| DELETE | `/{char_id}/config` | Reset configuration to defaults | engineer |

### 8.3 Event Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/{char_id}/events` | List anomaly events with pagination and filters | operator |
| GET | `/{char_id}/events/{event_id}` | Get a single event detail | operator |
| POST | `/{char_id}/events/{event_id}/acknowledge` | Acknowledge an event | operator |
| POST | `/{char_id}/events/{event_id}/dismiss` | Dismiss as false positive | engineer |

### 8.4 Summary and Status Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/{char_id}/summary` | AI summary with per-detector status and active anomaly count | supervisor |
| GET | `/{char_id}/status` | Detector status (enabled, last detection, event counts) | supervisor |

### 8.5 Analysis Endpoint

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/{char_id}/analyze` | Trigger on-demand full analysis across all enabled detectors | engineer |

### 8.6 Example: Triggering On-Demand Analysis

```bash
curl -X POST http://localhost:8000/api/v1/anomaly/42/analyze \
  -H "Authorization: Bearer $TOKEN"
```

Response:

```json
{
  "characteristic_id": 42,
  "events_detected": 2,
  "events": [
    {
      "id": 101,
      "char_id": 42,
      "detector_type": "pelt",
      "event_type": "changepoint",
      "severity": "WARNING",
      "details": {
        "changepoint_index": 85,
        "segment_before_mean": 250.120,
        "segment_after_mean": 250.470,
        "shift_magnitude": 0.350,
        "shift_sigma": 1.8
      },
      "summary": "Process shift detected: mean changed by 0.350 (1.8 sigma)",
      "is_acknowledged": false,
      "is_dismissed": false,
      "detected_at": "2026-02-14T10:45:00Z"
    },
    {
      "id": 102,
      "char_id": 42,
      "detector_type": "ks_test",
      "event_type": "distribution_shift",
      "severity": "INFO",
      "details": {
        "ks_statistic": 0.2800,
        "p_value": 0.0310,
        "alpha": 0.05,
        "reference_mean": 250.100,
        "reference_std": 0.195,
        "test_mean": 250.380,
        "test_std": 0.210
      },
      "summary": "Process distribution has shifted (K-S statistic: 0.2800, p-value: 0.0310).",
      "is_acknowledged": false,
      "is_dismissed": false,
      "detected_at": "2026-02-14T10:45:01Z"
    }
  ]
}
```

### 8.7 Example: Listing Events with Filters

```bash
# Get only CRITICAL events from PELT detector
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/anomaly/42/events?severity=CRITICAL&detector_type=pelt&limit=10"
```

### 8.8 Example: Acknowledging an Event

```bash
curl -X POST http://localhost:8000/api/v1/anomaly/42/events/101/acknowledge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 8.9 Example: Dismissing an Event

```bash
curl -X POST http://localhost:8000/api/v1/anomaly/42/events/101/dismiss \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Known equipment calibration event"}'
```

---

## Database Schema

The anomaly detection system uses three tables created by migration 030:

| Table | Purpose |
|---|---|
| `anomaly_detector_config` | Per-characteristic configuration (one row per characteristic, unique on `char_id`) |
| `anomaly_event` | Detected anomaly events with details, severity, and review state |
| `anomaly_model_state` | Serialized ML model blobs (one row per char_id + detector_type pair) |

**Indexes on `anomaly_event`:**

- `ix_anomaly_event_char_detected` -- (char_id, detected_at) for time-range queries
- `ix_anomaly_event_detector_type` -- detector_type for filtering
- `ix_anomaly_event_severity` -- severity for filtering

---

## Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `AnomalyOverlay` | `components/anomaly/` | Converts events to ECharts markPoint/markLine/markArea for chart rendering |
| `AnomalyConfigPanel` | `components/anomaly/` | Per-characteristic detector configuration with enable/disable and parameter tuning |
| `AnomalyEventList` | `components/anomaly/` | Paginated event list with severity/detector/status filtering |
| `AnomalyEventDetail` | `components/anomaly/` | Expanded event view with details, summary, and acknowledge/dismiss actions |
| `AnomalySummaryCard` | `components/anomaly/` | Dashboard card showing active anomaly count and detector status |
| `AnomalyBadge` | `components/anomaly/` | Inline badge showing anomaly count for a characteristic |

---

## Dependencies

| Package | Required | Purpose |
|---|---|---|
| `numpy` | Yes | Array operations for all detectors |
| `ruptures>=1.1.9` | Yes | PELT changepoint detection |
| `scipy` | Yes | K-S two-sample test |
| `scikit-learn>=1.4.0` | Optional | Isolation Forest (install with `pip install openspc[ml]`) |
| `joblib` | Optional | Model serialization (installed with scikit-learn) |

If scikit-learn is not installed, the Isolation Forest detector is silently
disabled. PELT and K-S detection continue to function normally.
