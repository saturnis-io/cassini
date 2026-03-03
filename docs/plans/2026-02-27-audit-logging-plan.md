# Audit Logging Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the context-free AuditMiddleware with a hybrid system where critical endpoints inject rich business context, Tier 2 endpoints auto-capture sanitized request bodies, and event bus subscribers log background operations.

**Architecture:** Middleware reads `request.state.audit_context` (if set by endpoint) and merges its `summary` + `fields` into the audit detail. Falls back to URL-parsed resource type + auto-captured sanitized body for Tier 2 endpoints. Event bus subscribers call `audit_service.log_event()` directly.

**Tech Stack:** FastAPI middleware, Starlette Request.state, SQLAlchemy async (existing AuditLog model), React/TypeScript frontend

**Design doc:** `docs/plans/2026-02-27-audit-logging-redesign.md`

---

## Wave 1: Upgrade AuditMiddleware

### Task 1.1: Add request body capture and audit_context merging to middleware

**Files:**
- Modify: `backend/src/cassini/core/audit.py` (lines 219–265, dispatch method)

**Step 1: Add sensitive field stripping helper**

Add above `AuditMiddleware` class (after `_method_to_action`, around line 141):

```python
_SENSITIVE_KEYS = frozenset({
    "password", "secret", "api_key", "token", "credential",
    "client_secret", "auth_config", "p256dh", "auth_key",
})


def _sanitize_body(body: dict) -> dict:
    """Strip sensitive fields from a request body dict for audit logging."""
    return {k: v for k, v in body.items() if k.lower() not in _SENSITIVE_KEYS}
```

**Step 2: Add body-reading middleware wrapper**

Replace the `dispatch` method in `AuditMiddleware` (lines 226–265). The key changes:
1. Read and cache the request body BEFORE calling `call_next` (using `request.body()`)
2. After response, check for `request.state.audit_context`
3. If audit_context exists: use its overrides for resource_type, resource_id, action; put summary + fields in detail
4. If no audit_context: use URL-parsed values + sanitized body in detail

```python
async def dispatch(self, request: Request, call_next) -> Response:
    # Cache request body for Tier 2 auto-capture (only for mutating methods)
    cached_body: dict | None = None
    if request.method in ("POST", "PUT", "PATCH"):
        try:
            raw = await request.body()
            if raw:
                import json
                cached_body = json.loads(raw)
        except Exception:
            cached_body = None

    response = await call_next(request)

    audit_service: Optional[AuditService] = getattr(
        request.app.state, "audit_service", None
    )
    if audit_service is None:
        return response

    if (
        request.method in ("POST", "PUT", "PATCH", "DELETE")
        and response.status_code < 400
        and request.url.path not in _SKIP_PATHS
        and not any(
            seg in request.url.path
            for seg in (
                "/auth/login", "/auth/logout", "/auth/refresh", "/auth/token",
                "/signatures/sign", "/signatures/reject",
            )
        )
    ):
        user_id, username = _extract_user_from_request(request)
        ip = _get_client_ip(request)
        ua = (request.headers.get("user-agent") or "")[:512]

        # Check for endpoint-injected audit context (Tier 1)
        audit_ctx: dict | None = getattr(request.state, "audit_context", None)

        if audit_ctx:
            resource_type = audit_ctx.get("resource_type") or _parse_resource(request.url.path)[0]
            resource_id = audit_ctx.get("resource_id") or _parse_resource(request.url.path)[1]
            action = audit_ctx.get("action") or _method_to_action(request.method, request.url.path)
            detail = {
                "summary": audit_ctx.get("summary"),
                **(audit_ctx.get("fields") or {}),
            }
        else:
            resource_type, resource_id = _parse_resource(request.url.path)
            action = _method_to_action(request.method, request.url.path)
            detail: dict = {"method": request.method, "path": request.url.path}
            # Tier 2: auto-capture sanitized body
            if cached_body and isinstance(cached_body, dict):
                detail["body"] = _sanitize_body(cached_body)

        asyncio.create_task(
            audit_service.log(
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                user_id=user_id,
                username=username,
                ip_address=ip,
                user_agent=ua,
                detail=detail,
            )
        )

    return response
```

**Step 3: Add missing resource patterns**

Add to `_RESOURCE_PATTERNS` list (around line 60):

```python
(re.compile(r"/api/v1/characteristics/(\d+)/diagnose"), "ishikawa"),
(re.compile(r"/api/v1/scheduled-reports(?:/(\d+))?"), "report_schedule"),
```

**Step 4: Verify backend starts**

Run: `cd backend && python -c "from cassini.core.audit import AuditMiddleware; print('OK')"`

**Step 5: Commit**

```
feat(audit): upgrade middleware with audit_context injection and body capture
```

---

## Wave 2: Tier 1 — Regulated Workflows (Signatures, FAI, MSA)

### Task 2.1: Convert signatures.py to audit_context pattern

**Files:**
- Modify: `backend/src/cassini/api/v1/signatures.py` (lines 80–171)

**Step 1: Replace explicit audit calls with request.state.audit_context**

In `execute_signature()` (line 80), REMOVE the existing explicit `audit_service.log()` call we added earlier. Instead, set `request.state.audit_context` before the return:

```python
    # After session.commit() and before return SignResponse:
    request.state.audit_context = {
        "resource_type": body.resource_type,
        "resource_id": body.resource_id,
        "action": "sign",
        "summary": f"Signed {body.resource_type.replace('_', ' ').title()} #{body.resource_id}"
                   + (f" as {step_name}" if step_name else "")
                   + (f" — {sig.meaning_display}" if sig.meaning_display else ""),
        "fields": {
            "resource_type": body.resource_type,
            "resource_id": body.resource_id,
            "meaning": sig.meaning_display,
            "workflow_step": step_name,
            "workflow_status": workflow_status,
            "comment": body.comment,
            "plant_id": plant_id,
            "signature_id": sig.id,
            "signer": sig.username,
        },
    }
```

In `reject_workflow()` (line 148), similarly REMOVE explicit audit call and set:

```python
    request.state.audit_context = {
        "resource_type": "signature",
        "action": "reject",
        "summary": f"Rejected workflow instance #{body.workflow_instance_id}",
        "fields": {
            "workflow_instance_id": body.workflow_instance_id,
            "reason": body.reason,
            "plant_id": plant_id,
        },
    }
```

**Step 2: Remove signatures from middleware exclusion list**

In `audit.py` (lines 239–245), remove `"/signatures/sign"` and `"/signatures/reject"` from the exclusion list — the middleware will now handle them via audit_context.

**Step 3: Commit**

```
feat(audit): convert signatures to audit_context pattern
```

### Task 2.2: Add audit_context to FAI endpoints

**Files:**
- Modify: `backend/src/cassini/api/v1/fai.py`

**Step 1: Add audit_context to submit_report()**

After status change and before return (around line 360):

```python
    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "submit",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' submitted for approval",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "part_number": report.part_number,
            "serial_number": report.serial_number,
            "item_count": len(report.items) if hasattr(report, 'items') else None,
            "plant_id": plant_id,
        },
    }
```

**Step 2: Add audit_context to approve_report()**

After approval and before return (around line 410):

```python
    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "approve",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' approved",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "part_number": report.part_number,
            "approved_by": user.username,
            "submitted_by": report.submitted_by,
            "plant_id": plant_id,
        },
    }
```

**Step 3: Add audit_context to reject_report()**

```python
    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "reject",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' rejected",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "rejected_by": user.username,
            "reason": body.reason,
            "plant_id": plant_id,
        },
    }
```

**Step 4: Commit**

```
feat(audit): add rich context to FAI submit/approve/reject
```

### Task 2.3: Add audit_context to MSA endpoints

**Files:**
- Modify: `backend/src/cassini/api/v1/msa.py`

**Step 1: Add audit_context to calculate_gage_rr()**

After calculation completes and before return:

```python
    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Gage R&R calculated for '{study.name}'"
                   + (f": GRR={result.grr_percent:.1f}%, ndc={result.ndc}" if result else ""),
        "fields": {
            "study_name": study.name,
            "study_type": study.study_type,
            "method": method,
            "grr_percent": round(result.grr_percent, 2) if result else None,
            "ndc": result.ndc if result else None,
            "plant_id": plant_id,
        },
    }
```

**Step 2: Add audit_context to calculate_attribute_msa()**

Similar pattern with kappa values instead of GRR:

```python
    request.state.audit_context = {
        "resource_type": "msa_study",
        "resource_id": study.id,
        "action": "calculate",
        "summary": f"Attribute MSA calculated for '{study.name}'",
        "fields": {
            "study_name": study.name,
            "study_type": "attribute",
            "plant_id": plant_id,
        },
    }
```

**Step 3: Commit**

```
feat(audit): add rich context to MSA calculations
```

---

## Wave 3: Tier 1 — Data Operations (Violations, Samples, Control Limits)

### Task 3.1: Add audit_context to violation acknowledgment

**Files:**
- Modify: `backend/src/cassini/api/v1/violations.py`

**Step 1: Add to acknowledge_violation() (line 318)**

After successful acknowledgment, before return:

```python
    # Build summary with characteristic name if available
    char_name = ""
    if violation_obj.sample and violation_obj.sample.characteristic:
        char_name = f" on '{violation_obj.sample.characteristic.name}'"

    request.state.audit_context = {
        "resource_type": "violation",
        "resource_id": violation_id,
        "action": "acknowledge",
        "summary": f"Violation #{violation_id} acknowledged{char_name} — {data.reason}",
        "fields": {
            "rule_id": violation_obj.rule_id,
            "rule_name": violation_obj.rule_name,
            "severity": violation_obj.severity,
            "reason": data.reason,
            "acknowledged_by": data.user,
            "exclude_sample": data.exclude_sample,
        },
    }
```

Note: `violation_obj` is already loaded at line 367. The sample relationship may need `selectinload` — check if the `get_by_id` call already loads it. If not, use the `char_id` from the earlier query to build context.

**Step 2: Add to batch_acknowledge() (line 432)**

After the loop completes, before return:

```python
    request.state.audit_context = {
        "resource_type": "violation",
        "action": "acknowledge",
        "summary": f"{successful} violation(s) acknowledged — {request_body.reason}"
                   + (f" ({failed} failed)" if failed else ""),
        "fields": {
            "violation_ids": request_body.violation_ids,
            "reason": request_body.reason,
            "successful": successful,
            "failed": failed,
            "acknowledged_by": request_body.user,
        },
    }
```

Note: rename the `request` param variable to avoid shadowing Starlette's Request (the function uses `request: BatchAcknowledgeRequest`). The Starlette Request object needs to be added as a dependency.

**Step 3: Commit**

```
feat(audit): add rich context to violation acknowledgment
```

### Task 3.2: Add audit_context to sample operations

**Files:**
- Modify: `backend/src/cassini/api/v1/samples.py`

**Step 1: Add to submit_sample() (line 285)**

After sample is created and violations checked, before return. The `characteristic` object is already loaded:

```python
    request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": sample.id,
        "action": "create",
        "summary": f"Sample submitted for '{characteristic.name}': {data.measurements}",
        "fields": {
            "characteristic_name": characteristic.name,
            "characteristic_id": characteristic.id,
            "measurements": data.measurements,
            "operator_id": data.operator_id,
            "subgroup_size": len(data.measurements),
        },
    }
```

**Step 2: Add to update_sample()**

```python
    request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": sample_id,
        "action": "update",
        "summary": f"Sample #{sample_id} updated for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "new_measurements": data.measurements,
        },
    }
```

**Step 3: Add to delete_sample()**

```python
    request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": sample_id,
        "action": "delete",
        "summary": f"Sample #{sample_id} deleted from '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
        },
    }
```

**Step 4: Add to toggle_exclude()**

```python
    action_word = "excluded" if data.is_excluded else "included"
    request.state.audit_context = {
        "resource_type": "sample",
        "resource_id": sample_id,
        "action": "update",
        "summary": f"Sample #{sample_id} {action_word} from '{characteristic.name}' control limits",
        "fields": {
            "characteristic_name": characteristic.name,
            "is_excluded": data.is_excluded,
        },
    }
```

**Step 5: Commit**

```
feat(audit): add rich context to sample create/update/delete/exclude
```

### Task 3.3: Add audit_context to control limit operations

**Files:**
- Modify: `backend/src/cassini/api/v1/characteristics.py`

**Step 1: Add to recalculate_limits() (line 1133)**

After recalculation, before return:

```python
    request.state.audit_context = {
        "resource_type": "characteristic",
        "resource_id": characteristic.id,
        "action": "recalculate",
        "summary": f"Control limits recalculated for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "chart_type": characteristic.chart_type,
            "ucl": characteristic.ucl,
            "centerline": characteristic.center_line,
            "lcl": characteristic.lcl,
        },
    }
```

**Step 2: Add to set_limits() (line 1220)**

```python
    request.state.audit_context = {
        "resource_type": "characteristic",
        "resource_id": characteristic.id,
        "action": "update",
        "summary": f"Control limits manually set for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "ucl": data.ucl,
            "centerline": data.center_line,
            "lcl": data.lcl,
        },
    }
```

**Step 3: Commit**

```
feat(audit): add rich context to control limit recalculate/set
```

---

## Wave 4: Tier 1 — Admin Operations (Users, Retention, Import)

### Task 4.1: Add audit_context to user management

**Files:**
- Modify: `backend/src/cassini/api/v1/users.py`

**Step 1: Add to create_user()**

```python
    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": new_user.id,
        "action": "create",
        "summary": f"User '{data.username}' created",
        "fields": {
            "username": data.username,
            "email": data.email,
            "full_name": data.full_name,
        },
    }
```

**Step 2: Add to deactivate_user()**

```python
    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "delete",
        "summary": f"User '{target_user.username}' deactivated",
        "fields": {
            "target_username": target_user.username,
            "deactivated_by": current_user.username,
        },
    }
```

**Step 3: Add to assign_plant_role()**

```python
    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "update",
        "summary": f"Role '{data.role}' assigned to '{target_user.username}' at plant #{data.plant_id}",
        "fields": {
            "target_username": target_user.username,
            "role": data.role,
            "plant_id": data.plant_id,
            "assigned_by": current_user.username,
        },
    }
```

**Step 4: Add to remove_plant_role()**

```python
    request.state.audit_context = {
        "resource_type": "user",
        "resource_id": user_id,
        "action": "delete",
        "summary": f"Role revoked from '{target_user.username}' at plant #{plant_id}",
        "fields": {
            "target_username": target_user.username,
            "plant_id": plant_id,
            "revoked_by": current_user.username,
        },
    }
```

**Step 5: Commit**

```
feat(audit): add rich context to user management operations
```

### Task 4.2: Add audit_context to data retention purge

**Files:**
- Modify: `backend/src/cassini/api/v1/retention.py`

**Step 1: Add to trigger_purge() (line 427)**

After purge completes:

```python
    request.state.audit_context = {
        "resource_type": "retention",
        "action": "purge",
        "summary": f"Data purge completed for plant #{plant_id}: {result.total_deleted} records deleted",
        "fields": {
            "plant_id": plant_id,
            "samples_deleted": result.samples_deleted,
            "violations_deleted": result.violations_deleted,
            "total_deleted": result.total_deleted,
            "retention_days": result.retention_days,
            "triggered_by": user.username,
        },
    }
```

**Step 2: Commit**

```
feat(audit): add rich context to data purge
```

### Task 4.3: Add audit_context to CSV import confirm

**Files:**
- Modify: `backend/src/cassini/api/v1/data_entry.py`

**Step 1: Add to confirm import endpoint**

After import completes:

```python
    request.state.audit_context = {
        "resource_type": "import",
        "action": "create",
        "summary": f"CSV import confirmed: {result.rows_imported} samples for '{characteristic.name}'",
        "fields": {
            "characteristic_name": characteristic.name,
            "characteristic_id": characteristic.id,
            "rows_imported": result.rows_imported,
            "rows_failed": result.rows_failed,
            "plant_id": plant_id,
        },
    }
```

**Step 2: Commit**

```
feat(audit): add rich context to CSV import
```

---

## Wave 5: Event Bus Audit Logging

### Task 5.1: Add audit logging to notification dispatcher

**Files:**
- Modify: `backend/src/cassini/core/notifications.py`

**Step 1: Get audit_service reference**

In the NotificationDispatcher `__init__` or startup, accept `audit_service` as an optional dependency:

```python
def __init__(self, ..., audit_service=None):
    self._audit_service = audit_service
```

Or retrieve it lazily via the app state if available.

**Step 2: Add audit call to _on_violation_created()**

After dispatching notifications:

```python
    if self._audit_service and notifications_sent:
        await self._audit_service.log_event(
            action="create",
            resource_type="violation",
            resource_id=event.violation_id,
            detail={
                "summary": f"Violation detected: Rule {event.rule_id} ({event.rule_name}) — {event.severity}",
                "rule_id": event.rule_id,
                "rule_name": event.rule_name,
                "severity": event.severity,
                "characteristic_id": event.characteristic_id,
                "sample_id": event.sample_id,
            },
        )
```

**Step 3: Commit**

```
feat(audit): log violation creation and notification dispatch events
```

### Task 5.2: Add audit logging to anomaly detector

**Files:**
- Modify: `backend/src/cassini/core/anomaly/detector.py`

**Step 1: After anomaly event is detected and persisted, add audit call**

```python
    if self._audit_service:
        await self._audit_service.log_event(
            action="create",
            resource_type="anomaly",
            resource_id=anomaly_event.id,
            detail={
                "summary": f"Anomaly detected on characteristic #{event.characteristic_id}: {detector_type}",
                "detector_type": detector_type,
                "severity": anomaly_event.severity,
                "characteristic_id": event.characteristic_id,
            },
        )
```

**Step 2: Commit**

```
feat(audit): log anomaly detection events
```

---

## Wave 6: Frontend AuditLogViewer Upgrade

### Task 6.1: Add Summary column to audit table

**Files:**
- Modify: `frontend/src/components/AuditLogViewer.tsx`

**Step 1: Add Summary column header**

In the `<thead>` section, add between Action and Resource columns:

```tsx
<th className="text-muted-foreground px-3 py-2 text-xs font-semibold">Summary</th>
```

Update all `colSpan={5}` references to `colSpan={6}`.

**Step 2: Add Summary cell to ExpandableRow**

Between the Action badge and Resource cells:

```tsx
<td className="text-muted-foreground max-w-[300px] truncate px-3 py-2 text-xs">
  {(entry.detail as Record<string, unknown>)?.summary
    ? String((entry.detail as Record<string, unknown>).summary)
    : '--'}
</td>
```

**Step 3: Update DetailDisplay to exclude summary from expanded fields**

The `summary` should only show in the table column, not repeated in the expanded detail:

```tsx
const entries = Object.entries(detail).filter(
  ([k, v]) => v != null && v !== '' && k !== 'summary',
)
```

**Step 4: Add more DETAIL_KEY_LABELS**

```tsx
const DETAIL_KEY_LABELS: Record<string, string> = {
  // ... existing keys ...
  characteristic_name: 'Characteristic',
  study_name: 'Study',
  report_name: 'Report',
  part_number: 'Part Number',
  chart_type: 'Chart Type',
  ucl: 'UCL',
  centerline: 'Center Line',
  lcl: 'LCL',
  measurements: 'Measurements',
  operator_id: 'Operator',
  rule_id: 'Rule',
  rule_name: 'Rule Name',
  severity: 'Severity',
  acknowledged_by: 'Acknowledged By',
  approved_by: 'Approved By',
  submitted_by: 'Submitted By',
  rejected_by: 'Rejected By',
  target_username: 'Target User',
  assigned_by: 'Assigned By',
  revoked_by: 'Revoked By',
  deactivated_by: 'Deactivated By',
  triggered_by: 'Triggered By',
  role: 'Role',
  exclude_sample: 'Exclude Sample',
  is_excluded: 'Excluded',
  signer: 'Signer',
  rows_imported: 'Rows Imported',
  rows_failed: 'Rows Failed',
  samples_deleted: 'Samples Deleted',
  violations_deleted: 'Violations Deleted',
  total_deleted: 'Total Deleted',
  retention_days: 'Retention Days',
  grr_percent: 'GRR %',
  ndc: 'NDC',
  study_type: 'Study Type',
  detector_type: 'Detector',
  successful: 'Successful',
  failed: 'Failed',
  violation_ids: 'Violation IDs',
  body: 'Request Body',
}
```

**Step 5: Handle `body` field display (Tier 2 auto-captured)**

In `DetailDisplay`, if the field key is `body` and value is an object, render it as indented JSON:

```tsx
if (key === 'body' && typeof value === 'object' && value !== null) {
  return (
    <div key={key} className="contents">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <pre className="text-foreground max-w-md overflow-x-auto font-mono text-xs whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
```

**Step 6: Run type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```
feat(audit): add Summary column and rich detail display to AuditLogViewer
```

---

## Wave 7: Final Verification

### Task 7.1: End-to-end verification

**Step 1: Start backend and frontend**

**Step 2: Perform test actions and check audit log:**
- Sign an MSA study → verify summary shows study name, meaning, workflow step
- Acknowledge a violation → verify summary shows characteristic name and reason
- Submit a sample → verify summary shows characteristic name and measurements
- Create a user → verify summary shows username
- Recalculate control limits → verify summary shows characteristic name and new limits
- Perform a simple CRUD (create plant) → verify Tier 2 auto-captures sanitized body

**Step 3: Commit any fixes**

---

## Summary

| Wave | Scope | Endpoints |
|------|-------|-----------|
| 1 | Middleware upgrade | 1 file — body capture + audit_context merging |
| 2 | Regulated workflows | 7 endpoints — signatures (2), FAI (3), MSA (2) |
| 3 | Data operations | 7 endpoints — violations (2), samples (4), control limits (2) |
| 4 | Admin operations | 6 endpoints — users (4), retention (1), import (1) |
| 5 | Event bus | 2 subscribers — notifications, anomaly detector |
| 6 | Frontend | 1 component — AuditLogViewer summary column + detail display |
| 7 | Verification | Manual E2E testing |
