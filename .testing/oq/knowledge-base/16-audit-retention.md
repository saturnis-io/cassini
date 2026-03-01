# Feature: Audit Trail & Data Retention

## Category: AUDIT
## Config Reference: `{ prefix: "AUDIT", name: "Audit Trail & Retention", kb: "16-audit-retention.md" }`

---

## What It Does

The audit trail automatically logs every data mutation (POST, PUT, PATCH, DELETE) in the system, creating an immutable record of who did what, when, and from where. Data retention policies control how long SPC data is kept before archival or purge. Together these features provide the compliance backbone for regulated industries -- they ensure traceability, accountability, and controlled data lifecycle management.

The audit trail records: user identity, action type (create, update, delete, login, etc.), resource type and ID, IP address, user agent, timestamp, and a detail payload with specifics of what changed. It is implemented as fire-and-forget middleware on the backend -- every HTTP mutation is captured without slowing the request.

Data retention operates at four scoped levels with inheritance: **Global Default** (plant-wide) -> **Hierarchy Node** (department/line) -> **Characteristic** (individual metric). The most specific policy wins. Removing an override at any level causes that node to inherit from its parent. Retention actions include `delete` (permanent removal) and `archive` (move to cold storage). The purge engine runs on a configurable interval (default 24 hours) and records all purge operations in a history log for compliance traceability.

From a compliance perspective:

- **21 CFR Part 11** (FDA) -- Electronic records must be attributable (who), legible, contemporaneous, original, and accurate (ALCOA). The audit trail captures the "who" and "when" for every mutation. Retention policies ensure data is preserved for the regulated lifetime.
- **ISO 9001:2015 Section 7.5** -- Documented information must be controlled, including retention, disposition, and preservation. Retention policies implement this control.
- **IATF 16949** -- Control of records requires defined retention periods. Automotive PPAP records typically require 15-year retention. Cassini allows setting time-based retention at any granularity (days, months, years).
- **AS9100** -- Aerospace quality records must be retained for contract duration plus any regulatory holdover. Characteristic-level overrides allow per-contract retention.
- **FDA Medical Devices** -- Product lifetime plus 1 year for device history records. The global default can be set to match this requirement, with overrides for shorter-lived components.
- **GMP** -- Good Manufacturing Practice requires complete batch records with defined retention. The purge history provides evidence that retention policies are being enforced.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Audit log viewer | `/settings/audit-log` | Admin | Table of all audit entries with filters, pagination, and CSV export |
| Audit stats | `/settings/audit-log` (summary section) | Admin | Aggregate counts by action type and resource type |
| CSV export | `/settings/audit-log` > Export button | Admin | Download filtered audit entries as CSV file |
| Retention policy (global) | `/settings/retention` > Policy tab | Engineer | Set or view the plant-wide default retention policy |
| Retention overrides | `/settings/retention` > Overrides tab | Engineer | View and manage hierarchy/characteristic-level overrides |
| Retention tree browser | `/settings/retention` > Overrides tab | Engineer | Navigate the plant hierarchy to set per-node overrides |
| Purge activity | `/settings/retention` > Activity tab | Engineer | View history of purge runs (started, completed, records affected) |
| Next purge info | `/settings/retention` > Activity tab | Engineer | See when the next scheduled purge will run |
| Manual purge trigger | `/settings/retention` > Activity tab | Admin | Trigger an immediate purge (may require electronic signature) |

---

## Key Concepts (Six Sigma Context)

### Audit Trail -- ALCOA Compliance

ALCOA is the FDA's data integrity framework. The audit trail addresses multiple ALCOA elements:

| ALCOA Element | Audit Trail Implementation |
|---|---|
| **Attributable** | Every entry records `user_id` and `username` -- who performed the action |
| **Legible** | Structured JSON `detail` field with human-readable action labels |
| **Contemporaneous** | Timestamp captured at the moment of the HTTP request, not deferred |
| **Original** | Audit log entries are append-only; they cannot be edited or deleted through the application |
| **Accurate** | Captures the actual HTTP method and URL, parsed into action + resource type by the middleware |

### Audit Log Entry Structure

Each audit log entry contains:

| Field | Type | Description |
|---|---|---|
| `id` | int | Auto-increment primary key |
| `user_id` | int (nullable) | The authenticated user who performed the action (null for system events) |
| `username` | string (nullable) | The username at the time of the action (denormalized for readability) |
| `action` | string | The action type: `create`, `update`, `delete`, `login`, `logout`, `recalculate`, `acknowledge`, `export`, `submit`, `approve`, `reject`, `sign`, `purge`, etc. |
| `resource_type` | string (nullable) | The type of resource affected: `characteristic`, `sample`, `plant`, `user`, `hierarchy`, `violation`, `signature`, `fai_report`, `msa_study`, etc. |
| `resource_id` | int (nullable) | The ID of the specific resource affected |
| `detail` | JSON (nullable) | Arbitrary detail payload (e.g., changed fields, old/new values) |
| `ip_address` | string (nullable) | The client IP address |
| `user_agent` | string (nullable) | The client user agent string |
| `timestamp` | datetime | UTC timestamp of the event |

### Action Labels (Frontend Display)

The AuditLogViewer maps raw action strings to human-readable labels:

- `login` -> "Login", `login_failed` -> "Login Failed", `logout` -> "Logout"
- `create` -> "Create", `update` -> "Update", `delete` -> "Delete"
- `recalculate` -> "Recalculate", `acknowledge` -> "Acknowledge", `export` -> "Export"
- `submit` -> "Submit", `approve` -> "Approve", `reject` -> "Reject"
- `sign` -> "Sign", `purge` -> "Purge", `sync` -> "Sync"
- `password_reset_requested` -> "Password Reset Requested", `password_reset_completed` -> "Password Reset"
- `email_verified` -> "Email Verified", `profile_updated` -> "Profile Updated"

### Resource Labels (Frontend Display)

Resource types are displayed with human-readable labels:

- `characteristic` -> "Characteristic", `sample` -> "Sample", `plant` -> "Plant"
- `user` -> "User", `hierarchy` -> "Hierarchy", `violation` -> "Violation"
- `signature` -> "Signature", `fai_report` -> "FAI Report", `msa_study` -> "MSA Study"
- `retention` -> "Retention", `database` -> "Database", `api_key` -> "API Key"
- `gage_bridge` -> "Gage Bridge", `anomaly` -> "Anomaly", `erp_connector` -> "ERP Connector"

### Data Retention -- Inheritance Chain

Retention policies use a hierarchical inheritance model:

```
Global Default (plant-wide)
  |
  +-- Hierarchy Node (department/line)
  |     |
  |     +-- Characteristic (individual metric)
  |
  +-- Hierarchy Node (no override -> inherits global)
        |
        +-- Characteristic (no override -> inherits hierarchy -> inherits global)
```

At each level, a policy can be one of three types:

| Type | Description | Fields Required |
|---|---|---|
| `forever` | Never purge (default when no policy is set) | None |
| `sample_count` | Keep the most recent N samples | `retention_value` (the count) |
| `time_delta` | Keep data newer than N units | `retention_value` + `retention_unit` (days, months, years) |

**Resolution logic**: The system walks from the most specific level (characteristic) up to the least specific (global default). The first explicitly set policy wins. If no policy is set at any level, the implicit default is "forever" (no purge).

### Purge Engine

The purge engine runs periodically (default every 24 hours) and:

1. Iterates over all plants
2. For each characteristic, resolves the effective retention policy
3. Identifies data (samples/measurements) older than the retention threshold
4. Deletes or archives the identified data based on the policy action
5. Records the purge run in `purge_history` (started_at, completed_at, records_affected, status)

Manual purge can be triggered by an admin. If a signature workflow is configured for `retention_purge`, the purge is gated behind electronic signature approval -- the admin must complete the workflow before the purge executes.

### CSV Export

The audit log can be exported as CSV with columns: `timestamp`, `username`, `action`, `resource_type`, `resource_id`, `ip_address`, `detail`. The export respects the same filters as the viewer (action, user, date range, resource type) and is capped at 10,000 rows per export.

---

## How To Configure (Step-by-Step)

### Viewing the Audit Log (Admin)

1. Log in as an admin user.
2. Navigate to `/settings/audit-log`.
3. The audit log table loads with the most recent entries first.
4. Use the filter controls to narrow results:
   - **Action**: Filter by action type (create, update, delete, login, etc.)
   - **User**: Filter by user ID or username
   - **Resource Type**: Filter by resource type (characteristic, sample, etc.)
   - **Date Range**: Filter by start date and end date
5. Pagination controls at the bottom allow navigating through large result sets.
6. Click **Export CSV** to download the filtered results.

### Setting the Global Retention Default (Engineer+)

1. Navigate to `/settings/retention`.
2. On the **Policy** tab, the current global default is displayed.
3. To change it:
   - Select the retention type: `forever`, `sample_count`, or `time_delta`.
   - For `sample_count`: Enter the number of samples to retain.
   - For `time_delta`: Enter the value and unit (days, months, years).
4. Click **Save**. The new default applies to all nodes that do not have an explicit override.

### Setting a Hierarchy-Level Override (Engineer+)

1. Navigate to `/settings/retention` > **Overrides** tab.
2. Use the retention tree browser to navigate the plant hierarchy.
3. Select a hierarchy node (department or line).
4. Set the desired retention policy (type, value, unit).
5. Click **Save**. The override applies to this node and all children that do not have their own override.
6. To remove an override: Click the delete/remove button on the override. The node will inherit from its parent.

### Setting a Characteristic-Level Override (Engineer+)

1. Navigate to `/settings/retention` > **Overrides** tab.
2. Navigate to the characteristic in the tree browser.
3. Set the desired retention policy.
4. Click **Save**.

### Viewing Purge Activity

1. Navigate to `/settings/retention` > **Activity** tab.
2. View the list of past purge runs with: started_at, completed_at, records purged, status.
3. The "Next Purge" section shows when the next automatic purge is scheduled.

### Triggering a Manual Purge (Admin)

1. On the **Activity** tab, click **Run Purge Now** (or equivalent trigger button).
2. If a signature workflow is configured for `retention_purge`, a SignatureDialog will appear -- complete the workflow.
3. If no workflow is required, the purge executes immediately.
4. The result appears in the activity list.

---

## How To Use (Typical Workflow)

### Investigating an Anomaly via Audit Trail

1. Navigate to `/settings/audit-log`.
2. Filter by `resource_type: characteristic` and `action: update`.
3. Narrow by date range to the period of interest.
4. Review the detail payloads to see what was changed and by whom.
5. Export the filtered results as CSV for your investigation report.

### Setting Up a Compliant Retention Strategy

1. Set the global default to your organization's minimum retention (e.g., 365 days for ISO, 5475 days for automotive PPAP).
2. Override at the hierarchy level for departments with different requirements.
3. Override at the characteristic level for safety-critical measurements that need longer retention.
4. Verify the effective policy for a sample characteristic using the tree browser -- confirm the inheritance chain shows the correct resolved policy.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Audit log shows entries for all HTTP mutations | Create/update/delete a resource, verify entries appear in audit log |
| 2 | Audit log captures login and logout events | Log in and out, verify entries with action `login`/`logout` |
| 3 | Filters work: by action, user, date range, resource type | Apply each filter, verify results are correctly narrowed |
| 4 | CSV export downloads with correct columns and filtered data | Export with filters, verify CSV contents match displayed results |
| 5 | Audit stats show correct aggregate counts | Compare stats endpoint with manual count of log entries |
| 6 | Global retention default saves and retrieves correctly | Set default, refresh page, verify persisted |
| 7 | Hierarchy-level override saves and displays in tree | Set override, verify inheritance chain shows override |
| 8 | Characteristic-level override saves and displays | Set override, verify effective policy resolution |
| 9 | Removing an override causes inheritance from parent | Remove override, verify node inherits parent policy |
| 10 | Purge activity shows history of purge runs | After a purge, verify history entry with timestamps and counts |
| 11 | Manual purge trigger works (admin only) | Trigger purge, verify it executes and records history |
| 12 | Signature-gated purge returns workflow requirement | Configure purge workflow, trigger purge, verify signature prompt |
| 13 | Effective policy resolution walks the full inheritance chain | Set policies at multiple levels, verify characteristic resolves correctly |
| 14 | Pagination works for large audit logs | Generate many entries, verify page navigation |

---

## Edge Cases & Constraints

- **Audit log growth**: The audit log can grow very large in production. Pagination is required -- the API limits results to 500 per page (configurable via `limit` parameter, max 500). CSV export is capped at 10,000 rows.
- **Audit log is admin-only**: All three endpoints (`/audit/logs`, `/audit/stats`, `/audit/logs/export`) require the admin role via `get_current_admin` dependency.
- **Retention policy removal means inheritance, not "no policy"**: When you remove a retention override at a hierarchy or characteristic level, the node inherits from its parent. It does not mean "retain forever" unless the parent's resolved policy is "forever".
- **No regulatory minimum enforcement**: The application does not enforce minimum retention periods (e.g., it will not prevent you from setting 1-day retention). Compliance with regulatory minimums is the user's responsibility.
- **Purge is irreversible for `delete` action**: Once data is purged with the `delete` action, it is permanently removed. The `archive` action moves data to cold storage, which is recoverable.
- **Purge engine must be running**: Manual purge requires the purge engine to be running on the backend (stored in `app.state.purge_engine`). If not running, the API returns 503.
- **Signature-gated purge returns HTTP 202**: When a signature workflow is configured for `retention_purge`, the manual purge endpoint returns a `workflow_instance_id` instead of executing immediately. The purge only runs after the workflow is fully completed.
- **Audit log detail field is JSON**: The `detail` field can contain arbitrary JSON. The frontend renders it as a collapsible JSON viewer. Very large detail payloads may slow rendering.
- **Concurrent purge safety**: The purge engine serializes purge runs per plant. Two concurrent manual triggers for the same plant will not cause duplicate deletions.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically.

### Audit Log Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/audit/logs` | Admin | List audit entries with filters and pagination. Query: `user_id`, `action`, `resource_type`, `start_date`, `end_date`, `limit` (1-500, default 50), `offset` (default 0) |
| `GET` | `/audit/stats` | Admin | Get aggregate stats: total events, events by action, events by resource type |
| `GET` | `/audit/logs/export` | Admin | Export filtered audit entries as CSV (max 10,000 rows). Same query params as list |

### Retention Policy Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/retention/default?plant_id={id}` | User | Get global default retention policy for a plant. Returns null if no explicit default |
| `PUT` | `/retention/default?plant_id={id}` | Engineer+ | Set global default. Body: `RetentionPolicySet` |
| `GET` | `/retention/hierarchy/{id}` | User | Get retention override for a hierarchy node |
| `PUT` | `/retention/hierarchy/{id}` | Engineer+ | Set retention override for a hierarchy node. Body: `RetentionPolicySet` |
| `DELETE` | `/retention/hierarchy/{id}` | Engineer+ | Remove hierarchy-level override (returns 204) |
| `GET` | `/retention/characteristic/{id}` | User | Get retention override for a characteristic |
| `PUT` | `/retention/characteristic/{id}` | Engineer+ | Set retention override for a characteristic. Body: `RetentionPolicySet` |
| `DELETE` | `/retention/characteristic/{id}` | Engineer+ | Remove characteristic-level override (returns 204) |
| `GET` | `/retention/characteristic/{id}/effective` | User | Resolve effective policy with full inheritance chain |
| `GET` | `/retention/overrides?plant_id={id}` | User | List all non-global overrides for a plant |
| `GET` | `/retention/activity?plant_id={id}` | User | List recent purge runs (limit 1-100, default 20) |
| `GET` | `/retention/next-purge?plant_id={id}` | User | Get next scheduled purge info |
| `POST` | `/retention/purge?plant_id={id}` | Admin | Trigger manual purge (may return workflow requirement) |

### Request/Response Schemas

**RetentionPolicySet** (create/update body):
```json
{
  "retention_type": "time_delta",
  "retention_value": 365,
  "retention_unit": "days"
}
```

Valid `retention_type` values: `forever`, `sample_count`, `time_delta`.
Valid `retention_unit` values: `days`, `months`, `years` (required only for `time_delta`).

**RetentionPolicyResponse**:
```json
{
  "id": 1,
  "plant_id": 1,
  "scope": "global",
  "hierarchy_id": null,
  "characteristic_id": null,
  "retention_type": "time_delta",
  "retention_value": 365,
  "retention_unit": "days"
}
```

**EffectiveRetentionResponse**:
```json
{
  "retention_type": "time_delta",
  "retention_value": 730,
  "retention_unit": "days",
  "source": "hierarchy"
}
```

**AuditLogListResponse**:
```json
{
  "items": [
    {
      "id": 42,
      "user_id": 1,
      "username": "admin",
      "action": "update",
      "resource_type": "characteristic",
      "resource_id": 5,
      "detail": {"changed_fields": ["name", "usl"]},
      "ip_address": "192.168.1.10",
      "user_agent": "Mozilla/5.0 ...",
      "timestamp": "2026-02-26T14:30:00"
    }
  ],
  "total": 1234,
  "limit": 50,
  "offset": 0
}
```

### Seeding Example

```bash
# Audit log entries are created automatically by the middleware.
# No manual seeding is needed -- simply perform CRUD operations and entries appear.

# 1. Verify audit log has entries (admin only)
curl -X GET "$API/audit/logs?limit=10" \
  -H "Authorization: Bearer $TOKEN"

# 2. Filter by action
curl -X GET "$API/audit/logs?action=create&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# 3. Get stats
curl -X GET "$API/audit/stats" \
  -H "Authorization: Bearer $TOKEN"

# 4. Export as CSV
curl -X GET "$API/audit/logs/export?action=update" \
  -H "Authorization: Bearer $TOKEN" \
  -o audit_export.csv

# 5. Set global retention default (365 days)
curl -X PUT "$API/retention/default?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"retention_type": "time_delta", "retention_value": 365, "retention_unit": "days"}'

# 6. Set hierarchy override (730 days for a department)
curl -X PUT "$API/retention/hierarchy/$HIER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"retention_type": "time_delta", "retention_value": 730, "retention_unit": "days"}'

# 7. Get effective policy for a characteristic
curl -X GET "$API/retention/characteristic/$CHAR_ID/effective" \
  -H "Authorization: Bearer $TOKEN"

# 8. View purge activity
curl -X GET "$API/retention/activity?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN"
```
