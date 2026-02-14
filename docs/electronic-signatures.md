# Electronic Signatures (21 CFR Part 11)

OpenSPC implements configurable electronic signature workflows designed to meet
the intent of FDA 21 CFR Part 11. This document covers architecture, setup,
signing flows, tamper detection, and the full API surface.

---

## 1. Overview -- 21 CFR Part 11 Mapping

The FDA's 21 CFR Part 11 regulation establishes requirements for electronic
records and electronic signatures. OpenSPC addresses each core requirement:

| Part 11 Requirement | OpenSPC Implementation |
|---|---|
| **Closed system controls** (11.10) | Role-based access with four-tier hierarchy (Operator, Supervisor, Engineer, Admin). Plant-scoped data isolation. JWT + httpOnly refresh cookies. |
| **Electronic records** (11.10) | Immutable signature records with SHA-256 resource hash and signature chain hash. All records timestamped in UTC. |
| **Electronic signatures** (11.50) | Each signature captures signer identity, timestamp, and a configurable meaning (e.g., "Approved", "Reviewed"). |
| **Signature/record linking** (11.70) | SHA-256 resource hash binds the signature to the exact record state at signing time. Tampering is detectable via hash recomputation. |
| **Signature components** (11.200) | Password re-authentication required for every signature. Username + password constitute the two components. |
| **Controls for identification codes/passwords** (11.300) | Configurable password policies: expiry, complexity, lockout, history, session timeout, and signature timeout. |
| **Audit trails** (11.10(e)) | Every signature event is published to the Event Bus. The AuditMiddleware logs all API mutations. The AuditLogViewer provides CSV export. |

---

## 2. Quick Start with the FDA Demo

The fastest way to explore electronic signatures is the pre-seeded demo database.

```bash
# From the repository root
cd backend
python -m venv .venv && .venv/Scripts/activate
pip install -e .
alembic upgrade head

# Seed the FDA demo data
python scripts/seed_fda_demo.py --db openspc.db
```

This creates a PharmaCorp plant with pre-configured workflows, meanings, and
demo users.

**Step-by-step walkthrough:**

1. Start the backend and frontend servers.
2. Log in as `dr.chen` (password: `QaDirector2026!`).
3. Navigate to **Settings > Signatures**.
4. Explore the pre-configured **Sample Approval** workflow (two-step: Review then Approval).
5. Go to the **Pending Approvals** dashboard to see workflows awaiting signature.
6. Click **Sign** on a pending item -- the Signature Dialog opens.
7. Select a meaning, re-enter your password, optionally add a comment, and confirm.
8. The workflow advances to the next step (or completes if it was the final step).
9. Navigate to **Settings > Signatures > History** to see the immutable record.

---

## 3. Core Concepts

### 3.1 Conceptual Model

```
   Meaning            Workflow            Step               Signature
 +-----------+    +--------------+    +-----------+     +--------------+
 | code      |    | name         |    | step_order|     | user_id      |
 | display   |    | resource_type|    | name      |     | timestamp    |
 | requires_ |    | is_active    |    | min_role  |     | meaning_code |
 | comment   |    | is_required  |    | meaning   |     | resource_hash|
 +-----------+    +--------------+    | self_sign |     | sig_hash     |
                        |             | timeout   |     | ip_address   |
                        |             +-----------+     +--------------+
                        v
                  +--------------+
                  | Instance     |
                  | status       |
                  | current_step |
                  | initiated_by |
                  | expires_at   |
                  +--------------+
```

### 3.2 Workflow Lifecycle

```
Resource Created
       |
       v
Workflow Triggered (status: "pending")
       |
       v
Step 1: Review (supervisor signs)  -->  status: "in_progress"
       |
       v
Step 2: Approval (engineer signs)  -->  status: "completed"
       |
       v
Resource Released
```

A workflow can also be **rejected** at any step (status: `"rejected"`),
or **expire** if a step's timeout elapses (status: `"expired"`).

### 3.3 Terminology

- **Meaning**: A named purpose for a signature (e.g., `reviewed`, `approved`,
  `rejected`). Plant-scoped and configurable. Corresponds to 11.50 requirement
  that each signature convey its meaning.

- **Workflow**: A definition that links a resource type (e.g., `sample_approval`)
  to a sequence of steps. One active workflow per resource type per plant.

- **Step**: An ordered position in a workflow. Each step specifies a minimum role,
  an allowed meaning code, whether self-signing is allowed, and an optional timeout.

- **Instance**: A live execution of a workflow for a specific resource. Tracks
  current step, status, and expiration.

- **Signature**: The immutable record created when a user signs. Contains the
  signer identity, timestamp, meaning, hashes, IP address, and user agent.

- **Standalone Signature**: A signature executed without a workflow. Useful for
  ad-hoc sign-offs where a formal multi-step process is not required.

---

## 4. Configuration

Configuration is performed in **Settings > Signatures** (requires Engineer+ role
for workflows, Admin for meanings and password policy).

### 4.1 Signature Meanings

Navigate to the **Meanings** tab. Each meaning has:

| Field | Description |
|---|---|
| `code` | Machine identifier (lowercase, underscores). Immutable after creation. |
| `display_name` | Human-readable label shown in the signature dialog. |
| `description` | Optional explanation of the meaning's purpose. |
| `requires_comment` | If true, the signer must provide a comment when using this meaning. |
| `is_active` | Inactive meanings are hidden from the signature dialog. |
| `sort_order` | Controls display ordering in dropdowns. |

Meanings are plant-scoped. Different plants can define different meanings to
match their regulatory context.

**Example meanings for a pharma plant:**

| Code | Display Name | Requires Comment |
|---|---|---|
| `reviewed` | Reviewed by QA | No |
| `approved` | Approved for Production | No |
| `rejected` | Rejected -- Requires Rework | Yes |
| `verified` | Verified by Lab | No |

### 4.2 Workflow Builder

Navigate to the **Workflows** tab. Click **New Workflow** to create a definition:

- **Name**: Human-readable workflow name (e.g., "Sample Approval Workflow").
- **Resource Type**: The type of action this workflow governs. Options include
  `sample_approval`, `limit_change`, `config_change`, `report_release`,
  `violation_disposition`, and `user_management`.
- **Active**: Whether this workflow is currently enforced.
- **Required**: If true, the associated action is blocked until the workflow
  completes.

Expand a workflow to manage its **steps**. Each step requires:

| Field | Description |
|---|---|
| `step_order` | Sequence number (1, 2, 3...). |
| `name` | Display name (e.g., "QA Review"). |
| `min_role` | Minimum role to sign this step (`operator`, `supervisor`, `engineer`, `admin`). |
| `meaning_code` | Which meaning the signer must select at this step. |
| `is_required` | Whether this step can be skipped. |
| `allow_self_sign` | If false, the same user cannot sign multiple steps in one workflow instance. |
| `timeout_hours` | Optional. Hours before this step expires. |

### 4.3 Password Policy

Navigate to the **Password Policy** tab (Admin only). All settings apply to the
current plant.

---

## 5. Signing Flow

When a signable action is triggered (e.g., submitting a sample for approval):

1. **Workflow initiation**: The system finds the active workflow for the resource
   type and creates an instance (status: `"pending"`).

2. **Signature Dialog**: The user clicks **Sign** in the Pending Approvals
   dashboard. The dialog presents:
   - A summary of the resource being signed.
   - A dropdown of allowed meanings for this step.
   - A password field for re-authentication.
   - An optional (or required) comment field.

3. **Server-side validation**: The backend verifies:
   - Password is correct (Argon2 hash comparison).
   - User meets the minimum role for the current step.
   - Self-signing constraint is satisfied.
   - The selected meaning is valid and active.
   - Comment is provided if required by the meaning.

4. **Hash computation**:
   - **Resource hash**: `SHA-256(json.dumps({"type": resource_type, "resource_id": id}, sort_keys=True))`
   - **Signature hash**: `SHA-256(json.dumps({"user_id": ..., "timestamp": ..., "meaning_code": ..., "resource_hash": ...}, sort_keys=True))`

5. **Record creation**: An `ElectronicSignature` row is persisted with all
   metadata including IP address and user agent.

6. **Workflow advancement**: If there is a next step, the instance advances
   (status: `"in_progress"`). If this was the last step, the instance completes
   (status: `"completed"`).

7. **Event publication**: `SignatureCreatedEvent` is published to the Event Bus.
   If the workflow completed, `WorkflowCompletedEvent` is also published.

### 5.1 Rejection Flow

Users can reject a workflow step instead of signing it. Rejection:

- Requires password re-authentication.
- Requires a text reason.
- Sets the instance status to `"rejected"`.
- Publishes `SignatureRejectedEvent`.

### 5.2 Standalone Signatures

For actions that do not require a multi-step workflow, the API supports
standalone signatures. These follow the same hash computation and validation
but do not create a workflow instance. Pass `workflow_instance_id: null` in the
sign request.

---

## 6. Verification and Tamper Detection

Every signature is verifiable by recomputing hashes and comparing them against
stored values.

### 6.1 Verification Process

Call `GET /api/v1/signatures/verify/{signature_id}`:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/signatures/verify/42
```

The response includes:

```json
{
  "signature_id": 42,
  "is_valid": true,
  "signer_name": "dr.chen",
  "full_name": "Dr. Sarah Chen",
  "timestamp": "2026-02-14T10:30:00Z",
  "meaning": "Approved for Production",
  "resource_type": "sample_approval",
  "resource_id": 123,
  "stored_hash": "a1b2c3...",
  "current_hash": "a1b2c3...",
  "hash_match": true,
  "signature_chain_valid": true
}
```

### 6.2 What Each Field Means

| Field | Description |
|---|---|
| `is_valid` | False if the signature has been administratively invalidated. |
| `hash_match` | True if the current resource hash matches the hash stored at signing time. False indicates the resource was modified after signing. |
| `signature_chain_valid` | True if the signature hash can be recomputed from the stored components. False indicates direct tampering with the signature record. |

### 6.3 Invalidation

Signatures can be programmatically invalidated when a resource is modified after
signing. The `invalidate_signatures_for_resource` method marks all existing
signatures for a resource as invalid with a reason, and publishes
`SignatureInvalidatedEvent`.

---

## 7. Password Policies

Configurable per-plant via **Settings > Signatures > Password Policy** (Admin only).

| Setting | Description | FDA-Recommended Default |
|---|---|---|
| `password_expiry_days` | Days before password must be changed. 0 = no expiry. | 90 |
| `max_failed_attempts` | Failed login attempts before account lockout. | 5 |
| `lockout_duration_minutes` | Minutes of lockout after exceeding max attempts. | 30 |
| `min_password_length` | Minimum password character count. | 12 |
| `require_uppercase` | Require at least one uppercase letter (A-Z). | true |
| `require_lowercase` | Require at least one lowercase letter (a-z). | true |
| `require_digit` | Require at least one digit (0-9). | true |
| `require_special` | Require at least one special character. | true |
| `password_history_count` | Number of previous passwords that cannot be reused. | 12 |
| `session_timeout_minutes` | Inactivity timeout for the user session. | 30 |
| `signature_timeout_minutes` | Window after authentication during which the user can sign without re-entering password. | 5 |

These settings map to 21 CFR Part 11 Section 11.300 controls for identification
codes and passwords.

---

## 8. Audit Trail Integration

Electronic signature events integrate with OpenSPC's audit trail system:

### 8.1 Events Published

| Event | When | Data Included |
|---|---|---|
| `SignatureCreatedEvent` | After successful signature | signature_id, user_id, username, resource_type, resource_id, meaning_code, workflow_instance_id |
| `SignatureRejectedEvent` | After workflow rejection | workflow_instance_id, user_id, username, resource_type, resource_id, reason |
| `WorkflowCompletedEvent` | After final step signed | workflow_instance_id, resource_type, resource_id |
| `SignatureInvalidatedEvent` | After resource modification | resource_type, resource_id, invalidated_signature_ids, reason |

### 8.2 Notification Integration

All signature events flow through the Event Bus to the NotificationDispatcher.
Configure email and webhook notifications in **Settings > Notifications** to
receive alerts when signatures are created, workflows complete, or signatures
are invalidated.

### 8.3 Viewing the Audit Log

Navigate to **Settings > Audit Log** (Admin only). The AuditLogViewer provides:

- Filtering by action type, user, and date range.
- Signature history with full signer identity and timestamp.
- CSV export for offline compliance review.

---

## 9. API Reference

All endpoints are prefixed with `/api/v1/signatures`. Authentication is
required via JWT Bearer token. The `plant_id` query parameter scopes
operations to a specific plant.

### 9.1 Signing Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| POST | `/sign` | Execute an electronic signature (standalone or workflow-based) | operator |
| POST | `/reject` | Reject a workflow step with reason | operator |
| GET | `/pending` | List pending workflows the current user can sign | operator |
| GET | `/history` | Get paginated signature history with filters | supervisor |
| GET | `/resource/{resource_type}/{resource_id}` | Get all signatures for a resource | any authenticated |
| GET | `/verify/{signature_id}` | Verify a signature's integrity (hash check) | any authenticated |

### 9.2 Workflow Configuration Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/workflows` | List workflows for a plant | engineer |
| POST | `/workflows` | Create a new workflow | engineer |
| PUT | `/workflows/{workflow_id}` | Update a workflow | engineer |
| DELETE | `/workflows/{workflow_id}` | Delete a workflow | engineer |
| GET | `/workflows/{workflow_id}/steps` | List steps for a workflow | engineer |
| POST | `/workflows/{workflow_id}/steps` | Add a step to a workflow | engineer |
| PUT | `/workflows/steps/{step_id}` | Update a workflow step | engineer |
| DELETE | `/workflows/steps/{step_id}` | Delete a workflow step | engineer |

### 9.3 Meaning Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/meanings` | List signature meanings for a plant | admin |
| POST | `/meanings` | Create a new meaning | admin |
| PUT | `/meanings/{meaning_id}` | Update a meaning | admin |
| DELETE | `/meanings/{meaning_id}` | Soft-delete (deactivate) a meaning | admin |

### 9.4 Password Policy Endpoints

| Method | Path | Description | Min Role |
|---|---|---|---|
| GET | `/password-policy` | Get password policy for a plant | admin |
| PUT | `/password-policy` | Create or update password policy | admin |

### 9.5 Example: Executing a Signature

```bash
# Execute a standalone signature
curl -X POST http://localhost:8000/api/v1/signatures/sign?plant_id=1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resource_type": "sample_approval",
    "resource_id": 42,
    "password": "QaDirector2026!",
    "meaning_code": "approved",
    "comment": "Batch meets all specifications",
    "workflow_instance_id": null
  }'
```

Response:

```json
{
  "signature_id": 1,
  "signer_name": "dr.chen",
  "full_name": "Dr. Sarah Chen",
  "timestamp": "2026-02-14T10:30:00Z",
  "meaning": "Approved for Production",
  "resource_hash": "d4e5f6a7b8c9...",
  "signature_hash": "1a2b3c4d5e6f...",
  "workflow_status": null,
  "workflow_step": null
}
```

### 9.6 Example: Listing Pending Approvals

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/signatures/pending?plant_id=1"
```

Response:

```json
{
  "items": [
    {
      "workflow_instance_id": 5,
      "workflow_name": "Sample Approval Workflow",
      "resource_type": "sample_approval",
      "resource_id": 42,
      "current_step": "QA Review",
      "step_number": 1,
      "total_steps": 2,
      "initiated_by": "lab.tech",
      "initiated_at": "2026-02-14T09:00:00Z",
      "expires_at": "2026-02-15T09:00:00Z",
      "previous_signatures": []
    }
  ],
  "total": 1
}
```

---

## Database Schema

The electronic signature system uses six tables created by migration 031:

| Table | Purpose |
|---|---|
| `electronic_signature` | Immutable signature records with hashes and metadata |
| `signature_meaning` | Plant-scoped meaning definitions |
| `signature_workflow` | Workflow definitions per resource type |
| `signature_workflow_step` | Ordered steps within a workflow |
| `signature_workflow_instance` | Live workflow executions |
| `password_policy` | Per-plant password policy settings |

Additional columns on the `user` table: `last_signature_auth_at`,
`failed_signature_attempts`, `signature_locked_until`.

---

## Frontend Components

| Component | Location | Purpose |
|---|---|---|
| `SignatureDialog` | `components/signatures/` | Modal for executing a signature with meaning selection, password re-auth, and comment |
| `RejectDialog` | `components/signatures/` | Modal for rejecting a workflow step with reason |
| `PendingApprovalsDashboard` | `components/signatures/` | List of pending workflows with Sign/Reject actions and progress dots |
| `WorkflowConfig` | `components/signatures/` | CRUD interface for creating and editing workflows and their steps |
| `WorkflowStepEditor` | `components/signatures/` | Step management within a workflow (add, edit, reorder, delete) |
| `MeaningManager` | `components/signatures/` | CRUD interface for signature meanings with code, display name, and comment requirements |
| `PasswordPolicySettings` | `components/signatures/` | Password policy form with expiry, lockout, complexity, history, and timeout controls |
| `SignatureHistory` | `components/signatures/` | Paginated signature history browser |
| `SignatureVerifyBadge` | `components/signatures/` | Inline badge showing signature validity with verification on click |
| `SignatureManifest` | `components/signatures/` | Summary view of all signatures for a resource |
