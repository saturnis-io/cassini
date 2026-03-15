"""Pydantic schemas for electronic signature operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Signature request / response
# ---------------------------------------------------------------------------


class SignRequest(BaseModel):
    """Request to execute an electronic signature."""

    resource_type: str = Field(..., max_length=50)
    resource_id: int
    password: str = Field(..., min_length=1)
    meaning_code: str = Field(..., max_length=50)
    comment: str | None = None
    workflow_instance_id: int | None = None


class RejectRequest(BaseModel):
    """Request to reject a workflow step."""

    workflow_instance_id: int
    password: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1, max_length=500)


class SignResponse(BaseModel):
    """Response after executing a signature."""

    signature_id: int
    signer_name: str
    full_name: str | None
    timestamp: datetime
    meaning: str
    resource_hash: str
    signature_hash: str
    workflow_status: str | None = None
    workflow_step: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SignatureResponse(BaseModel):
    """Full signature record response."""

    id: int
    user_id: int
    username: str
    full_name: str | None
    timestamp: datetime
    meaning_code: str
    meaning_display: str
    resource_type: str
    resource_id: int
    resource_hash: str
    signature_hash: str
    ip_address: str | None
    comment: str | None
    is_valid: bool
    invalidated_at: datetime | None
    invalidated_reason: str | None
    workflow_step_id: int | None

    model_config = ConfigDict(from_attributes=True)


class VerifyResponse(BaseModel):
    """Response from verifying a signature's chain-of-custody integrity."""

    signature_id: int
    is_tamper_free: bool
    resource_hash_valid: bool
    signature_hash_valid: bool
    signed_by: str
    signed_at: str
    meaning: str
    resource_type: str
    resource_id: str


class PreviousSignatureInfo(BaseModel):
    """Previous signature summary for pending approvals."""

    step: str
    signer: str
    timestamp: datetime
    meaning: str


class PendingApprovalItem(BaseModel):
    """A single pending approval item."""

    workflow_instance_id: int
    workflow_name: str
    resource_type: str
    resource_id: int
    resource_summary: str | None = None
    current_step: str
    step_number: int
    total_steps: int
    initiated_by: str | None
    initiated_at: datetime
    expires_at: datetime | None
    step_meaning_code: str | None = None
    previous_signatures: list[PreviousSignatureInfo] = []


class PendingApprovalsResponse(BaseModel):
    """Response for pending approvals list."""

    items: list[PendingApprovalItem]
    total: int


class SignatureHistoryItem(BaseModel):
    """Single item in signature history."""

    id: int
    username: str
    full_name: str | None
    timestamp: datetime
    meaning_code: str
    meaning_display: str
    resource_type: str
    resource_id: int
    resource_display: str | None = None
    is_valid: bool
    comment: str | None

    model_config = ConfigDict(from_attributes=True)


class SignatureHistoryResponse(BaseModel):
    """Paginated signature history."""

    items: list[SignatureHistoryItem]
    total: int


# ---------------------------------------------------------------------------
# Workflow CRUD schemas
# ---------------------------------------------------------------------------


class WorkflowCreate(BaseModel):
    """Create a new signature workflow."""

    name: str = Field(..., max_length=255)
    resource_type: str = Field(..., max_length=50)
    is_active: bool = True
    is_required: bool = False
    description: str | None = None


class WorkflowUpdate(BaseModel):
    """Update a signature workflow."""

    name: str | None = Field(None, max_length=255)
    is_active: bool | None = None
    is_required: bool | None = None
    description: str | None = None


class WorkflowResponse(BaseModel):
    """Workflow response."""

    id: int
    plant_id: int
    name: str
    resource_type: str
    is_active: bool
    is_required: bool
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StepCreate(BaseModel):
    """Add a step to a workflow."""

    step_order: int = Field(..., ge=1)
    name: str = Field(..., max_length=255)
    min_role: str = Field(..., max_length=20)
    meaning_code: str = Field(..., max_length=50)
    is_required: bool = True
    allow_self_sign: bool = False
    timeout_hours: int | None = Field(None, ge=1)


class StepUpdate(BaseModel):
    """Update a workflow step."""

    name: str | None = Field(None, max_length=255)
    min_role: str | None = Field(None, max_length=20)
    meaning_code: str | None = Field(None, max_length=50)
    is_required: bool | None = None
    allow_self_sign: bool | None = None
    timeout_hours: int | None = None


class StepResponse(BaseModel):
    """Workflow step response."""

    id: int
    workflow_id: int
    step_order: int
    name: str
    min_role: str
    meaning_code: str
    is_required: bool
    allow_self_sign: bool
    timeout_hours: int | None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Meaning CRUD schemas
# ---------------------------------------------------------------------------


class MeaningCreate(BaseModel):
    """Create a new signature meaning."""

    code: str = Field(..., max_length=50)
    display_name: str = Field(..., max_length=255)
    description: str | None = None
    requires_comment: bool = False
    sort_order: int = 0


class MeaningUpdate(BaseModel):
    """Update a signature meaning."""

    display_name: str | None = Field(None, max_length=255)
    description: str | None = None
    requires_comment: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


class MeaningResponse(BaseModel):
    """Signature meaning response."""

    id: int
    plant_id: int
    code: str
    display_name: str
    description: str | None
    requires_comment: bool
    is_active: bool
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Password policy schemas
# ---------------------------------------------------------------------------


class PasswordPolicyUpdate(BaseModel):
    """Update password policy."""

    password_expiry_days: int | None = Field(None, ge=0)
    max_failed_attempts: int | None = Field(None, ge=1)
    lockout_duration_minutes: int | None = Field(None, ge=1)
    min_password_length: int | None = Field(None, ge=4, le=128)
    require_uppercase: bool | None = None
    require_lowercase: bool | None = None
    require_digit: bool | None = None
    require_special: bool | None = None
    password_history_count: int | None = Field(None, ge=0, le=50)
    session_timeout_minutes: int | None = Field(None, ge=1)
    signature_timeout_minutes: int | None = Field(None, ge=1)


class PasswordPolicyResponse(BaseModel):
    """Password policy response."""

    id: int
    plant_id: int
    password_expiry_days: int
    max_failed_attempts: int
    lockout_duration_minutes: int
    min_password_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_digit: bool
    require_special: bool
    password_history_count: int
    session_timeout_minutes: int
    signature_timeout_minutes: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
