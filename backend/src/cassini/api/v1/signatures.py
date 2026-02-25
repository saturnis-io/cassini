"""Electronic signature REST endpoints for 21 CFR Part 11 compliance.

Provides signing, verification, workflow management, meaning configuration,
and password policy management endpoints.
"""

from datetime import datetime

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.signature import (
    MeaningCreate,
    MeaningResponse,
    MeaningUpdate,
    PasswordPolicyResponse,
    PasswordPolicyUpdate,
    PendingApprovalItem,
    PendingApprovalsResponse,
    PreviousSignatureInfo,
    RejectRequest,
    SignatureHistoryItem,
    SignatureHistoryResponse,
    SignatureResponse,
    SignRequest,
    SignResponse,
    StepCreate,
    StepResponse,
    StepUpdate,
    VerifyResponse,
    WorkflowCreate,
    WorkflowResponse,
    WorkflowUpdate,
)
from cassini.core.events import event_bus
from cassini.core.signature_engine import SignatureWorkflowEngine
from cassini.db.models.user import User
from cassini.db.repositories.signature import (
    PasswordPolicyRepository,
    SignatureMeaningRepository,
    SignatureRepository,
)
from cassini.db.repositories.workflow import (
    WorkflowInstanceRepository,
    WorkflowRepository,
    WorkflowStepRepository,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/signatures", tags=["signatures"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_client_ip(request: Request) -> str | None:
    """Extract client IP from request."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


# ---------------------------------------------------------------------------
# Signature endpoints (static paths first)
# ---------------------------------------------------------------------------


@router.post("/sign", response_model=SignResponse, status_code=status.HTTP_201_CREATED)
async def execute_signature(
    body: SignRequest,
    request: Request,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Execute an electronic signature (standalone or workflow-based)."""
    check_plant_role(user, plant_id, "operator")

    engine = SignatureWorkflowEngine(session, event_bus)
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")[:512]

    if body.workflow_instance_id is not None:
        sig = await engine.sign(
            workflow_instance_id=body.workflow_instance_id,
            user=user,
            password=body.password,
            meaning_code=body.meaning_code,
            plant_id=plant_id,
            comment=body.comment,
            ip_address=ip,
            user_agent=ua,
        )
        # Get workflow status
        instance_repo = WorkflowInstanceRepository(session)
        instance = await instance_repo.get_with_workflow(body.workflow_instance_id)
        workflow_status = instance.status if instance else None
        # Find step name
        step_name = None
        if instance:
            steps = sorted(instance.workflow.steps, key=lambda s: s.step_order)
            for s in steps:
                if s.id == sig.workflow_step_id:
                    step_name = s.name
                    break
    else:
        sig = await engine.sign_standalone(
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            user=user,
            password=body.password,
            meaning_code=body.meaning_code,
            plant_id=plant_id,
            comment=body.comment,
            ip_address=ip,
            user_agent=ua,
        )
        workflow_status = None
        step_name = None

    await session.commit()

    return SignResponse(
        signature_id=sig.id,
        signer_name=sig.username,
        full_name=sig.full_name,
        timestamp=sig.timestamp,
        meaning=sig.meaning_display,
        resource_hash=sig.resource_hash,
        signature_hash=sig.signature_hash,
        workflow_status=workflow_status,
        workflow_step=step_name,
    )


@router.post("/reject", status_code=status.HTTP_200_OK)
async def reject_workflow(
    body: RejectRequest,
    request: Request,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Reject a workflow step."""
    check_plant_role(user, plant_id, "operator")

    engine = SignatureWorkflowEngine(session, event_bus)
    ip = _get_client_ip(request)

    await engine.reject(
        workflow_instance_id=body.workflow_instance_id,
        user=user,
        password=body.password,
        reason=body.reason,
        plant_id=plant_id,
        ip_address=ip,
    )
    await session.commit()
    return {"message": "Workflow rejected"}


@router.get("/pending", response_model=PendingApprovalsResponse)
async def get_pending_approvals(
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get pending workflows for the current user."""
    check_plant_role(user, plant_id, "operator")

    engine = SignatureWorkflowEngine(session, event_bus)
    instances = await engine.check_pending_for_user(user, plant_id)

    sig_repo = SignatureRepository(session)
    items = []
    for inst in instances:
        steps = sorted(inst.workflow.steps, key=lambda s: s.step_order)
        current_step = next(
            (s for s in steps if s.step_order == inst.current_step), None
        )

        # Get previous signatures for this resource
        sigs = await sig_repo.get_by_resource(inst.resource_type, inst.resource_id)
        prev_sigs = []
        for s in sigs:
            step_name = ""
            if s.workflow_step_id:
                for st in steps:
                    if st.id == s.workflow_step_id:
                        step_name = st.name
                        break
            prev_sigs.append(
                PreviousSignatureInfo(
                    step=step_name,
                    signer=s.username,
                    timestamp=s.timestamp,
                    meaning=s.meaning_display,
                )
            )

        # Get initiator username
        initiator_name = None
        if inst.initiated_by:
            from cassini.db.repositories.user import UserRepository

            user_repo = UserRepository(session)
            initiator = await user_repo.get_by_id(inst.initiated_by)
            if initiator:
                initiator_name = initiator.username

        items.append(
            PendingApprovalItem(
                workflow_instance_id=inst.id,
                workflow_name=inst.workflow.name,
                resource_type=inst.resource_type,
                resource_id=inst.resource_id,
                current_step=current_step.name if current_step else "Unknown",
                step_number=inst.current_step,
                total_steps=len(steps),
                initiated_by=initiator_name,
                initiated_at=inst.initiated_at,
                expires_at=inst.expires_at,
                previous_signatures=prev_sigs,
            )
        )

    return PendingApprovalsResponse(items=items, total=len(items))


@router.get("/history", response_model=SignatureHistoryResponse)
async def get_signature_history(
    plant_id: int = Query(...),
    resource_type: str | None = Query(None),
    user_id: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get signature history with filters (supervisor+)."""
    check_plant_role(user, plant_id, "supervisor")

    sig_repo = SignatureRepository(session)
    sigs, total = await sig_repo.get_history(
        resource_type=resource_type,
        user_id=user_id,
        offset=offset,
        limit=limit,
    )

    items = [
        SignatureHistoryItem(
            id=s.id,
            username=s.username,
            full_name=s.full_name,
            timestamp=s.timestamp,
            meaning_code=s.meaning_code,
            meaning_display=s.meaning_display,
            resource_type=s.resource_type,
            resource_id=s.resource_id,
            is_valid=s.is_valid,
            comment=s.comment,
        )
        for s in sigs
    ]

    return SignatureHistoryResponse(items=items, total=total)


# --- Parameterized paths AFTER static paths ---


@router.get(
    "/resource/{resource_type}/{resource_id}",
    response_model=list[SignatureResponse],
)
async def get_signatures_for_resource(
    resource_type: str,
    resource_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get all signatures for a resource."""
    sig_repo = SignatureRepository(session)
    sigs = await sig_repo.get_by_resource(resource_type, resource_id)
    return [
        SignatureResponse(
            id=s.id,
            user_id=s.user_id,
            username=s.username,
            full_name=s.full_name,
            timestamp=s.timestamp,
            meaning_code=s.meaning_code,
            meaning_display=s.meaning_display,
            resource_type=s.resource_type,
            resource_id=s.resource_id,
            resource_hash=s.resource_hash,
            signature_hash=s.signature_hash,
            ip_address=s.ip_address,
            comment=s.comment,
            is_valid=s.is_valid,
            invalidated_at=s.invalidated_at,
            invalidated_reason=s.invalidated_reason,
            workflow_step_id=s.workflow_step_id,
        )
        for s in sigs
    ]


@router.get("/verify/{signature_id}", response_model=VerifyResponse)
async def verify_signature(
    signature_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Verify a signature's integrity."""
    engine = SignatureWorkflowEngine(session)
    result = await engine.verify_signature(signature_id)
    return VerifyResponse(**result)


# ---------------------------------------------------------------------------
# Workflow configuration endpoints (engineer+)
# ---------------------------------------------------------------------------


@router.get("/workflows", response_model=list[WorkflowResponse])
async def list_workflows(
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """List workflows for a plant."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowRepository(session)
    workflows = await repo.get_for_plant(plant_id)
    return [WorkflowResponse.model_validate(w) for w in workflows]


@router.post(
    "/workflows",
    response_model=WorkflowResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_workflow(
    body: WorkflowCreate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a new signature workflow."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowRepository(session)

    # Check for duplicate resource_type
    existing = await repo.get_by_resource_type(plant_id, body.resource_type)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workflow for resource type '{body.resource_type}' already exists",
        )

    workflow = await repo.create(
        plant_id=plant_id,
        name=body.name,
        resource_type=body.resource_type,
        is_active=body.is_active,
        is_required=body.is_required,
        description=body.description,
    )
    await session.commit()
    return WorkflowResponse.model_validate(workflow)


@router.put("/workflows/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: int,
    body: WorkflowUpdate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a signature workflow."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowRepository(session)
    workflow = await repo.get_by_id(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    update_data = body.model_dump(exclude_unset=True)
    if update_data:
        update_data["updated_at"] = datetime.utcnow()
        workflow = await repo.update(workflow_id, **update_data)
    await session.commit()
    return WorkflowResponse.model_validate(workflow)


@router.delete("/workflows/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_workflow(
    workflow_id: int,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a signature workflow."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowRepository(session)
    deleted = await repo.delete(workflow_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await session.commit()


@router.get("/workflows/{workflow_id}/steps", response_model=list[StepResponse])
async def list_workflow_steps(
    workflow_id: int,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get steps for a workflow."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowStepRepository(session)
    steps = await repo.get_for_workflow(workflow_id)
    return [StepResponse.model_validate(s) for s in steps]


@router.post(
    "/workflows/{workflow_id}/steps",
    response_model=StepResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_workflow_step(
    workflow_id: int,
    body: StepCreate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Add a step to a workflow."""
    check_plant_role(user, plant_id, "engineer")

    # Verify workflow exists
    wf_repo = WorkflowRepository(session)
    workflow = await wf_repo.get_by_id(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found")

    step_repo = WorkflowStepRepository(session)
    step = await step_repo.create(
        workflow_id=workflow_id,
        step_order=body.step_order,
        name=body.name,
        min_role=body.min_role,
        meaning_code=body.meaning_code,
        is_required=body.is_required,
        allow_self_sign=body.allow_self_sign,
        timeout_hours=body.timeout_hours,
    )
    await session.commit()
    return StepResponse.model_validate(step)


@router.put("/workflows/steps/{step_id}", response_model=StepResponse)
async def update_workflow_step(
    step_id: int,
    body: StepUpdate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a workflow step."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowStepRepository(session)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    step = await repo.update(step_id, **update_data)
    if step is None:
        raise HTTPException(status_code=404, detail="Step not found")
    await session.commit()
    return StepResponse.model_validate(step)


@router.delete("/workflows/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_workflow_step(
    step_id: int,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Delete a workflow step."""
    check_plant_role(user, plant_id, "engineer")
    repo = WorkflowStepRepository(session)
    deleted = await repo.delete(step_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Step not found")
    await session.commit()


# ---------------------------------------------------------------------------
# Meaning endpoints (admin)
# ---------------------------------------------------------------------------


@router.get("/meanings", response_model=list[MeaningResponse])
async def list_meanings(
    plant_id: int = Query(...),
    include_inactive: bool = Query(False),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """List signature meanings for a plant."""
    check_plant_role(user, plant_id, "admin")
    repo = SignatureMeaningRepository(session)
    meanings = await repo.get_for_plant(plant_id, active_only=not include_inactive)
    return [MeaningResponse.model_validate(m) for m in meanings]


@router.post(
    "/meanings",
    response_model=MeaningResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_meaning(
    body: MeaningCreate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Create a new signature meaning."""
    check_plant_role(user, plant_id, "admin")
    repo = SignatureMeaningRepository(session)

    existing = await repo.get_by_code(plant_id, body.code)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Meaning code '{body.code}' already exists for this plant",
        )

    meaning = await repo.create(
        plant_id=plant_id,
        code=body.code,
        display_name=body.display_name,
        description=body.description,
        requires_comment=body.requires_comment,
        sort_order=body.sort_order,
    )
    await session.commit()
    return MeaningResponse.model_validate(meaning)


@router.put("/meanings/{meaning_id}", response_model=MeaningResponse)
async def update_meaning(
    meaning_id: int,
    body: MeaningUpdate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Update a signature meaning."""
    check_plant_role(user, plant_id, "admin")
    repo = SignatureMeaningRepository(session)
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    meaning = await repo.update(meaning_id, **update_data)
    if meaning is None:
        raise HTTPException(status_code=404, detail="Meaning not found")
    await session.commit()
    return MeaningResponse.model_validate(meaning)


@router.delete("/meanings/{meaning_id}", status_code=status.HTTP_200_OK)
async def delete_meaning(
    meaning_id: int,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Soft-delete a signature meaning (set inactive)."""
    check_plant_role(user, plant_id, "admin")
    repo = SignatureMeaningRepository(session)
    meaning = await repo.update(meaning_id, is_active=False)
    if meaning is None:
        raise HTTPException(status_code=404, detail="Meaning not found")
    await session.commit()
    return {"message": "Meaning deactivated"}


# ---------------------------------------------------------------------------
# Password policy endpoints (admin)
# ---------------------------------------------------------------------------


@router.get("/password-policy", response_model=PasswordPolicyResponse | None)
async def get_password_policy(
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Get password policy for a plant."""
    check_plant_role(user, plant_id, "admin")
    repo = PasswordPolicyRepository(session)
    policy = await repo.get_for_plant(plant_id)
    if policy is None:
        return None
    return PasswordPolicyResponse.model_validate(policy)


@router.put("/password-policy", response_model=PasswordPolicyResponse)
async def update_password_policy(
    body: PasswordPolicyUpdate,
    plant_id: int = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Create or update password policy for a plant."""
    check_plant_role(user, plant_id, "admin")
    repo = PasswordPolicyRepository(session)
    update_data = body.model_dump(exclude_unset=True)
    policy = await repo.upsert(plant_id, **update_data)
    await session.commit()
    return PasswordPolicyResponse.model_validate(policy)
