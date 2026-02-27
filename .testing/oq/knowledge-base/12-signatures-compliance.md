# Feature: Electronic Signatures & 21 CFR Part 11 Compliance

## Category: SIG
## Config Reference: `{ prefix: "SIG", name: "Electronic Signatures", kb: "12-signatures-compliance.md" }`

---

## What It Does

Electronic signatures provide tamper-evident, non-repudiable records of who approved what and when. The system implements the requirements of 21 CFR Part 11 for electronic records in FDA-regulated industries (pharmaceuticals, medical devices), while also supporting ISO 13485 (medical device QMS), AS9100 (aerospace), IATF 16949 (automotive), and GMP (Good Manufacturing Practice) requirements.

In a quality management system, electronic signatures serve four purposes:

1. **Identity assurance** -- Every signature requires the signer to re-authenticate with their password. This proves the person signing is who they claim to be, not just someone with access to an unlocked workstation.
2. **Intent capture** -- Each signature includes a "meaning" (e.g., "Authored", "Reviewed", "Approved", "Verified") that records the signer's intent. The meaning is selected by the signer at sign time, creating a record of why they signed.
3. **Tamper detection** -- At the moment of signing, a SHA-256 hash of the resource content is computed and stored alongside the signature. If the resource is modified after signing, the hash no longer matches, and the system reports a tamper indicator. This is the digital equivalent of a sealed wax stamp.
4. **Workflow enforcement** -- Multi-step approval workflows ensure that the correct sequence of reviews and approvals occurs. For example, an FAI report must be reviewed by an engineer before it can be approved by an admin. The system blocks out-of-order signing and enforces role requirements at each step.

From a compliance perspective:

- **21 CFR Part 11** (FDA) -- Requires that electronic signatures be legally equivalent to handwritten signatures. Each signature must include a unique user identifier, the printed name of the signer, the date/time of the signature, and the meaning of the signature (review, approval, responsibility). The system must detect unauthorized record modification (tamper detection via SHA-256 hashing).
- **ISO 13485:2016 Section 4.2.5** -- Control of documents. Approval and review records must be maintained with traceability.
- **IATF 16949** -- Requires controlled approval processes for quality records, with documented evidence of review and authorization at appropriate levels.
- **AS9100/AS9102** -- Separation of duties for first article inspection (submitter cannot be the sole approver).
- **GMP** -- Requires attribution, timestamp, and meaning for all approvals in the manufacturing record.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Signature settings overview | `/settings/signatures` | Engineer | Hub page with sub-sections for workflows, meanings, policies, pending |
| Workflow configuration | `/settings/signatures` > Workflow Config | Engineer | Create/edit/delete signature workflows and their steps |
| Signature meanings | `/settings/signatures` > Meanings | Admin | CRUD for signature meaning labels (Authored, Reviewed, Approved, etc.) |
| Password policy | `/settings/signatures` > Password Policy | Admin | Complexity, expiry, lockout, history settings |
| Pending approvals | `/settings/signatures` > Pending Approvals | Operator | Dashboard of items awaiting the current user's signature |
| Signature dialog | Inline in approval workflows | Operator | Modal dialog that appears when user clicks a sign/approve button |
| Signature history | Inline on signed resources | Supervisor | List of all signatures attached to a specific resource |
| Signature verification | Inline on signature records | Any auth | Badge showing whether a signature's hash still matches the resource |

---

## Key Concepts (Six Sigma Context)

### 21 CFR Part 11 -- The Regulatory Foundation

21 CFR Part 11 is the FDA regulation governing electronic records and electronic signatures. It establishes that electronic signatures are legally equivalent to handwritten signatures when certain controls are in place. Cassini implements the following Part 11 controls:

| Part 11 Requirement | Cassini Implementation |
|---|---|
| Unique user identification | Username + password re-entry at every signature |
| Printed name of signer | `username` and `full_name` recorded on signature record |
| Date and time | `timestamp` in UTC, stored at signing moment |
| Meaning of signature | Configurable meaning codes (e.g., "reviewed", "approved") |
| Signature/record linking | `resource_type` + `resource_id` bind signature to its record |
| Tamper detection | SHA-256 hash of resource content at sign time; verified on demand |
| Authority controls | Role-based step requirements (engineer, admin) enforced per workflow |
| Separation of duties | Workflow steps can require different users/roles; `allow_self_sign` flag controls |
| Audit trail | All signature events logged to audit trail via event bus |

### Signature Types

#### Standalone Signatures

A standalone signature is a single-user sign-off on a specific action or resource. It does not belong to a multi-step workflow. Use cases:

- Signing a capability snapshot to confirm the analysis was reviewed
- Signing a configuration change to record who authorized it
- Signing a data export to confirm the data was validated

The signer enters their password, selects a meaning, and optionally adds a comment. The system creates a signature record with a SHA-256 hash of the resource content.

#### Workflow-Based Signatures

A workflow signature is part of a multi-step approval chain. Each workflow has an ordered sequence of steps, each requiring a specific role level. Use cases:

- **FAI approval**: Step 1 = Engineer reviews (meaning: "Reviewed"), Step 2 = Admin approves (meaning: "Approved")
- **Data purge**: Step 1 = Engineer requests, Step 2 = Admin authorizes
- **MSA study sign-off**: Step 1 = Analyst reviews, Step 2 = Quality Manager approves

Workflows progress in order. Step 2 cannot be signed until Step 1 is complete. If any step is rejected, the entire workflow is rejected. Workflows can have an optional expiration (`timeout_hours` per step, `expires_at` on the instance).

### SHA-256 Content Hashing

When a signature is executed, the system computes a SHA-256 hash of the resource's content. The hash is not merely of the resource type + ID -- it includes actual data fields. For example:

- **FAI report hash**: Includes `status`, `part_number`, item count, and each item's `characteristic_name`, `requirement`, `actual_result`, and `conformance`
- **Capability snapshot hash**: Includes the computed capability values
- **Unknown resource types**: Falls back to hashing `resource_type` + `resource_id` (less secure but allows signing any resource)

Verification compares the stored hash against a freshly computed hash of the current resource state. If they differ, the resource has been modified after signing.

### Signature Meanings

Meanings are configurable per plant. Common meanings in regulated environments:

| Code | Display Name | Regulatory Significance |
|---|---|---|
| `authored` | Authored | Creator of the record |
| `reviewed` | Reviewed | Technical review completed |
| `approved` | Approved | Management authorization granted |
| `verified` | Verified | Independent verification completed |
| `rejected` | Rejected | Record requires rework (workflow rejection uses a separate mechanism) |

Each meaning has a `requires_comment` flag. When set, the signer must provide a comment (useful for conditional approvals or rejections).

### Password Policies

Password policies are configured per plant and govern:

| Policy | Field | Default | Description |
|---|---|---|---|
| Minimum length | `min_password_length` | 8 | Range: 4-128 characters |
| Require uppercase | `require_uppercase` | false | At least one uppercase letter |
| Require lowercase | `require_lowercase` | false | At least one lowercase letter |
| Require digit | `require_digit` | false | At least one number |
| Require special character | `require_special` | false | At least one special character |
| Password expiry | `password_expiry_days` | 0 | Days before password must be changed (0 = never) |
| Max failed attempts | `max_failed_attempts` | 5 | Consecutive failures before lockout |
| Lockout duration | `lockout_duration_minutes` | 30 | Minutes the account is locked |
| Password history | `password_history_count` | 0 | Number of previous passwords that cannot be reused (0 = no history check) |
| Session timeout | `session_timeout_minutes` | 60 | Idle session expiry |
| Signature timeout | `signature_timeout_minutes` | 5 | Time window in which signature dialog must be completed |

### Pending Approvals

The Pending Approvals dashboard shows all workflow instances where the current step requires the logged-in user's role. Each pending item displays:

- Workflow name and resource type
- Current step name and step number (e.g., "Step 2 of 3")
- Who initiated the workflow and when
- Previous signatures already collected on the workflow
- Expiration time (if set)

---

## How To Configure (Step-by-Step)

### Creating a Workflow Template (Engineer+)

1. Navigate to `/settings/signatures`.
2. Go to the **Workflow Config** section.
3. Click **Create Workflow** (or "Add Workflow").
4. Fill in:
   - **Name**: A descriptive name (e.g., "FAI Approval Flow")
   - **Resource Type**: The type of resource this workflow applies to (e.g., `fai_report`, `capability_snapshot`, `data_purge`)
   - **Is Required**: If checked, actions on this resource type cannot proceed without completing the workflow
   - **Description**: Optional description of the workflow's purpose
5. Click **Save**. The workflow is created with no steps.

### Adding Steps to a Workflow (Engineer+)

1. In the Workflow Config section, click on the workflow to expand it.
2. Click **Add Step**.
3. Fill in:
   - **Step Order**: The numeric position (1, 2, 3, ...). Steps execute in order.
   - **Name**: Descriptive name (e.g., "Engineer Review", "Manager Approval")
   - **Minimum Role**: The minimum role required to sign this step (`operator`, `supervisor`, `engineer`, `admin`)
   - **Meaning Code**: The default meaning for this step (e.g., `reviewed`, `approved`)
   - **Is Required**: Whether this step can be skipped
   - **Allow Self-Sign**: Whether the initiator can sign this step (disable for separation of duties)
   - **Timeout Hours**: Optional time limit for completing this step
4. Click **Save**. Repeat for each step.

### Configuring Signature Meanings (Admin)

1. Navigate to `/settings/signatures` > **Meanings** section.
2. Click **Add Meaning**.
3. Fill in:
   - **Code**: Machine-readable identifier (e.g., `validated`). Must be unique within the plant.
   - **Display Name**: Human-readable label (e.g., "Validated")
   - **Description**: What this meaning represents in your quality system
   - **Requires Comment**: Whether the signer must provide a comment when using this meaning
   - **Sort Order**: Display ordering (lower numbers first)
4. Click **Save**.

### Setting Password Policies (Admin)

1. Navigate to `/settings/signatures` > **Password Policy** section.
2. Configure the desired policy fields (complexity, expiry, lockout, history).
3. Click **Save**. Changes take effect immediately for new password changes and login attempts.

---

## How To Use (Typical Workflow)

### Standalone Signature Flow

1. Perform an action that supports electronic signatures (e.g., save a capability snapshot).
2. The **SignatureDialog** modal appears (or a "Sign" button is available).
3. Enter your current password in the password field.
4. Select a meaning from the dropdown (e.g., "Reviewed").
5. Optionally enter a comment.
6. Click **Sign**.
7. The system verifies your password, computes a SHA-256 hash of the resource, creates the signature record, and returns confirmation.
8. The resource now shows a signature badge indicating it has been signed.

### Workflow Approval Flow

1. A user initiates a workflow (e.g., submitting an FAI report triggers the "FAI Approval Flow").
2. The workflow instance is created in "pending" status at Step 1.
3. Users with the required role for Step 1 see the item in their **Pending Approvals** dashboard.
4. The Step 1 reviewer navigates to Pending Approvals, selects the item.
5. The **SignatureDialog** opens. The reviewer enters their password, selects a meaning, and clicks **Sign**.
6. Step 1 is marked complete. The workflow advances to Step 2.
7. Users with the Step 2 role now see the item in their Pending Approvals.
8. Repeat until all steps are complete. The workflow status changes to "completed".

### Rejecting a Workflow Step

1. A user with the required role opens a pending approval item.
2. Instead of signing, they click **Reject**.
3. The **RejectDialog** opens. They enter their password and a reason for rejection.
4. The workflow is marked as "rejected". No further steps can be signed.
5. The initiator is notified (via the event bus / notifications system).

### Viewing Signature History

1. Navigate to a resource that has been signed (e.g., an FAI report detail page).
2. The **SignatureHistory** component shows all signatures attached to the resource.
3. Each entry shows: signer name, timestamp, meaning, and a verification badge.
4. Click the verification badge to trigger hash verification -- the system recomputes the hash and compares it to the stored hash.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Standalone signature records signer, timestamp, meaning, and SHA-256 hash | API: POST /signatures/sign returns signature_id, signer_name, timestamp, meaning, resource_hash, signature_hash |
| 2 | Wrong password is rejected with a clear error message | API: POST /signatures/sign with incorrect password returns 401/403 |
| 3 | Workflow creation succeeds with name, resource_type, and steps | API: POST /signatures/workflows + POST /signatures/workflows/{id}/steps returns valid records |
| 4 | Multi-step workflow advances correctly through steps | Sign Step 1, verify Step 2 becomes pending, sign Step 2, verify workflow "completed" |
| 5 | Workflow rejection records the reason and stops the workflow | POST /signatures/reject with reason, verify workflow status = "rejected" |
| 6 | Pending approvals shows items for the current user's role | GET /signatures/pending returns items where current step requires user's role |
| 7 | Signature history shows all signatures for a resource | GET /signatures/resource/{type}/{id} returns complete list |
| 8 | SHA-256 hash verification detects unmodified resources | GET /signatures/verify/{id} returns hash_match: true when resource unchanged |
| 9 | Signature meanings CRUD works (create, read, update, deactivate) | Full lifecycle via /signatures/meanings endpoints |
| 10 | Password policy is enforced (complexity, expiry, lockout) | Configure policy, attempt violating change, verify rejection |
| 11 | Deactivated meanings cannot be used for new signatures | Deactivate a meaning, attempt to sign with it, verify failure |
| 12 | Workflow steps enforce minimum role requirements | Attempt to sign a step requiring admin role with an engineer account, verify rejection |
| 13 | Signature audit trail entries are created | Check audit log for signature-related events |
| 14 | Concurrent workflow instances for different resources work independently | Create two instances of the same workflow, sign one, verify other is unaffected |

---

## Edge Cases & Constraints

- **Cannot sign with another user's credentials** -- The password verification uses the current authenticated user's password hash. Even if someone knows another user's password, the signature is always attributed to the authenticated session user.
- **Expired passwords require change before signing** -- If `must_change_password` is true on the user account (due to password expiry), the user is redirected to `/change-password` before any route, including signature dialogs.
- **Deactivated users cannot sign** -- The `is_active` flag on the user account is checked during signature execution. Deactivated users receive 401/403.
- **Duplicate workflow per resource type** -- Only one workflow can exist per `(plant_id, resource_type)` combination. Attempting to create a second returns HTTP 409 Conflict.
- **Workflow expiration** -- Workflow instances can expire based on step `timeout_hours`. Expired workflows cannot be signed.
- **Meaning soft-delete** -- Deleting a meaning sets `is_active=false` rather than removing the record, preserving referential integrity with existing signatures.
- **Separation of duties** -- When `allow_self_sign=false` on a step, the workflow initiator cannot sign that step. This supports AS9102 requirements for FAI approval.
- **Hash verification for unknown resource types** -- Resources without a dedicated `load_resource_content` handler fall back to hashing `resource_type:resource_id`, which provides attribution but weaker tamper detection.
- **Plant-scoped roles** -- Workflow step role checks use the user's role at the specific plant. An admin at Plant A is not necessarily an admin at Plant B.
- **Signature chain validity** -- The `signature_chain_valid` field in the verify response checks that all signatures in the workflow instance are valid, not just the individual signature.

---

## API Reference (for seeding)

All paths below are relative to the API base (`/api/v1/`). The `fetchApi` client in the frontend prepends this prefix automatically. Most endpoints require a `plant_id` query parameter.

### Core Signing

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/signatures/sign?plant_id={id}` | Operator+ | Execute a signature (standalone or workflow). Body: `SignRequest` |
| `POST` | `/signatures/reject?plant_id={id}` | Operator+ | Reject a workflow step. Body: `RejectRequest` |
| `GET` | `/signatures/pending?plant_id={id}` | Operator+ | Get pending workflow items for current user |
| `GET` | `/signatures/history?plant_id={id}` | Supervisor+ | Get signature history with filters |
| `GET` | `/signatures/resource/{type}/{id}` | Any auth | Get all signatures for a specific resource |
| `GET` | `/signatures/verify/{signature_id}` | Any auth | Verify a signature's hash integrity |

### Workflow Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/signatures/workflows?plant_id={id}` | Engineer+ | List workflows for a plant |
| `POST` | `/signatures/workflows?plant_id={id}` | Engineer+ | Create workflow. Body: `WorkflowCreate` |
| `PUT` | `/signatures/workflows/{id}?plant_id={id}` | Engineer+ | Update workflow. Body: `WorkflowUpdate` |
| `DELETE` | `/signatures/workflows/{id}?plant_id={id}` | Engineer+ | Delete a workflow |
| `GET` | `/signatures/workflows/{id}/steps?plant_id={id}` | Engineer+ | List steps for a workflow |
| `POST` | `/signatures/workflows/{id}/steps?plant_id={id}` | Engineer+ | Add step. Body: `StepCreate` |
| `PUT` | `/signatures/workflows/steps/{id}?plant_id={id}` | Engineer+ | Update step. Body: `StepUpdate` |
| `DELETE` | `/signatures/workflows/steps/{id}?plant_id={id}` | Engineer+ | Delete a step |

### Signature Meanings

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/signatures/meanings?plant_id={id}` | Admin | List meanings for a plant |
| `POST` | `/signatures/meanings?plant_id={id}` | Admin | Create meaning. Body: `MeaningCreate` |
| `PUT` | `/signatures/meanings/{id}?plant_id={id}` | Admin | Update meaning. Body: `MeaningUpdate` |
| `DELETE` | `/signatures/meanings/{id}?plant_id={id}` | Admin | Soft-delete (deactivate) a meaning |

### Password Policy

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/signatures/password-policy?plant_id={id}` | Admin | Get password policy for a plant |
| `PUT` | `/signatures/password-policy?plant_id={id}` | Admin | Create or update password policy. Body: `PasswordPolicyUpdate` |

### Request/Response Schemas

**SignRequest**: `{ resource_type: string, resource_id: int, password: string, meaning_code: string, comment?: string, workflow_instance_id?: int }`

**RejectRequest**: `{ workflow_instance_id: int, password: string, reason: string }`

**SignResponse**: `{ signature_id: int, signer_name: string, full_name?: string, timestamp: datetime, meaning: string, resource_hash: string, signature_hash: string, workflow_status?: string, workflow_step?: string }`

**VerifyResponse**: `{ signature_id: int, is_valid: bool, signer_name: string, full_name?: string, timestamp: datetime, meaning: string, resource_type: string, resource_id: int, stored_hash: string, current_hash?: string, hash_match: bool, signature_chain_valid: bool }`

**WorkflowCreate**: `{ name: string, resource_type: string, is_active?: bool, is_required?: bool, description?: string }`

**StepCreate**: `{ step_order: int, name: string, min_role: string, meaning_code: string, is_required?: bool, allow_self_sign?: bool, timeout_hours?: int }`

**MeaningCreate**: `{ code: string, display_name: string, description?: string, requires_comment?: bool, sort_order?: int }`

**PasswordPolicyUpdate**: `{ min_password_length?: int, require_uppercase?: bool, require_lowercase?: bool, require_digit?: bool, require_special?: bool, password_expiry_days?: int, max_failed_attempts?: int, lockout_duration_minutes?: int, password_history_count?: int, session_timeout_minutes?: int, signature_timeout_minutes?: int }`

### Seeding Example

```bash
# 1. Create a signature meaning
curl -X POST "$API/signatures/meanings?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "reviewed", "display_name": "Reviewed", "description": "Technical review completed", "requires_comment": false, "sort_order": 1}'

# 2. Create a second meaning
curl -X POST "$API/signatures/meanings?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "approved", "display_name": "Approved", "description": "Management authorization", "requires_comment": false, "sort_order": 2}'

# 3. Create a workflow
curl -X POST "$API/signatures/workflows?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "OQ-Approval-Flow", "resource_type": "fai_report", "is_active": true, "is_required": true}'

# 4. Add Step 1 (Engineer Review)
curl -X POST "$API/signatures/workflows/$WF_ID/steps?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"step_order": 1, "name": "Engineer Review", "min_role": "engineer", "meaning_code": "reviewed"}'

# 5. Add Step 2 (Admin Approval)
curl -X POST "$API/signatures/workflows/$WF_ID/steps?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"step_order": 2, "name": "Admin Approval", "min_role": "admin", "meaning_code": "approved"}'

# 6. Execute a standalone signature
curl -X POST "$API/signatures/sign?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resource_type": "capability_snapshot", "resource_id": 1, "password": "admin", "meaning_code": "reviewed"}'

# 7. Verify the signature
curl -X GET "$API/signatures/verify/$SIG_ID" \
  -H "Authorization: Bearer $TOKEN"

# 8. Set password policy
curl -X PUT "$API/signatures/password-policy?plant_id=$PLANT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"min_password_length": 8, "require_uppercase": true, "require_digit": true, "require_special": true, "password_expiry_days": 90, "max_failed_attempts": 5, "lockout_duration_minutes": 30, "password_history_count": 5}'
```
