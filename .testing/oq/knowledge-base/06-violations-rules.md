# Feature: Violations & Nelson Rules

## What It Does

Violations are the alarm system of Statistical Process Control. When control chart data exhibits patterns indicating special cause variation, the SPC engine evaluates incoming samples against a set of statistical rules (Nelson rules) and generates violation records. Each violation captures what rule was triggered, which sample triggered it, and the severity of the signal.

Violations serve three purposes in a quality management system:

1. **Real-time alerting** -- When an operator submits a measurement that triggers a Nelson rule, the system immediately reports the violation in the API response and displays it as a marker on the control chart. This enables immediate corrective action.
2. **Historical record** -- All violations are persisted in the database, creating an auditable trail of process instability events. This supports CAPA (Corrective and Preventive Action) investigations and regulatory audits.
3. **Statistical discipline** -- By requiring acknowledgment of violations with a reason code, the system enforces the Six Sigma principle that every out-of-control signal must be investigated and dispositioned.

From a compliance perspective:
- **ISO 7870-2** -- Defines the statistical rules (Nelson rules) for interpreting control charts. Cassini implements all 8 rules.
- **AIAG SPC Reference Manual** -- The automotive industry standard recommends rules 1-4 as the baseline. Cassini's AIAG preset matches this.
- **21 CFR Part 11** -- Violation acknowledgment with user identity and timestamp creates an electronic record with attribution.
- **IATF 16949** -- Requires documented reaction plans for out-of-control conditions. Violation acknowledgment with reason codes provides this documentation.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Violations list | `/violations` | Operator | Paginated table of all violations with filters |
| Violation markers on chart | `/dashboard` (select characteristic) | Operator | Red/orange markers on control chart at violation points |
| Violation badge | Sidebar "Violations" item | Operator | Badge count of unacknowledged violations |
| Rule configuration | `/configuration` > select characteristic > Rules tab | Engineer | Enable/disable rules, set parameters, choose presets |
| Violation statistics | `/violations` (stats section) | Operator | Counts by rule, severity, acknowledgment status |
| Acknowledge violation | `/violations` > click row > Acknowledge button | Supervisor | Mark violation as reviewed with reason |
| Batch acknowledge | `/violations` > select multiple > Batch Acknowledge | Supervisor | Acknowledge multiple violations at once |

---

## Key Concepts (Six Sigma Context)

### The 8 Nelson Rules (ISO 7870-2)

Nelson rules detect non-random patterns in control chart data. Each rule targets a specific type of special cause variation. The rules operate on a system of zones defined by the control chart's centerline (CL) and standard deviation (sigma):

- **Zone C**: Between CL and 1 sigma (both sides)
- **Zone B**: Between 1 sigma and 2 sigma (both sides)
- **Zone A**: Between 2 sigma and 3 sigma (both sides)
- **Beyond 3 sigma**: Beyond UCL or LCL

#### Rule 1 -- Beyond 3 Sigma (Outlier)
- **Pattern**: A single point falls beyond the Upper Control Limit (UCL) or Lower Control Limit (LCL).
- **Severity**: CRITICAL
- **Six Sigma meaning**: The strongest signal of special cause variation. The probability of a single point beyond 3 sigma in a normal process is 0.27% (1 in 370). Indicates a sudden, large shift -- tool breakage, wrong material, measurement error, or process upset.
- **Action**: Immediate investigation. Stop production if safety-critical.
- **Default window**: 1 point (instantaneous detection).

#### Rule 2 -- 9 Points Same Side of Centerline (Shift)
- **Pattern**: 9 consecutive points all on the same side of the centerline.
- **Severity**: WARNING
- **Six Sigma meaning**: Process mean has shifted. The probability of 9 consecutive points on the same side by chance is 0.2% (1/512). Common causes: tool wear, gradual drift, changed supplier, environmental change.
- **Action**: Investigate for sustained shift. Recalibrate if confirmed.
- **Default window**: 9 consecutive points.

#### Rule 3 -- 6 Points Trending (Trend)
- **Pattern**: 6 consecutive points steadily increasing or steadily decreasing.
- **Severity**: WARNING
- **Six Sigma meaning**: Monotonic trend indicates progressive deterioration or improvement. Common causes: tool wear, chemical depletion, thermal drift, blade dulling.
- **Action**: Investigate root cause of drift. Predictive maintenance may be needed.
- **Default window**: 6 consecutive points.

#### Rule 4 -- 14 Points Alternating Up/Down (Oscillation)
- **Pattern**: 14 consecutive points alternating in direction (up, down, up, down...).
- **Severity**: WARNING
- **Six Sigma meaning**: Systematic alternation suggests over-adjustment (operator reacting to every point), two-stream mixing (two machines feeding one measurement point), or a cyclic disturbance.
- **Action**: Check for over-correction behavior. Verify single-source sampling.
- **Default window**: 14 consecutive points.

#### Rule 5 -- 2 of 3 Beyond 2 Sigma (Zone A Warning)
- **Pattern**: 2 out of 3 consecutive points fall beyond Zone A (between 2 sigma and 3 sigma) on the same side.
- **Severity**: WARNING
- **Six Sigma meaning**: Early warning of a shift developing. Not yet a Rule 1 violation, but the process is spending too much time in the tails.
- **Action**: Increased monitoring. Prepare for potential intervention.
- **Default parameters**: k=2, n=3 (2 out of 3 consecutive points).

#### Rule 6 -- 4 of 5 Beyond 1 Sigma (Zone B Warning)
- **Pattern**: 4 out of 5 consecutive points fall beyond Zone B (between 1 sigma and 2 sigma) on the same side.
- **Severity**: WARNING
- **Six Sigma meaning**: Small shift developing. The process center is moving away from the target.
- **Action**: Monitor closely. A small adjustment may be needed.
- **Default parameters**: k=4, n=5 (4 out of 5 consecutive points).

#### Rule 7 -- 15 Within 1 Sigma (Stratification)
- **Pattern**: 15 consecutive points all fall within Zone C (within 1 sigma of centerline).
- **Severity**: WARNING
- **Six Sigma meaning**: Too little variation. This seems good but actually indicates a problem -- data from multiple sources is being mixed (stratified), or the control limits are too wide. The process appears artificially stable.
- **Action**: Verify sampling method. Check if data from multiple streams is being combined. Recalculate control limits.
- **Default window**: 15 consecutive points.

#### Rule 8 -- 8 Beyond 1 Sigma Both Sides (Mixture)
- **Pattern**: 8 consecutive points all fall outside Zone C (beyond 1 sigma from centerline), on either side.
- **Severity**: WARNING
- **Six Sigma meaning**: Bimodal distribution -- data is coming from two distinct populations. The process is not homogeneous. Common causes: two machines, two operators, two material lots with different characteristics.
- **Action**: Identify and separate the two sources. Create separate control charts for each.
- **Default window**: 8 consecutive points.

### Rule Presets

Cassini provides four built-in rule presets that match industry standards:

| Preset | Rules Enabled | Context |
|---|---|---|
| **Nelson** | 1, 2, 3, 4, 5, 6, 7, 8 | Full set -- academic/research, maximum sensitivity |
| **AIAG** | 1, 2, 3, 4 | Automotive industry standard -- most common in manufacturing |
| **WECO** | 1, 2, 3, 4 | Western Electric Company rules -- original AT&T formulation with tighter parameters |
| **Wheeler** | 1, 2, 3, 4 | Recommended by Donald Wheeler -- practical manufacturing focus |

The AIAG preset is the most widely used in automotive and general manufacturing. Rules 5-8 are more sensitive but also more prone to false alarms, which is why many production environments disable them.

### Custom Parameters

Each rule has configurable parameters that control its sensitivity:

| Rule | Parameter | Default | Description |
|---|---|---|---|
| Rule 2 | window | 9 | Number of consecutive same-side points |
| Rule 3 | window | 6 | Number of consecutive trending points |
| Rule 4 | window | 14 | Number of consecutive alternating points |
| Rule 5 | k, n | 2, 3 | k out of n points beyond 2 sigma |
| Rule 6 | k, n | 4, 5 | k out of n points beyond 1 sigma |
| Rule 7 | window | 15 | Number of consecutive points within 1 sigma |
| Rule 8 | window | 8 | Number of consecutive points beyond 1 sigma |

### Attribute Chart Limitations

For attribute charts (p, np, c, u), only Nelson rules 1-4 are evaluated. Rules 5-8 are silently ignored because:
- Attribute data follows discrete distributions (binomial, Poisson), not normal.
- Zone-based rules (zones A, B, C) are defined by sigma distances from the centerline, which assumes a symmetric, continuous distribution.
- Applying zone rules to attribute data produces unreliable results with high false alarm rates.

The backend intersects the configured rules with the set {1, 2, 3, 4} for attribute characteristics, so even if all 8 rules are enabled on a p-chart, only rules 1-4 will trigger violations.

### Acknowledgment

Violations require acknowledgment by a supervisor or higher. Acknowledgment records:
- **Who** acknowledged (username)
- **When** they acknowledged (timestamp)
- **Why** -- a reason code or free-text explanation

Standard reason codes include: Tool Change, Raw Material Change, Setup Adjustment, Measurement Error, Process Adjustment, Environmental Factor, Operator Error, Equipment Malfunction, False Alarm, Under Investigation, Other.

Optionally, acknowledging a violation can also **exclude the sample** from future control limit calculations, which is appropriate when the root cause is confirmed as an assignable cause (e.g., a measurement error).

---

## How To Configure (Step-by-Step)

### Enabling/Disabling Rules (Engineer+)

1. Navigate to `/configuration`.
2. Select the target characteristic from the hierarchy tree.
3. Click the **Rules** tab in the characteristic detail panel.
4. Each of the 8 Nelson rules is listed with a toggle switch.
5. Toggle rules on/off as needed. Common configurations:
   - **Production**: Rules 1-4 only (AIAG preset).
   - **Process improvement**: All 8 rules (Nelson preset).
   - **High-volume**: Rules 1-2 only (reduce false alarms).
6. Changes are saved immediately via `PUT /characteristics/{id}/rules`.

### Applying a Preset (Engineer+)

1. In the Rules tab, locate the preset selector (dropdown).
2. Select a preset: Nelson, AIAG, WECO, or Wheeler.
3. The rule toggles update to match the preset.
4. Optionally adjust individual rules after applying the preset.
5. Save.

### Setting Custom Parameters (Engineer+)

1. In the Rules tab, click the parameters icon/link next to a rule.
2. Edit the window size or k/n parameters.
3. Save. New parameters take effect on the next sample submission.

---

## How To Use (Typical Workflow)

### Operator Workflow

1. Submit a measurement via Data Entry (`/data-entry`).
2. If the SPC engine detects a violation, the submission response includes violation details.
3. On the dashboard, the control chart shows a marker (red for CRITICAL, orange for WARNING) at the violating point.
4. The sidebar Violations badge increments.

### Supervisor Workflow

1. Navigate to `/violations`.
2. Review unacknowledged violations in the table.
3. Click a violation row to see details: rule number, description, the data point, and chart context.
4. Click **Acknowledge**. Select a reason code or enter a free-text reason.
5. Optionally check "Exclude sample" if the root cause is an assignable cause.
6. Submit. The violation is marked as acknowledged.
7. For bulk operations: select multiple violations using checkboxes, click **Batch Acknowledge**, enter a reason, submit.

### Engineer Workflow

1. Review violation statistics to identify patterns (e.g., Rule 2 triggering frequently on a specific characteristic suggests a process shift).
2. Navigate to `/configuration` and adjust rules or parameters as needed.
3. If too many false alarms: reduce sensitivity (increase window sizes) or disable rules 5-8.
4. If violations are being missed: increase sensitivity or enable additional rules.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Each of the 8 Nelson rules triggers correctly when appropriate data patterns are submitted | Seed data matching each rule's pattern, verify violation created |
| 2 | Violations appear as markers on the control chart | UI: dashboard, check for red/orange markers at violation points |
| 3 | Violations appear in the violations list with correct metadata | UI: /violations, verify rule_id, rule_name, severity, timestamp |
| 4 | Single violation acknowledgment works | UI: acknowledge one violation, verify status change |
| 5 | Batch acknowledgment works | UI: select multiple, batch acknowledge, verify all updated |
| 6 | Acknowledged violations show user, reason, and timestamp | UI/API: verify ack_user, ack_reason, ack_timestamp fields |
| 7 | Disabled rules do not trigger violations | Disable a rule, submit triggering data, verify no violation |
| 8 | Custom parameters change rule behavior | Change Rule 2 window from 9 to 7, verify triggers at 7 |
| 9 | Attribute charts only evaluate rules 1-4 | Enable all 8 on p-chart, submit Rule 5 pattern, verify no Rule 5 violation |
| 10 | Violation statistics are accurate | Check by_rule and by_severity counts match actual violations |
| 11 | Violation severity is correct (Rule 1 = CRITICAL, others = WARNING) | Verify severity field on violations |
| 12 | Exclude sample option works on acknowledgment | Acknowledge with exclude=true, verify sample marked excluded |
| 13 | Rule presets apply correct rule configurations | Apply AIAG preset, verify only rules 1-4 enabled |
| 14 | Violation badge count matches unacknowledged count | Compare sidebar badge to violations stats endpoint |

---

## Edge Cases & Constraints

- **Minimum data**: Nelson rules require a minimum number of historical points to evaluate. Rule 1 needs only 1 point (plus established limits). Rule 4 needs at least 14 consecutive points. Rule 7 needs 15. Violations cannot trigger until enough history exists.
- **Control limits required**: Rules evaluate against UCL/LCL/CL. If control limits have not been calculated (no data or limits not yet recalculated), violations cannot be generated for zone-based rules.
- **Already acknowledged**: Attempting to acknowledge an already-acknowledged violation returns HTTP 409 Conflict.
- **Supervisor required**: Acknowledgment requires supervisor role or higher at the owning plant. Operators can view violations but cannot acknowledge them.
- **Batch partial failure**: Batch acknowledgment handles partial success -- if 3 of 5 violations succeed, the response reports 3 successful and 2 failed with per-violation error details.
- **Violation severity**: Rule 1 (beyond 3 sigma) is CRITICAL. All other rules (2-8) are WARNING. This is hardcoded in the SPC engine.
- **Excluded samples**: Excluded samples are not evaluated by Nelson rules. If a sample is excluded after a violation was generated, the violation remains but the sample no longer affects future rule evaluations.
- **Short-run mode**: In short-run (deviation or standardized) mode, violations are still evaluated, but against transformed control limits. The rules apply to the transformed values.
- **CUSUM/EWMA charts**: CUSUM and EWMA charts use their own violation logic (mask-based for CUSUM, smoothed-value-based for EWMA) and do not use Nelson rules 2-8.

---

## API Reference (for seeding)

### Violations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/violations` | User | List violations with filters. Query: `characteristic_id`, `sample_id`, `acknowledged`, `severity`, `rule_id`, `start_date`, `end_date`, `offset`, `limit`, `page`, `per_page` |
| `GET` | `/violations/stats` | User | Get violation statistics. Query: `characteristic_id`, `start_date`, `end_date`. Returns: `total`, `unacknowledged`, `by_rule`, `by_severity` |
| `GET` | `/violations/reason-codes` | User | Get standard acknowledgment reason codes |
| `GET` | `/violations/{id}` | User | Get single violation details |
| `POST` | `/violations/{id}/acknowledge` | Supervisor+ | Acknowledge violation. Body: `{ user, reason, exclude_sample }` |
| `POST` | `/violations/batch-acknowledge` | Supervisor+ | Batch acknowledge. Body: `{ violation_ids, user, reason, exclude_sample }` |

### Rule Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics/{id}/rules` | User | Get Nelson rule config (8 rules with is_enabled, require_acknowledgement, parameters) |
| `PUT` | `/characteristics/{id}/rules` | Engineer+ | Replace all rule configs. Body: array of `{ rule_id, is_enabled, require_acknowledgement, parameters }` |

### Rule Presets

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/rule-presets` | User | List available presets (Nelson, AIAG, WECO, Wheeler) |

### Sample Submission (triggers violation evaluation)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/samples` | Operator+ | Submit sample. Body: `{ characteristic_id, measurements: [float], batch_number?, operator_id? }`. Response includes `violations` array |

### Seeding Example

```bash
# 1. Create hierarchy and characteristic (see 02-plants-hierarchy.md)
# 2. Seed 25 normal samples to establish control limits
for i in $(seq 1 25); do
  curl -X POST $API/samples \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"characteristic_id\": $CHAR_ID, \"measurements\": [10.00]}"
done

# 3. Recalculate limits
curl -X POST $API/characteristics/$CHAR_ID/recalculate-limits \
  -H "Authorization: Bearer $TOKEN"

# 4. Submit a value beyond 3 sigma to trigger Rule 1
curl -X POST $API/samples \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"characteristic_id\": $CHAR_ID, \"measurements\": [10.10]}"
# Response includes violations array with Rule 1 violation

# 5. Verify violation was created
curl -X GET "$API/violations?characteristic_id=$CHAR_ID" \
  -H "Authorization: Bearer $TOKEN"
```
