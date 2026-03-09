---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 4 - Wave 4]]"
tags:
  - feature
  - active
aliases:
  - Signatures
  - Digital Signatures
---

# Electronic Signatures

21 CFR Part 11 compliant electronic signature system. Supports multi-step approval workflows with configurable meaning codes, role-based signing authority, SHA-256 resource hashing, and signature invalidation on resource modification. Includes standalone signing for optional workflows and password policy enforcement (expiry, lockout, history).

## Key Backend Components

- **Engine**: `core/signature_engine.py` -- `SignatureWorkflowEngine` with `sign()`, `sign_standalone()`, `verify()`, `initiate_workflow()`, `check_workflow_required()`, `invalidate_signatures_for_resource()`
- **Models**: `ElectronicSignature`, `SignatureMeaning`, `SignatureWorkflow`, `SignatureWorkflowStep`, `SignatureWorkflowInstance`, `PasswordPolicy` in `db/models/signature.py`
- **Router**: `api/v1/signatures.py` -- 20 endpoints (sign, verify, workflows, meanings, password policy, invalidate)
- **Repositories**: `db/repositories/signature.py`, `db/repositories/workflow.py`
- **Migration**: 031 (6 tables + user columns for Part 11)

## Key Frontend Components

- `SignatureDialog.tsx` -- embedded in approval buttons for password re-authentication
- `PendingApprovalsDashboard.tsx` -- list of pending workflow instances
- `WorkflowConfig.tsx`, `WorkflowStepEditor.tsx` -- admin workflow configuration
- `MeaningManager.tsx` -- signature meaning code management
- `PasswordPolicySettings.tsx` -- plant-scoped password policy
- `SignatureHistory.tsx`, `SignatureVerifyBadge.tsx`, `WorkflowProgress.tsx`
- Hooks: `useSign`, `usePendingWorkflows`, `useWorkflows`, `useMeanings`, `usePasswordPolicy`

## Connections

- Used by [[FAI]] approval workflow (required: approver != submitter)
- Used by [[MSA]] study sign-off (optional per plant)
- Integrable with [[Records Retention]] purge authorization
- Resource hashing must include actual content, not just type+id
- Password policy extends [[Auth]] user model (failed_login_count, locked_until, password_history)

## Known Limitations

- Resource hash must include actual content (SHA-256 of serialized resource data), not just type+id
- Signature re-auth timeout configurable per-plant via `signature_timeout_minutes`
- Workflow steps execute in `step_order` sequence; `current_step` tracks progress
