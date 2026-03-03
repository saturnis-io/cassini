# Audit Logging Redesign — Audit Context Injection

**Date**: 2026-02-27
**Status**: Approved
**Approach**: B — Hybrid (middleware safety net + endpoint-level context injection)

## Problem

The current AuditMiddleware captures `{"method": "POST", "path": "/api/v1/..."}` for all mutating HTTP requests. This tells an auditor _that_ something happened, but not _what_ — no resource names, no computed results, no business context. For regulated actions like signing an MSA approval, the log just shows "Sign — Signature" with no indication of what was signed or why.

## Goals

- **Regulatory-grade detail** on ~25 critical endpoints (signatures, FAI, MSA, violations, data changes, user management)
- **Operational-grade coverage** on ~140 routine endpoints (CRUD) with auto-captured request bodies
- **Self-describing entries** — every log entry stands alone without needing database cross-references
- **Background operation coverage** — event-bus-driven actions (violation creation, anomaly detection, purges) get explicit audit calls

## Design

### Mechanism: `request.state.audit_context`

Endpoints that need rich context set a typed dict on the request state. The middleware reads it and merges it into the log entry.

```python
# In any Tier 1 endpoint:
request.state.audit_context = {
    "resource_type": "msa_study",       # overrides URL-parsed type
    "resource_id": study.id,            # overrides URL-parsed ID
    "action": "calculate",              # overrides method-based action
    "summary": "Gage R&R calculated for 'Caliper Study #4': GRR=12.3%, ndc=8",
    "fields": {
        "study_name": "Caliper Study #4",
        "method": "anova",
        "grr_percent": 12.3,
        "ndc": 8,
        "characteristic_name": "Bore Diameter",
    },
}
```

### Middleware Behavior

1. After response, check `request.state.audit_context`:
   - If present: use its `resource_type`, `resource_id`, `action` as overrides; merge `summary` + `fields` into `detail`
   - If not present: fall back to current URL-parsing + method-mapping behavior
2. For Tier 2 (no audit_context set), auto-capture the sanitized request body in `detail.body`
3. Strip sensitive fields from auto-captured bodies: `password`, `secret`, `api_key`, `token`, `credential`, `client_secret`
4. Always capture: `user_id`, `username`, `ip_address`, `user_agent`, `timestamp`

### Action Tiers

**Tier 1 — Regulatory (hand-crafted `audit_context`, ~25 endpoints):**

| Domain | Endpoints | Summary example |
|--------|-----------|-----------------|
| Signatures | sign, reject | "Signed MSA Study 'Caliper #4' as Approver — Approved" |
| FAI | submit, approve, reject | "FAI Report 'Part ABC-123 Rev C' approved by jane.doe" |
| MSA | calculate, attribute-calculate | "Gage R&R: GRR=12.3%, ndc=8 for 'Bore Diameter'" |
| Violations | acknowledge, batch-acknowledge | "3 violations acknowledged: Rule 1 on 'Bore Diameter' — Tool Change" |
| Samples | create, update, delete, exclude | "Sample submitted for 'Bore Diameter': [25.01, 25.03, 24.98]" |
| Control limits | recalculate, set-limits | "Control limits recalculated for 'Bore Diameter': UCL=25.12, CL=25.00, LCL=24.88" |
| Users | create, deactivate, role changes | "Role 'supervisor' assigned to user 'john.doe' at plant 'Plant A'" |
| Data retention | purge | "Purge completed: 1,245 samples deleted (90-day policy)" |
| Import | confirm | "CSV import confirmed: 500 samples for 'Bore Diameter'" |

**Tier 2 — Operational (auto-captured body, ~140 endpoints):**

All remaining CRUD endpoints. Middleware captures resource_type, resource_id, action, plus the sanitized request body. Examples:
- "Create Characteristic #42" + body: `{name: "Bore Diameter", chart_type: "xbar_r", ...}`
- "Update Plant #1" + body: `{name: "Plant A", is_active: true}`

### Background Operations (Event Bus)

Event bus subscribers that create/modify data get explicit `audit_service.log_event()` calls:

| Event | Summary logged |
|-------|---------------|
| ViolationCreatedEvent | "Rule 1 (Outlier) triggered on 'Bore Diameter' — CRITICAL" |
| AnomalyDetectedEvent | "PELT changepoint on 'Surface Finish' at sample #245" |
| PredictedOOCEvent | "Forecast: OOC predicted in 3 samples for 'Thread Pitch'" |
| WorkflowCompletedEvent | "Workflow completed: MSA Study 'Gage #4 R&R'" |
| WorkflowExpiredEvent | "Workflow expired: FAI Report 'Part ABC-123' (7 days)" |
| SignatureInvalidatedEvent | "2 signatures invalidated on FAI Report #12" |
| Scheduled purge | "Purge: 1,245 samples, 89 violations deleted" |
| Notification dispatch | "Email sent to john.doe@acme.com: CRITICAL violation" |

### Detail Schema

```typescript
interface AuditDetail {
  // Set by middleware or audit_context override
  method?: string        // HTTP method
  path?: string          // Request path

  // Set by audit_context (Tier 1) or auto-captured (Tier 2)
  summary?: string       // Human-readable one-liner
  fields?: Record<string, string | number | boolean | null>  // Domain detail

  // Auto-captured for Tier 2
  body?: Record<string, unknown>  // Sanitized request body
}
```

### Frontend Changes

**AuditLogViewer table columns:**

| Timestamp | User | Action | Resource | Summary | IP |
|-----------|------|--------|----------|---------|-----|

- New `Summary` column shows `detail.summary` inline (truncated to ~60 chars)
- Expanded row: `DetailDisplay` component renders `detail.fields` as labeled key-value grid
- If no summary, falls back to current resource_type + ID display
- `DETAIL_KEY_LABELS` dict maps field keys to human labels
- `RESOURCE_LABELS` dict maps resource_type values to display names

### DB Model

No schema changes. The existing `detail` JSON column on `audit_log` handles the new structure. The `summary` and `fields` keys are just new conventions within the JSON.

### Missing Resource Patterns

Add to `_RESOURCE_PATTERNS` in `core/audit.py`:
- `/api/v1/characteristics/(\d+)/diagnose` → `ishikawa`
- `/api/v1/scheduled-reports/` → `report_schedule`

### Sensitive Field Stripping

Middleware auto-strips these keys from captured request bodies:
```python
_SENSITIVE_KEYS = {"password", "secret", "api_key", "token", "credential",
                   "client_secret", "auth_config", "p256dh", "auth"}
```

## Implementation Scope

1. **Backend: Upgrade AuditMiddleware** — read `request.state.audit_context`, auto-capture sanitized body for Tier 2
2. **Backend: Add audit_context to ~25 Tier 1 endpoints** — signatures, FAI, MSA, violations, samples, control limits, users, retention, import
3. **Backend: Add audit calls to ~9 event bus subscribers** — violation created, anomaly detected, workflow completed/expired, purge, notifications
4. **Backend: Add missing resource patterns** — ishikawa, scheduled-reports
5. **Frontend: Upgrade AuditLogViewer** — summary column, detail grid display
