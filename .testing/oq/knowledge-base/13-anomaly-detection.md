# Feature: AI/ML Anomaly Detection

## Category: ANOM
## Config Reference: `{ prefix: "ANOM", name: "Anomaly Detection", kb: "13-anomaly-detection.md" }`

---

## What It Does

AI/ML-based anomaly detection augments traditional Nelson rules with machine learning algorithms that detect subtle patterns humans and simple deterministic rules miss. Three detection methods work together for comprehensive monitoring: PELT changepoint detection, Kolmogorov-Smirnov distribution shift testing, and Isolation Forest multivariate outlier detection.

Where Nelson rules answer "did the data violate a predefined pattern?", anomaly detection answers "is something unusual happening that no predefined rule anticipated?" This is the difference between a checklist and an expert intuition -- the ML models learn what "normal" looks like for each characteristic and flag deviations from that learned baseline.

From a Six Sigma perspective, anomaly detection fills four gaps that traditional SPC rules cannot address:

1. **Gradual distribution shifts** -- A process can slowly drift from normal to bimodal without triggering any single Nelson rule. The K-S test detects this by comparing recent data against the baseline distribution shape.
2. **Complex multivariate patterns** -- A measurement may be individually normal but abnormal in combination with its recent neighbors (e.g., a specific sawtooth pattern). Isolation Forest captures these multi-dimensional anomalies.
3. **Non-stationary changepoints** -- A sudden shift in process mean or variance that occurs between subgroups. PELT finds the exact point where the change occurred, not just that a rule was eventually triggered.
4. **Unknown-unknown detection** -- Nelson rules only find patterns they were designed to find. ML methods can flag novel patterns that no human anticipated when writing the rules.

From a compliance perspective:

- **ISO 9001:2015 Section 10.1** -- Improvement through data analysis. ML anomaly detection provides a proactive, data-driven improvement mechanism.
- **IATF 16949 Section 9.1.1** -- Monitoring, measurement, analysis, and evaluation. Advanced analytics augment traditional SPC monitoring.
- **ICH Q10** -- Pharmaceutical quality system continuous improvement. Anomaly detection supports the "knowledge management" and "continuous improvement" pillars.
- **FDA Guidance on AI/ML in Manufacturing** -- The FDA's emerging framework encourages the use of AI/ML for process monitoring, provided human oversight is maintained. Cassini's acknowledge/dismiss workflow provides this human-in-the-loop control.

**Important**: ML anomaly detection is a complement to, not a replacement for, traditional Nelson rules. Nelson rules remain the regulatory compliance baseline. ML provides additional insight for process improvement.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| AI Insights toggle | `/dashboard` > Chart Toolbar | Operator | Toggle to show/hide anomaly overlay on the control chart |
| Anomaly overlay | `/dashboard` (on control chart) | Operator | Colored markers/regions showing detected anomalies |
| Anomaly event list | `/dashboard` > Anomaly panel | Operator | List of detected events with type, severity, confidence |
| Per-characteristic config | `/anomaly/{char_id}/config` (API) | Supervisor+ (read), Engineer+ (write) | Enable/disable detectors, set parameters per characteristic |
| AI settings | `/settings/ai` | Admin | Global anomaly detection configuration |
| Anomaly dashboard | `/anomaly/dashboard` (API) | Supervisor+ | Cross-plant summary of active anomaly events |
| On-demand analysis | `/dashboard` > AI Insights > Analyze button | Engineer+ | Trigger full analysis for the selected characteristic |

---

## Key Concepts (Six Sigma Context)

### PELT -- Pruned Exact Linear Time (Changepoint Detection)

PELT is a changepoint detection algorithm that finds the exact sample indices where the statistical properties of a process abruptly change. It is implemented using the `ruptures` Python library.

**How it works**:
1. PELT models the data as a sequence of segments, each with a consistent statistical behavior (mean, variance, or distribution shape).
2. It searches for the minimum number of breakpoints that explain the data, using a penalty function to prevent overfitting (too many changepoints).
3. The algorithm runs in O(n) time for well-behaved data, making it practical for real-time use.

**What it detects**:
- **Mean shifts** -- The process average suddenly jumps to a new level (e.g., a tool change that shifted the process by 0.5 sigma).
- **Variance changes** -- The process suddenly becomes more or less variable (e.g., a new lot of raw material with different consistency).
- **Distribution changes** (with `rbf` model) -- More general shifts in the data-generating process.

**Configuration parameters**:
| Parameter | Field | Default | Description |
|---|---|---|---|
| Model | `pelt_model` | `l2` | Cost function: `l2` (mean shift), `rbf` (general), `normal` (mean+variance) |
| Penalty | `pelt_penalty` | auto | Penalty for adding a changepoint. Higher = fewer changepoints |
| Min segment | `pelt_min_segment` | 5 | Minimum number of points between changepoints (range: 2-50) |

**Comparison to Nelson Rule 2**: Nelson Rule 2 detects 9 consecutive points on the same side of the centerline. PELT detects the actual moment the shift occurred and estimates its magnitude. PELT is more sensitive for gradual shifts and can detect shifts that never trigger Rule 2 because the control limits are wide.

### K-S Test -- Kolmogorov-Smirnov (Distribution Shift Detection)

The K-S test is a non-parametric statistical test that compares two distributions. Cassini uses it in a rolling-window fashion to detect when the recent data distribution has diverged from the baseline distribution.

**How it works**:
1. A reference window of historical data (default: 200 points) establishes the "normal" distribution.
2. A sliding test window (default: 50 points) captures recent data.
3. The two-sample K-S test computes the maximum distance between the empirical CDFs (cumulative distribution functions) of the two windows.
4. If the K-S statistic exceeds the critical value at the configured significance level (alpha), a distribution shift is flagged.

**What it detects**:
- **Shape changes** -- The distribution goes from unimodal to bimodal (e.g., two machines feeding one measurement station).
- **Skewness changes** -- The distribution tail behavior changes (e.g., contamination in one direction).
- **Subtle location shifts** -- Shifts too small for control chart rules but statistically significant when comparing distributions.

**Configuration parameters**:
| Parameter | Field | Default | Description |
|---|---|---|---|
| Reference window | `ks_reference_window` | 200 | Number of historical points for baseline (range: 50-1000) |
| Test window | `ks_test_window` | 50 | Number of recent points to compare (range: 20-200) |
| Alpha | `ks_alpha` | 0.05 | Significance level for the test (range: 0.01-0.10) |

**Six Sigma context**: The K-S test is distribution-free -- it makes no assumption about normality. This makes it particularly valuable for processes that follow non-normal distributions (Weibull, lognormal, etc.), where parametric rules may produce misleading results.

### Isolation Forest (Multivariate Outlier Detection)

Isolation Forest is a machine learning algorithm that detects anomalies by isolating observations. It is implemented using scikit-learn (optional dependency -- the system gracefully degrades if scikit-learn is not installed).

**How it works**:
1. The algorithm builds an ensemble of random decision trees (default: 100 trees).
2. Each tree randomly selects a feature and a split value, recursively partitioning the data.
3. Anomalies are isolated quickly (require fewer splits) because they are rare and different.
4. An anomaly score is computed: values closer to -1.0 are more anomalous; values closer to 0 are normal.

**What it detects**:
- **Multivariate outliers** -- Points that are individually normal in each feature but abnormal in combination (e.g., a value that is within spec but occurred at an unusual rate of change).
- **Novel patterns** -- Combinations of measurement value, time-of-day, and variance that have never been seen before.
- **Contextual anomalies** -- Values that are normal in one process state but abnormal in another.

**Configuration parameters**:
| Parameter | Field | Default | Description |
|---|---|---|---|
| Contamination | `iforest_contamination` | 0.05 | Expected fraction of anomalies (range: 0.01-0.20) |
| Number of estimators | `iforest_n_estimators` | 100 | Number of trees in the ensemble (range: 50-500) |
| Min training samples | `iforest_min_training` | 100 | Minimum data points before model can train (range: 20-500) |
| Retrain interval | `iforest_retrain_interval` | 200 | Retrain model every N new samples (range: 50-1000) |

**Important**: scikit-learn is an optional dependency. If not installed, the Isolation Forest detector is disabled gracefully -- no error, just a log message and the detector reports as unavailable.

### Sensitivity and the Sensitivity-False Alarm Tradeoff

Each detector can be tuned via its parameters to trade off between sensitivity (catching real anomalies) and specificity (avoiding false alarms):

- **High sensitivity** (low penalty for PELT, low alpha for K-S, high contamination for Isolation Forest): Catches more real anomalies but generates more false positives. Appropriate for safety-critical processes.
- **Low sensitivity** (high penalty, high alpha, low contamination): Fewer false alarms but may miss subtle shifts. Appropriate for high-volume processes where false alarms cause costly shutdowns.

### Anomaly Events

Each detected anomaly creates an event record with:

| Field | Description |
|---|---|
| `detector_type` | Which algorithm detected it: `pelt`, `ks_test`, or `isolation_forest` |
| `event_type` | Classification: `changepoint`, `distribution_shift`, or `outlier` |
| `severity` | `low`, `medium`, `high`, or `critical` based on confidence/magnitude |
| `summary` | Human-readable description of the anomaly |
| `details` | JSON object with algorithm-specific details (e.g., shift magnitude, K-S statistic, anomaly score) |
| `sample_id` | The specific sample that triggered the anomaly (if applicable) |
| `window_start_id` / `window_end_id` | The sample range for window-based detections |

Events can be **acknowledged** (operator confirms they have seen it) or **dismissed** (engineer determines it is a false positive, with a reason).

---

## How To Configure (Step-by-Step)

### Enabling Anomaly Detection (Admin)

1. Navigate to `/settings/ai`.
2. The configuration page shows three detector sections: PELT, K-S Test, and Isolation Forest.
3. Toggle each detector on/off as desired.
4. Set sensitivity parameters for each enabled detector.
5. Configure notification settings (notify on changepoint, outlier, distribution shift).
6. Set the anomaly score threshold for Isolation Forest notifications.
7. Click **Save**. Settings are saved per characteristic.

### Per-Characteristic Configuration (Engineer+)

Configuration can also be done at the characteristic level via the API:

1. `GET /anomaly/{char_id}/config` -- retrieve current config (or defaults if none exists).
2. `PUT /anomaly/{char_id}/config` -- update specific fields.
3. `DELETE /anomaly/{char_id}/config` -- reset to defaults.

### Recommended Configurations by Industry

| Industry | PELT | K-S | Isolation Forest | Notes |
|---|---|---|---|---|
| Automotive (IATF 16949) | Enabled, l2 model | Enabled, alpha=0.05 | Optional | Focus on mean shifts |
| Pharmaceutical (FDA) | Enabled, normal model | Enabled, alpha=0.01 | Enabled | Maximum coverage for safety |
| Aerospace (AS9100) | Enabled, l2 model | Enabled, alpha=0.05 | Enabled | Tight tolerances need all detectors |
| General manufacturing | Enabled, l2 model | Disabled | Disabled | Start simple, enable more as needed |

---

## How To Use (Typical Workflow)

### Enabling AI Insights on a Chart

1. Navigate to `/dashboard`.
2. Select a characteristic from the hierarchy tree or chart list.
3. In the chart toolbar, locate the **AI Insights** toggle button.
4. Click to enable. The button highlights to indicate AI Insights are active.
5. If anomaly data exists for this characteristic, the anomaly overlay appears on the control chart:
   - **Changepoints**: Vertical lines or colored regions marking where the process shifted.
   - **Outliers**: Markers on specific data points flagged as anomalous.
   - **Distribution shifts**: Highlighted regions where the distribution changed.
6. Below the chart (or in a side panel), the **Anomaly Event List** shows all detected events.

### Running On-Demand Analysis (Engineer+)

1. With AI Insights enabled, click the **Analyze** button (or trigger via API: `POST /anomaly/{char_id}/analyze`).
2. The system runs all enabled detectors against the full dataset for the selected characteristic.
3. Results appear as new events in the anomaly event list and as overlay on the chart.
4. The analysis response shows how many events were detected.

### Acknowledging an Anomaly Event

1. In the anomaly event list, find an event you want to acknowledge.
2. Click the **Acknowledge** button (checkmark icon).
3. The event is marked as acknowledged. The `acknowledged_by` field records your username and `acknowledged_at` records the timestamp.
4. Acknowledged events remain visible but are visually de-emphasized.

### Dismissing a False Positive (Engineer+)

1. In the anomaly event list, find an event that is a false positive.
2. Click the **Dismiss** button.
3. Optionally enter a reason (e.g., "Known calibration event" or "Equipment maintenance").
4. The event is marked as dismissed. It is no longer prominent in the event list.
5. Dismissed events are excluded from active anomaly counts.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Anomaly configuration page loads with correct defaults | GET /anomaly/{char_id}/config returns defaults when no config exists |
| 2 | Each detector can be independently enabled/disabled | PUT /anomaly/{char_id}/config toggling pelt_enabled, ks_enabled, iforest_enabled |
| 3 | Configuration changes persist across page reloads | Save config, refresh, verify saved values returned |
| 4 | PELT detects a mean shift when present | Seed 50 normal points + 50 shifted points, run analyze, verify changepoint detected near sample 50 |
| 5 | K-S test detects distribution shift | Seed reference window (normal) + test window (different distribution), verify distribution_shift event |
| 6 | Isolation Forest detects outliers (when scikit-learn installed) | Seed normal data + outliers, verify outlier events |
| 7 | AI Insights toggle shows/hides overlay | Toggle on: overlay visible. Toggle off: overlay hidden. Toggle on again: overlay returns |
| 8 | Anomaly event list shows detected events with correct metadata | After analysis, verify event list shows detector_type, event_type, severity, summary |
| 9 | Acknowledge event changes status | POST /anomaly/{char_id}/events/{id}/acknowledge, verify is_acknowledged=true |
| 10 | Dismiss event with reason | POST /anomaly/{char_id}/events/{id}/dismiss with reason, verify is_dismissed=true |
| 11 | Empty data produces no errors | Request analysis for characteristic with 0 samples, verify graceful response |
| 12 | Insufficient data reports gracefully | Request analysis with <50 points (PELT minimum), verify no crash |
| 13 | Anomaly dashboard returns cross-plant events | GET /anomaly/dashboard returns events from all accessible characteristics |
| 14 | Notification settings are respected | Configure notify_on_changepoint=true, verify notifications fire on changepoint detection |

---

## Edge Cases & Constraints

- **Minimum data requirements** -- PELT needs at least `pelt_min_segment * 2` data points (default: 10). Isolation Forest needs at least `iforest_min_training` points (default: 100). K-S test needs at least `ks_reference_window + ks_test_window` points (default: 250). Analysis with insufficient data returns an empty result, not an error.
- **scikit-learn optional dependency** -- Isolation Forest requires `scikit-learn>=1.4.0`. If not installed, the Isolation Forest detector is disabled gracefully. The PELT detector uses `ruptures>=1.1.9` which is a required dependency. The K-S test uses `scipy.stats` which is also a required dependency.
- **Empty charts** -- Requesting anomaly data for a characteristic with no samples returns an empty event list, not an error.
- **Anomaly detection service not initialized** -- If the anomaly detector is not running (e.g., startup failure), the `POST /anomaly/{char_id}/analyze` endpoint returns HTTP 503 Service Unavailable with a clear message.
- **Rate limiting** -- On-demand analysis is computationally expensive. There is no built-in rate limit, but the analysis is synchronous (blocks until complete), naturally limiting concurrent analysis requests.
- **Stale model state** -- Isolation Forest models are retrained every `iforest_retrain_interval` samples. Between retraining, the model may not reflect the most recent process changes. The `model_age_samples` field in the status response indicates how many samples the model has seen.
- **Concurrent acknowledge/dismiss** -- Two users cannot acknowledge the same event simultaneously (idempotent operation -- second acknowledge is a no-op since the first already set the flag).
- **Dismiss requires engineer role** -- Acknowledging an event requires operator+ role, but dismissing (marking as false positive) requires engineer+ role. This prevents operators from silently dismissing real anomalies.
- **Event persistence** -- Anomaly events are persisted in the database. They survive server restarts. Old events are subject to the data retention policy if configured.
- **Chart overlay rendering** -- The anomaly overlay uses ECharts `markPoint` (for outliers) and `markArea` (for changepoint regions). The overlay is rendered on top of the control chart series. The z-index is managed by ECharts internally.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### Dashboard (Cross-Plant)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/anomaly/dashboard` | Supervisor+ | List active anomaly events across all accessible plants |
| `GET` | `/anomaly/dashboard/stats` | Supervisor+ | Summary statistics (total, active, acknowledged, dismissed, by_severity, by_detector) |

### Per-Characteristic Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/anomaly/{char_id}/config` | Supervisor+ | Get detector config (or create defaults) |
| `PUT` | `/anomaly/{char_id}/config` | Engineer+ | Update detector config. Body: `AnomalyConfigUpdate` |
| `DELETE` | `/anomaly/{char_id}/config` | Engineer+ | Reset config to defaults |

### Events

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/anomaly/{char_id}/events` | Operator+ | List events with filters. Query: `detector_type`, `severity`, `acknowledged`, `dismissed`, `offset`, `limit` |
| `GET` | `/anomaly/{char_id}/events/{event_id}` | Operator+ | Get single event detail |
| `POST` | `/anomaly/{char_id}/events/{event_id}/acknowledge` | Operator+ | Acknowledge event |
| `POST` | `/anomaly/{char_id}/events/{event_id}/dismiss` | Engineer+ | Dismiss event. Body: `{ reason?: string }` |

### Summary and Status

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/anomaly/{char_id}/summary` | Supervisor+ | AI summary with detector status and active anomaly count |
| `GET` | `/anomaly/{char_id}/status` | Supervisor+ | Detector enable/disable status with event counts |

### Analysis

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/anomaly/{char_id}/analyze` | Engineer+ | Trigger on-demand full analysis. Returns `{ characteristic_id, events_detected, events[] }` |

### Request/Response Schemas

**AnomalyConfigUpdate**: `{ is_enabled?: bool, pelt_enabled?: bool, pelt_model?: "l2"|"rbf"|"normal", pelt_penalty?: string, pelt_min_segment?: int, iforest_enabled?: bool, iforest_contamination?: float, iforest_n_estimators?: int, iforest_min_training?: int, iforest_retrain_interval?: int, ks_enabled?: bool, ks_reference_window?: int, ks_test_window?: int, ks_alpha?: float, notify_on_changepoint?: bool, notify_on_anomaly_score?: bool, notify_on_distribution_shift?: bool, anomaly_score_threshold?: float }`

**AnomalyEventResponse**: `{ id: int, char_id: int, detector_type: string, event_type: string, severity: string, details: object, sample_id?: int, window_start_id?: int, window_end_id?: int, summary?: string, is_acknowledged: bool, acknowledged_by?: string, acknowledged_at?: datetime, is_dismissed: bool, dismissed_by?: string, dismissed_reason?: string, detected_at: datetime }`

**AnalysisResultResponse**: `{ characteristic_id: int, events_detected: int, events: AnomalyEventResponse[] }`

**DismissRequest**: `{ reason?: string }`

### Seeding Example

```bash
# 1. Create hierarchy and characteristic (see 02-plants-hierarchy.md, 03-characteristics-config.md)

# 2. Seed 50 normal samples (mean=10.0, sigma~0.01)
for i in $(seq 1 50); do
  curl -X POST $API/samples \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"characteristic_id\": $CHAR_ID, \"measurements\": [10.00]}"
done

# 3. Seed 50 shifted samples (mean=10.05 -- a 5-sigma shift)
for i in $(seq 1 50); do
  curl -X POST $API/samples \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"characteristic_id\": $CHAR_ID, \"measurements\": [10.05]}"
done

# 4. Configure anomaly detection
curl -X PUT "$API/anomaly/$CHAR_ID/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": true, "pelt_enabled": true, "ks_enabled": true, "iforest_enabled": false}'

# 5. Trigger analysis
curl -X POST "$API/anomaly/$CHAR_ID/analyze" \
  -H "Authorization: Bearer $TOKEN"
# Response: { "characteristic_id": ..., "events_detected": 1, "events": [...] }

# 6. List detected events
curl -X GET "$API/anomaly/$CHAR_ID/events" \
  -H "Authorization: Bearer $TOKEN"

# 7. Acknowledge an event
curl -X POST "$API/anomaly/$CHAR_ID/events/$EVENT_ID/acknowledge" \
  -H "Authorization: Bearer $TOKEN"

# 8. Dismiss an event as false positive
curl -X POST "$API/anomaly/$CHAR_ID/events/$EVENT_ID/dismiss" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Known calibration event"}'
```
