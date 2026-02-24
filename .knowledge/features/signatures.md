# Electronic Signatures (21 CFR Part 11)

## Data Flow
```
SignatureDialog.tsx → useSign()
  → POST /api/v1/signatures/sign { resource_type, resource_id, meaning_id, password, comment }
  → signatures.py → SignatureWorkflowEngine.sign()
    → verify password → create ElectronicSignature with SHA-256 hash
    → check workflow steps → advance workflow instance if applicable
    → SignResponse

PendingApprovalsDashboard.tsx → usePendingApprovals(plantId)
  → GET /api/v1/signatures/pending?plant_id=N
  → list of resources awaiting current user's signature step

WorkflowConfig.tsx → useWorkflows() + useWorkflowSteps()
  → CRUD via /api/v1/signatures/workflows/* endpoints
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| ElectronicSignature | db/models/signature.py | id, plant_id(FK), resource_type, resource_id, signer_id(FK User), signer_name, full_name, meaning_id(FK nullable), comment, hash(SHA-256), signed_at, workflow_instance_id(FK nullable), step_id(FK nullable) | 031 |
| SignatureMeaning | db/models/signature.py | id, plant_id(FK), code, display_name, description, is_active | 031 |
| SignatureWorkflow | db/models/signature.py | id, plant_id(FK), name, resource_type, description, is_active, require_all_steps | 031 |
| SignatureWorkflowStep | db/models/signature.py | id, workflow_id(FK), step_order, name, required_role, meaning_id(FK nullable), is_required | 031 |
| SignatureWorkflowInstance | db/models/signature.py | id, workflow_id(FK), resource_type, resource_id, status(pending/completed/rejected), current_step_order, created_at, completed_at | 031 |
| PasswordPolicy | db/models/signature.py | id, plant_id(FK unique), min_length, require_uppercase, require_lowercase, require_digit, require_special, max_age_days, updated_at | 031 |
| User (sig cols) | db/models/user.py | signature_full_name, signature_title, password_changed_at | 031 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| POST | /api/v1/signatures/sign | body: SignRequest | SignResponse (201) | get_current_user |
| POST | /api/v1/signatures/reject | body: RejectRequest | dict | get_current_user |
| GET | /api/v1/signatures/pending | plant_id | PendingApprovalsResponse | get_current_user |
| GET | /api/v1/signatures/history | plant_id, resource_type, resource_id, offset, limit | SignatureHistoryResponse | get_current_user |
| GET | /api/v1/signatures/resource/{resource_type}/{resource_id} | plant_id | list[SignatureResponse] | get_current_user |
| GET | /api/v1/signatures/verify/{signature_id} | plant_id | VerifyResponse | get_current_user |
| GET | /api/v1/signatures/workflows | plant_id | list[WorkflowResponse] | get_current_user |
| POST | /api/v1/signatures/workflows | body: WorkflowCreate | WorkflowResponse (201) | get_current_engineer |
| PUT | /api/v1/signatures/workflows/{workflow_id} | body: WorkflowUpdate | WorkflowResponse | get_current_engineer |
| DELETE | /api/v1/signatures/workflows/{workflow_id} | - | 204 | get_current_engineer |
| GET | /api/v1/signatures/workflows/{workflow_id}/steps | plant_id | list[StepResponse] | get_current_user |
| POST | /api/v1/signatures/workflows/{workflow_id}/steps | body: StepCreate | StepResponse (201) | get_current_engineer |
| PUT | /api/v1/signatures/workflows/steps/{step_id} | body: StepUpdate | StepResponse | get_current_engineer |
| DELETE | /api/v1/signatures/workflows/steps/{step_id} | - | 204 | get_current_engineer |
| GET | /api/v1/signatures/meanings | plant_id | list[MeaningResponse] | get_current_user |
| POST | /api/v1/signatures/meanings | body: MeaningCreate | MeaningResponse (201) | get_current_engineer |
| PUT | /api/v1/signatures/meanings/{meaning_id} | body: MeaningUpdate | MeaningResponse | get_current_engineer |
| DELETE | /api/v1/signatures/meanings/{meaning_id} | - | 200 | get_current_engineer |
| GET | /api/v1/signatures/password-policy | plant_id | PasswordPolicyResponse or null | get_current_user |
| PUT | /api/v1/signatures/password-policy | body: PasswordPolicyUpdate | PasswordPolicyResponse | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| SignatureWorkflowEngine | core/signature_engine.py | sign(), reject(), verify(), get_pending_for_user(), compute_hash() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| SignatureRepository | db/repositories/signature.py | create_signature, get_by_resource, get_history |
| WorkflowRepository | db/repositories/workflow.py | get_workflows, create_workflow, get_instance, advance_step |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| SignatureDialog | components/signatures/SignatureDialog.tsx | resourceType, resourceId, open, onClose | useSign, useMeanings, useWorkflows |
| PendingApprovalsDashboard | components/signatures/PendingApprovalsDashboard.tsx | - | usePendingApprovals |
| WorkflowConfig | components/signatures/WorkflowConfig.tsx | - | useWorkflows, useCreateWorkflow, useUpdateWorkflow, useDeleteWorkflow |
| WorkflowStepEditor | components/signatures/WorkflowStepEditor.tsx | workflowId | useWorkflowSteps, useCreateStep, useUpdateStep, useDeleteStep |
| WorkflowProgress | components/signatures/WorkflowProgress.tsx | resourceType, resourceId | useSignatures |
| MeaningManager | components/signatures/MeaningManager.tsx | - | useMeanings, useCreateMeaning, useUpdateMeaning, useDeleteMeaning |
| PasswordPolicySettings | components/signatures/PasswordPolicySettings.tsx | - | usePasswordPolicy, useUpdatePasswordPolicy |
| SignatureHistory | components/signatures/SignatureHistory.tsx | - | useSignatureHistory |
| SignatureManifest | components/signatures/SignatureManifest.tsx | resourceType, resourceId | useSignatures |
| SignatureVerifyBadge | components/signatures/SignatureVerifyBadge.tsx | signatureId | useVerifySignature |
| RejectDialog | components/signatures/RejectDialog.tsx | open, onClose | useRejectWorkflow |
| SignatureSettingsPage | components/signatures/SignatureSettingsPage.tsx | - | all signature admin hooks |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useSignatures | signatureApi.getResourceSignatures | GET /signatures/resource/{type}/{id} | ['signatures', 'resource', type, id] |
| useSign | signatureApi.sign | POST /signatures/sign | invalidates signatures.all |
| useRejectWorkflow | signatureApi.reject | POST /signatures/reject | invalidates signatures.all |
| usePendingApprovals | signatureApi.getPending | GET /signatures/pending | ['signatures', 'pending', plantId] (30s poll) |
| useSignatureHistory | signatureApi.getHistory | GET /signatures/history | ['signatures', 'history', params] |
| useVerifySignature | signatureApi.verify | GET /signatures/verify/{id} | - |
| useWorkflows | signatureApi.getWorkflows | GET /signatures/workflows | ['signatures', 'workflows'] |
| useCreateWorkflow | signatureApi.createWorkflow | POST /signatures/workflows | invalidates workflows |
| useUpdateWorkflow | signatureApi.updateWorkflow | PUT /signatures/workflows/{id} | invalidates workflows |
| useDeleteWorkflow | signatureApi.deleteWorkflow | DELETE /signatures/workflows/{id} | invalidates workflows |
| useWorkflowSteps | signatureApi.getSteps | GET /signatures/workflows/{id}/steps | ['signatures', 'steps', workflowId] |
| useCreateStep | signatureApi.createStep | POST /signatures/workflows/{id}/steps | invalidates steps |
| useUpdateStep | signatureApi.updateStep | PUT /signatures/workflows/steps/{id} | invalidates all |
| useDeleteStep | signatureApi.deleteStep | DELETE /signatures/workflows/steps/{id} | invalidates all |
| useMeanings | signatureApi.getMeanings | GET /signatures/meanings | ['signatures', 'meanings'] |
| useCreateMeaning | signatureApi.createMeaning | POST /signatures/meanings | invalidates meanings |
| useUpdateMeaning | signatureApi.updateMeaning | PUT /signatures/meanings/{id} | invalidates meanings |
| useDeleteMeaning | signatureApi.deleteMeaning | DELETE /signatures/meanings/{id} | invalidates meanings |
| usePasswordPolicy | signatureApi.getPasswordPolicy | GET /signatures/password-policy | ['signatures', 'password-policy'] |
| useUpdatePasswordPolicy | signatureApi.updatePasswordPolicy | PUT /signatures/password-policy | invalidates password-policy |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /settings | SettingsView.tsx | SignatureSettingsPage (tab with WorkflowConfig, MeaningManager, PasswordPolicySettings) |

## Migrations
- 031 (electronic_signatures): electronic_signature, signature_meaning, signature_workflow, signature_workflow_step, signature_workflow_instance, password_policy tables; signature_full_name/title/password_changed_at on user

## Known Issues / Gotchas
- Hash computed as SHA-256 of (signer_id + resource_type + resource_id + meaning_code + timestamp) for tamper detection
- All signature hooks use useActivePlantId() from Zustand store to scope queries
- Pending approvals poll every 30 seconds
- Workflow instance status: pending -> completed (all steps signed) or rejected
