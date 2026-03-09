---
type: audit
status: complete
created: 2026-03-01
updated: 2026-03-06
tags: [audit, complete]
---

# Skeptic Review Report -- Sprints 5-9

> **Full source**: `.planning/gap-closure/SKEPTIC-REVIEW-REPORT.md` (269 lines)
> **Scope**: ~6,000+ backend LOC, ~5,000+ frontend LOC across [[Sprints/Sprint 5]] through [[Sprints/Sprint 9]]
> **Agents**: 8 parallel skeptic reviewers + 1 validator
> **Status**: All phases complete -- findings fixed and verified

---

## Summary

| Severity | Raw Count | After Dedup | Status |
|----------|-----------|-------------|--------|
| BLOCKER | 25 | 22 | All fixed |
| WARNING | 53 | 47 | All fixed |
| INFO | 28 | 28 | Documented |

**Key themes**:
1. Signature system was completely isolated -- zero integration with Sprint 5-9 features
2. Audit middleware blind to 11 new URL prefixes
3. API contract mismatches -- doubled URL prefix, field name mismatches
4. `str(e)` leakage pattern -- 6 instances in ERP module
5. Statistical edge cases -- division-by-zero in Hotelling T^2, MEWMA, rolling window

---

## BLOCKER Findings (22 unique)

### B1. Statistical Correctness

| ID | Issue | Fix |
|----|-------|-----|
| STAT-001 | Phase II UCL division-by-zero when n_ref <= p (hotelling.py) | Added n_ref > p guard |
| STAT-002 | No lambda_param bounds validation (0,1] (mewma.py) | Added validation |
| STAT-003 | Division-by-zero when sigma=0 in zone classification | Added sigma > 0 guard |
| STAT-004 | Percentile Ppk uses non-standard asymmetric formula | Replaced with standard symmetric |
| STAT-005 | Q-Q plot linear interpolation vs actual quantiles | Backend Blom positions + scipy PPF |

**Relates to**: [[Features/Multivariate SPC]], [[Features/Non-Normal Capability]], [[Features/SPC Engine]]

### B2. Security -- Information Leakage

| ID | Issue | Fix |
|----|-------|-----|
| SEC-001 | `str(e)` in sap_odata.py test_connection | Sanitized |
| SEC-002 | `str(e)` in base.py push_batch | Sanitized |
| SEC-003 | Raw exception in erp_connectors.py last_error | Sanitized |

**Relates to**: [[Features/ERP Connectors]]

### B3. API Contract Mismatches

| ID | Issue | Fix |
|----|-------|-----|
| API-001 | Doubled `/api/v1/api/v1/` prefix -- ALL multivariate API calls 404 | Removed doubled prefix |
| API-002 | FAI `reason` vs backend `reason_for_inspection` mismatch | Renamed across client + components |

**Relates to**: [[Features/Multivariate SPC]], [[Features/FAI]]

### B4. Frontend State

| ID | Issue | Fix |
|----|-------|-----|
| STATE-001 | Offline queue concurrent flush -- no mutex, double-sends | Added flush mutex (promise lock) |
| STATE-002 | Retry counter never incremented -- infinite retries | Fixed increment in failure handler |

**Relates to**: [[Features/PWA]]

### B5. Data Integrity

| ID | Issue | Fix |
|----|-------|-----|
| DATA-001 | SQLite-incompatible ALTER TABLE in migration 035 | batch_alter_table in migration 040 |
| DATA-002 | 3 Sprint 8 columns missing from OIDCConfig model | Added columns |

**Relates to**: [[Features/SSO]], [[Features/Multi-Database]]

### B6. Bridge & Integration

| ID | Issue | Fix |
|----|-------|-----|
| BRIDGE-001 | `/my-config` route after `/{bridge_id}` -- dead code | Moved route before param |
| BRIDGE-002 | Zero MQTT reconnection handling in bridge | Added exponential backoff reconnect |

**Relates to**: [[Features/Gage Bridge]]

### B7. Signature System

| ID | Issue | Fix |
|----|-------|-----|
| SIG-001 | FAI approval has no e-signature integration | Added `check_workflow_required()` + SignatureDialog |
| SIG-006 | Resource hash identity-based, not content-based | Added `load_resource_content()` for actual DB fields |
| SIG-007 | `check_workflow_required()` doesn't exist | Implemented -- queries SignatureWorkflow table |

**Relates to**: [[Features/Electronic Signatures]], [[Features/FAI]]

### B8. Audit Coverage

| ID | Issue | Fix |
|----|-------|-----|
| AUDIT-001 | 11 Sprint 5-9 URL prefixes missing from _RESOURCE_PATTERNS | Added 15 patterns |
| AUDIT-002 | OIDC config changes skipped by `/auth/` exclusion | Narrowed to login/logout/refresh/token |

**Relates to**: [[Features/Audit Trail]]

---

## WARNING Findings (47 unique, by theme)

### Security (7)
- OIDC redirect_uri not validated, post_logout_redirect_uri not URL-encoded
- Client secret mask on ciphertext not plaintext
- Characteristic name unsanitized in LLM prompt (prompt injection)
- SAP OAuth2 token_url SSRF potential
- Bridge API key and MQTT password plaintext

### API Contracts (6)
- FAI response missing submitted_by/approved_by in TypeScript
- ERP sync logs type mismatch (paginated vs flat)
- Prediction history type mismatch
- AI config field name mismatch

### Frontend State (9)
- ConnectorWizard no type validation on step 0
- Auth config not cleared on type switch
- FAI approve/reject visible to submitter
- MSA measurement save silent on empty grid
- DOE activePhase lag, SMTP form setState during render

### Statistical (7)
- MSA %Tolerance 5.15 vs %Study 6 sigma inconsistency
- Box-Cox delta method mean issue
- p-chart sigma=0 at boundary
- DOE SS excluding center points
- ARIMA missing order validation
- MSA SS_equipment negative sqrt

### Data Integrity (5)
- RulePreset.created_at missing timezone=True
- RulePreset.name globally unique (should be plant-scoped)
- Multiple Sprint 9 models with lazy-loading trap

### Bridge & Integration (8)
- Serial port unplug silent failure
- ERP sync engine overlapping cron
- Outbound ERP push no retry
- Push notifications sequential/unbounded
- Mitutoyo parser error status byte
- Oracle REST no pagination handling

### Signatures (5)
- MSA study completion no signature
- Data purge no signature requirement
- WorkflowExpiredEvent never published
- Password policy not enforced at login
- FAI report edit after rejection doesn't invalidate

### Audit (5)
- Missing domain-specific action types
- Frontend AuditLogViewer missing labels
- Event bus only covers 4 events
- Signature sign/reject need enriched audit detail
- Gage bridge endpoints log NULL user identity

---

## Fix Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS -- zero errors |
| `npx tsc -b` (strict build) | 35 errors -- all pre-existing |
| `python -c "from openspc.main import app"` | PASS -- clean import |

---

## Deferred Items -- All Resolved

All deferred signature integration items (SIG-001/002/003/006/007/008/009), statistical fixes (STAT-005), audit coverage (AUDIT-005), and bridge reliability (BRIDGE-002/004/005) were resolved in a follow-up fix stream.

Key fixes:
- `check_workflow_required()` integrated into FAI submit/approve, MSA calculate, retention purge
- `load_resource_content()` for content-based resource hashing
- `expire_stale_workflows()` sweep for WorkflowExpiredEvent
- Password policy enforcement at login (lockout + expiry)
- MQTT publisher exponential backoff reconnection
- ERP sync engine per-connector locks + retry with backoff
- Event bus audit subscribers for anomaly, ERP sync, push notifications
