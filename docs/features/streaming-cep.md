# Streaming CEP rules

**Tier:** Enterprise · **API:** `GET/POST/PUT/DELETE /api/v1/cep_rules`

A multi-stream complex-event-processing (CEP) engine that fires when a pattern across **two or more characteristics** holds inside a sliding time window. Rules are authored in YAML, validated and live-edited via a Monaco-based editor in the web UI, and hot-reloaded into the running engine without restarting the backend.

Streaming CEP solves a class of problem that single-characteristic SPC rules can't: cross-process correlation, supplier batch effects, shared input drift, mating-fit risk, thermal runaway. Anything where the diagnostic signal is "two things happening together" rather than "one thing exceeding a limit."

## Rule structure

```yaml
name: rule-name                                # required, unique per plant
description: Human-readable summary             # optional, shown in the UI
window: 5m                                      # required, sliding window
conditions:                                     # required, 2..N conditions
  - characteristic: Plant 1 > Line A > Sta 1   # full hierarchy path or numeric ID
    rule: above_mean_consecutive
    count: 4
  - characteristic: Plant 1 > Line A > Sta 2
    rule: above_mean_consecutive
    count: 4
action:                                         # required
  violation: SHARED_ROOT_CAUSE_SUSPECTED        # violation code (free text, max 120 chars)
  severity: high                                # low | medium | high | critical
  message: >-                                   # optional, max 500 chars, routed to notifications
    All stations on Line A drifting together — check shared inputs first.
```

A rule fires when **every condition** is true at least once inside the same `window`. Conditions can apply to different characteristics, different lines, even different plants (subject to RBAC) — the engine joins streams on the time axis.

## Available conditions

The full set of `CepConditionKind` values, mirroring Nelson semantics:

| Rule | Description | Required fields |
|------|-------------|-----------------|
| `above_mean_consecutive` | N points in a row above the centerline. | `count` |
| `below_mean_consecutive` | N points in a row below the centerline. | `count` |
| `above_value` | N consecutive points above an absolute threshold. | `count`, `threshold` |
| `below_value` | N consecutive points below an absolute threshold. | `count`, `threshold` |
| `out_of_control` | Engine-flagged out-of-control points (Nelson rule violation). | `count` |
| `increasing` | N points in a row each greater than the previous. | `count` |
| `decreasing` | N points in a row each less than the previous. | `count` |

`threshold` is required only for `above_value` and `below_value` (enforced by the schema model validator); other kinds reject it as an extra field.

## Window syntax

The `window` value accepts simple human-readable durations: `30s`, `2m`, `15m`, `1h`. The engine maintains a rolling buffer per characteristic; conditions are re-evaluated every time a new sample arrives.

## Example: thermal runaway

```yaml
name: thermal-runaway
description: Coolant temperature and cut diameter both trending up — pause for coolant check
window: 2m
conditions:
  - characteristic: Plant 1 > Line A > Lathe 3 > Coolant Temp
    rule: increasing
    count: 6
  - characteristic: Plant 1 > Line A > Lathe 3 > Cut Diameter
    rule: increasing
    count: 6
action:
  violation: THERMAL_RUNAWAY_SUSPECTED
  severity: critical
  message: >-
    Coolant temperature and cut diameter are climbing together. Pause
    the line and inspect coolant flow / chiller before the next cut.
```

## Example: cross-station drift

```yaml
name: cross-station-drift
description: Three stations on Line A drift up together within 5m — shared root cause
window: 5m
conditions:
  - characteristic: Plant 1 > Line A > Station 1 > Diameter
    rule: above_mean_consecutive
    count: 4
  - characteristic: Plant 1 > Line A > Station 2 > Diameter
    rule: above_mean_consecutive
    count: 4
  - characteristic: Plant 1 > Line A > Station 3 > Diameter
    rule: above_mean_consecutive
    count: 4
action:
  violation: SHARED_ROOT_CAUSE_SUSPECTED
  severity: high
  message: >-
    All three stations on Line A are drifting in the same direction.
    Check coolant lot, raw material certificate, and ambient temperature
    before adjusting tools.
```

## Example: assembly-fit risk

```yaml
name: shaft-bore-mismatch
description: Shaft OD up while bore ID drifts down within 30s — assembly fit risk
window: 30s
conditions:
  - characteristic: Plant 1 > Line A > Lathe 3 > Shaft OD
    rule: above_mean_consecutive
    count: 5
  - characteristic: Plant 1 > Line A > Mill 2 > Bore ID
    rule: below_mean_consecutive
    count: 5
action:
  violation: ASSEMBLY_DRIFT_RISK
  severity: high
  message: >-
    Mating fit drift detected. Inspect the next assembly batch before
    further parts are committed.
```

More examples in [`docs/cep-examples/`](../cep-examples/).

## Validation endpoint

The Monaco editor calls `POST /api/v1/cep_rules/validate` on every keystroke (debounced) to render inline diagnostics. The endpoint parses the YAML and runs the same Pydantic schema check used at create-time, returning structured `{line, column, message}` markers.

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  https://cassini.example.com/api/v1/cep_rules/validate \
  -d '{"yaml_text": "name: test\nwindow: 2m\nconditions: []"}'
```

```json
{
  "valid": false,
  "errors": [
    { "line": 3, "column": 13, "message": "List should have at least 2 items, got 0", "location": "conditions" }
  ],
  "parsed": null
}
```

## Lifecycle

1. **Create** with `POST /api/v1/cep_rules` (engineer role required at the target plant).
2. **Hot-reload** — the engine is notified after every create / update / delete; new rules become active in milliseconds without restarting the backend.
3. **Disable** without deleting via `enabled: false` on the rule. The rule is preserved in the audit history but produces no events.

## Routing fired events

CEP-fired violations route through the same notification dispatcher as Nelson rule violations. Configure email recipients, webhooks, or PWA push subscriptions per plant; the violation code from `action.violation` lets you filter by pattern.

## Authoring tips

- **Start narrow.** Two conditions inside a small window beats five conditions across an hour. False positives erode operator trust faster than missed signals.
- **Use absolute thresholds (`above_value`) for hard ceilings**, statistical conditions (`above_mean_consecutive`) for drift.
- **Name the violation by the suspected cause**, not the symptom: `THERMAL_RUNAWAY_SUSPECTED` is more useful in a notification than `MULTI_CHAR_DRIFT`.
- **Test against historical data** by running the engine in dry-run mode on a backfill.
