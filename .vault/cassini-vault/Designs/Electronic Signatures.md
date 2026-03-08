---
type: design
status: complete
created: 2026-02-13
updated: 2026-03-06
sprint: "[[Sprints/Sprint 4 - Wave 4]]"
tags: [design, complete]
---

# Electronic Signatures (21 CFR Part 11)

Full-stack design for electronic signatures enabling FDA/pharma regulatory compliance. Implements 21 CFR Part 11 requirements for a closed system (Subpart B Section 11.10).

## Problem Statement

Regulated industries (FDA, pharma, medical devices) require electronic signatures that are legally equivalent to handwritten signatures. Cassini needs: signature capture with manifestation data, password re-entry at signing time, cryptographic record-signature binding, configurable multi-step workflows, and password expiry/lockout policies.

## Regulatory Mapping

| CFR Section | Requirement | Solution |
|---|---|---|
| 11.10(e) | Secure audit trails | AuditMiddleware + signature audit entries |
| 11.10(f) | Operational sequence enforcement | Workflow state machine |
| 11.50 | Signature manifestations | Name, date/time, meaning captured per signature |
| 11.70 | Signature/record linking | SHA-256 hash permanently binds signature to record content |
| 11.200 | Two-component signatures | Username + password re-entry at signing time |
| 11.300 | ID/password controls | Password expiry, lockout, history, complexity |

## Data Model (Migration 031)

### 6 New Tables

- **`electronic_signature`**: Core immutable record -- user, timestamp, meaning, resource link, content hash, signature hash (SHA-256 of user+time+meaning+content), validity flag
- **`signature_meaning`**: Configurable vocabulary per plant (approved, reviewed, verified, rejected, released)
- **`signature_workflow`**: Defines what actions require signatures (sample approval, limit change, report release)
- **`signature_workflow_step`**: Ordered steps within a workflow (min role, meaning code, self-sign control, timeout)
- **`signature_workflow_instance`**: Running instance for a specific resource (status: pending -> in_progress -> completed/rejected/expired)
- **`password_policy`**: Per-plant password policy (expiry days, failed attempts lockout, min length, complexity rules, history count, session/signature timeouts)

### User Table Extensions

+`full_name`, +`password_changed_at`, +`failed_login_count`, +`locked_until`, +`password_history`, +`last_signature_auth_at`

## Key Design Decisions

- **Denormalized `username`/`full_name`** on signature records so they remain readable even if user is deleted (ALCOA: attributable)
- **`resource_hash`** = SHA-256 of record's signable content at signing time; if record changes, signature invalidated
- **`signature_hash`** = SHA-256(user_id + timestamp + meaning + resource_hash) for tamper detection (11.70)
- **Content hashes include actual content**, not just type+id (per CLAUDE.md cross-cutting requirement)

## Workflow State Machine

```
PENDING -> IN_PROGRESS -> COMPLETED
                       -> REJECTED
                       -> EXPIRED (timeout)
```

### Signable Actions

| Resource Type | Default Steps |
|---|---|
| Sample approval | Operator Review -> Supervisor Approval |
| Limit change | Engineer Proposal -> Supervisor Approval |
| Config change | Engineer Change -> Supervisor Approval |
| Report release | Reviewer -> Approver |
| Violation disposition | Supervisor Review |

## Workflow Engine (`core/signature_engine.py`)

- `SignatureWorkflowEngine`: SHA-256 hashing, sign/reject/verify operations
- `initiate_workflow()` + `sign()` for regulatory-required workflows (blocks if `check_workflow_required()` returns True)
- `sign_standalone()` for optional workflows (configurable per plant)
- `invalidate_signatures_for_resource()` on resource modification after signing

## API: 20 Endpoints

Signatures (sign, verify, list, standalone-sign), workflows (CRUD, initiate, status), meanings (CRUD), password policy (get/update), pending approvals dashboard.

## Frontend Components

- **`SignatureDialog`**: Modal for password re-entry + meaning selection + optional comment. Embedded in approval buttons per cross-cutting requirement.
- **`PendingApprovalsDashboard`**: Lists all pending workflow instances for current user
- **`WorkflowConfig`**: Admin UI for configuring workflows per plant
- **`MeaningManager`**: Admin UI for signature meaning vocabulary
- **`PasswordPolicySettings`**: Admin UI for password policy configuration
- **Settings tab**: Integrated into Settings page
