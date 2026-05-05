"""Electronic signature workflow engine for 21 CFR Part 11 compliance.

Manages the sign-off process: password verification, authority checks,
hash computation, signature creation, and workflow advancement.
"""

from __future__ import annotations

import hashlib
import hmac as hmac_module
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.auth.roles import ROLE_HIERARCHY, get_user_role_level_for_plant
from cassini.core.auth.passwords import verify_password
from cassini.core.events import (
    EventBus,
    SignatureCreatedEvent,
    SignatureInvalidatedEvent,
    SignatureRejectedEvent,
    WorkflowCompletedEvent,
    WorkflowExpiredEvent,
)
from cassini.db.models.signature import (
    ElectronicSignature,
    SignatureWorkflow,
    SignatureWorkflowInstance,
)
from cassini.db.models.user import User
from cassini.db.repositories.signature import (
    SignatureMeaningRepository,
    SignatureRepository,
)
from cassini.db.repositories.workflow import (
    WorkflowInstanceRepository,
    WorkflowRepository,
    WorkflowStepRepository,
)

logger = structlog.get_logger(__name__)


class SignatureWorkflowEngine:
    """Manages electronic signature workflows.

    Coordinates the sign-off process: password verification, authority
    checks, hash computation, signature creation, and workflow advancement.
    """

    def __init__(self, session: AsyncSession, event_bus: EventBus | None = None):
        self._session = session
        self._event_bus = event_bus
        self._sig_repo = SignatureRepository(session)
        self._meaning_repo = SignatureMeaningRepository(session)
        self._workflow_repo = WorkflowRepository(session)
        self._step_repo = WorkflowStepRepository(session)
        self._instance_repo = WorkflowInstanceRepository(session)

    async def load_resource_content(
        self,
        session: AsyncSession,
        resource_type: str,
        resource_id: int,
    ) -> dict:
        """Load actual content fields for a resource to include in hash.

        For known resource types, fetches key fields from the database.
        For unknown types, falls back to just the resource_id.
        """
        if resource_type == "fai_report":
            from cassini.db.models.fai import FAIItem, FAIReport
            from cassini.db.models.fai_detail import (
                FAIFunctionalTest,
                FAIMaterial,
                FAISpecialProcess,
            )

            # Core report fields + item count
            stmt = select(
                FAIReport.status,
                FAIReport.part_number,
                FAIReport.fai_type,
            ).where(FAIReport.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                # Count items and compute content hash
                items_result = await session.execute(
                    select(
                        FAIItem.id,
                        FAIItem.characteristic_name,
                        FAIItem.actual_value,
                        FAIItem.result,
                        FAIItem.value_type,
                    ).where(FAIItem.report_id == resource_id)
                    .order_by(FAIItem.sequence_order)
                )
                items = items_result.all()
                items_hash = hashlib.sha256(
                    "|".join(
                        f"{i.id}:{i.characteristic_name}:{i.actual_value}:{i.result}:{i.value_type}"
                        for i in items
                    ).encode("utf-8")
                ).hexdigest()

                # Count child table rows
                mat_count = (await session.execute(
                    select(func.count()).where(FAIMaterial.report_id == resource_id)
                )).scalar_one()
                sp_count = (await session.execute(
                    select(func.count()).where(FAISpecialProcess.report_id == resource_id)
                )).scalar_one()
                ft_count = (await session.execute(
                    select(func.count()).where(FAIFunctionalTest.report_id == resource_id)
                )).scalar_one()

                return {
                    "resource_id": resource_id,
                    "status": row.status,
                    "part_number": row.part_number,
                    "fai_type": row.fai_type,
                    "items_count": len(items),
                    "items_hash": items_hash,
                    "material_count": mat_count,
                    "special_process_count": sp_count,
                    "functional_test_count": ft_count,
                }
        elif resource_type == "msa_study":
            from cassini.db.models.msa import MSAStudy

            stmt = select(
                MSAStudy.study_type,
                MSAStudy.status,
                MSAStudy.results_json,
            ).where(MSAStudy.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                results_hash = (
                    hashlib.sha256(row.results_json.encode("utf-8")).hexdigest()
                    if row.results_json
                    else None
                )
                return {
                    "resource_id": resource_id,
                    "study_type": row.study_type,
                    "status": row.status,
                    "results_hash": results_hash,
                }
        elif resource_type == "retention_purge":
            return {"action": "purge", "resource_id": resource_id}
        elif resource_type == "doe_study":
            from cassini.db.models.doe import DOEFactor, DOEStudy

            stmt = select(
                DOEStudy.status,
                DOEStudy.design_type,
                func.count(DOEFactor.id).label("factor_count"),
            ).outerjoin(DOEFactor, DOEFactor.study_id == DOEStudy.id).where(
                DOEStudy.id == resource_id
            ).group_by(DOEStudy.id, DOEStudy.status, DOEStudy.design_type)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "status": row.status,
                    "design_type": row.design_type,
                    "factor_count": row.factor_count,
                }
        elif resource_type == "characteristic":
            from cassini.db.models.characteristic import Characteristic

            stmt = select(
                Characteristic.id,
                Characteristic.name,
                Characteristic.usl,
                Characteristic.lsl,
                Characteristic.target_value,
                Characteristic.subgroup_size,
            ).where(Characteristic.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "name": row.name,
                    "usl": row.usl,
                    "lsl": row.lsl,
                    "target": row.target_value,
                    "subgroup_size": row.subgroup_size,
                }
        elif resource_type == "plant":
            from cassini.db.models.plant import Plant

            stmt = select(
                Plant.id,
                Plant.name,
                Plant.code,
            ).where(Plant.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "name": row.name,
                    "code": row.code,
                }
        elif resource_type == "hierarchy_node":
            from cassini.db.models.hierarchy import Hierarchy

            stmt = select(
                Hierarchy.id,
                Hierarchy.name,
                Hierarchy.type,
                Hierarchy.parent_id,
            ).where(Hierarchy.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "name": row.name,
                    "type": row.type,
                    "parent_id": row.parent_id,
                }
        elif resource_type == "material":
            from cassini.db.models.material import Material

            stmt = select(
                Material.id,
                Material.code,
                Material.name,
                Material.plant_id,
            ).where(Material.id == resource_id)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "code": row.code,
                    "name": row.name,
                    "plant_id": row.plant_id,
                }
        else:
            raise ValueError(f"Unknown resource type for signature: {resource_type}")

        # If we matched a known type but the record wasn't found, return
        # minimal content so the hash is still deterministic.
        return {"resource_id": resource_id}

    async def check_workflow_required(
        self,
        session: AsyncSession,
        resource_type: str,
        plant_id: int,
    ) -> bool:
        """Check if a signature workflow is required for a resource type at a plant.

        Returns True if any active, required workflow exists for the given
        resource_type and plant_id.
        """
        stmt = select(SignatureWorkflow.id).where(
            SignatureWorkflow.resource_type == resource_type,
            SignatureWorkflow.is_active == True,  # noqa: E712
            SignatureWorkflow.is_required == True,  # noqa: E712
            SignatureWorkflow.plant_id == plant_id,
        ).limit(1)
        result = await session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def expire_stale_workflows(self, session: AsyncSession) -> list[int]:
        """Find and expire workflow instances that have exceeded their timeout.

        Returns list of expired instance IDs.
        """
        now = datetime.now(timezone.utc)
        stmt = select(SignatureWorkflowInstance).where(
            SignatureWorkflowInstance.status.in_(["pending", "in_progress"]),
            SignatureWorkflowInstance.expires_at < now,
        )
        result = await session.execute(stmt)
        instances = list(result.scalars().all())

        expired_ids = []
        for inst in instances:
            inst.status = "expired"
            inst.completed_at = now
            expired_ids.append(inst.id)

            if self._event_bus:
                await self._event_bus.publish(
                    WorkflowExpiredEvent(
                        workflow_instance_id=inst.id,
                        resource_type=inst.resource_type,
                        resource_id=inst.resource_id,
                    )
                )

        if expired_ids:
            await session.flush()
            logger.info("workflows_expired", count=len(expired_ids), ids=expired_ids)

        return expired_ids

    async def initiate_workflow(
        self,
        resource_type: str,
        resource_id: int,
        initiated_by: int,
        plant_id: int,
    ) -> SignatureWorkflowInstance:
        """Create a workflow instance for a signable action."""
        workflow = await self._workflow_repo.get_by_resource_type(plant_id, resource_type)
        if workflow is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active workflow for resource type '{resource_type}' at this plant",
            )

        steps = await self._step_repo.get_for_workflow(workflow.id)
        expires_at = None
        if steps:
            first_step = steps[0]
            if first_step.timeout_hours:
                expires_at = datetime.now(timezone.utc) + timedelta(hours=first_step.timeout_hours)

        instance = await self._instance_repo.create(
            workflow_id=workflow.id,
            resource_type=resource_type,
            resource_id=resource_id,
            status="pending",
            current_step=1,
            initiated_by=initiated_by,
            expires_at=expires_at,
        )

        logger.info(
            "workflow_initiated",
            workflow_id=workflow.id,
            instance_id=instance.id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        return instance

    async def _check_password_expiry(self, user: User, plant_id: int) -> None:
        """Check if the user's password has expired per the plant's policy.

        Raises HTTP 403 if the password is expired.
        """
        from cassini.db.models.signature import PasswordPolicy

        policy_result = await self._session.execute(
            select(PasswordPolicy).where(PasswordPolicy.plant_id == plant_id)
        )
        policy = policy_result.scalar_one_or_none()
        if policy is None or policy.password_expiry_days <= 0:
            return

        if user.password_changed_at is None:
            # Never set — treat as expired if policy requires expiry
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password has expired. Please reset your password before signing.",
            )

        expiry_threshold = user.password_changed_at + timedelta(days=policy.password_expiry_days)
        # Normalize for SQLite which strips tzinfo
        if expiry_threshold.tzinfo is None:
            expiry_threshold = expiry_threshold.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry_threshold:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password has expired. Please reset your password before signing.",
            )

    async def sign(
        self,
        workflow_instance_id: int,
        user: User,
        password: str,
        meaning_code: str,
        plant_id: int,
        comment: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> ElectronicSignature:
        """Execute a signature on the current workflow step.

        0. Check password expiry
        1. Verify password
        2. Check user meets minimum role for this step
        3. Check not self-signing (if disallowed)
        4. Compute resource hash
        5. Create signature record
        6. Advance workflow
        7. Publish events
        """
        # Check account lockout before any password operations
        if user.locked_until and user.locked_until.tzinfo is None:
            locked = user.locked_until.replace(tzinfo=timezone.utc)
        else:
            locked = user.locked_until
        if locked and datetime.now(timezone.utc) < locked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is temporarily locked due to too many failed attempts",
            )

        # Check password expiry before attempting verification
        await self._check_password_expiry(user, plant_id)

        # Verify password with lockout tracking
        if not verify_password(password, user.hashed_password):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            # Check lockout policy — MUST be plant-scoped. A multi-plant
            # install with different policies per plant otherwise picks
            # whichever policy SQLite happens to return first, governing
            # the wrong site.
            from cassini.db.models.signature import PasswordPolicy
            policy_result = await self._session.execute(
                select(PasswordPolicy).where(PasswordPolicy.plant_id == plant_id)
            )
            policy = policy_result.scalar_one_or_none()
            if (
                policy
                and policy.max_failed_attempts > 0
                and user.failed_login_count >= policy.max_failed_attempts
            ):
                user.locked_until = datetime.now(timezone.utc) + timedelta(
                    minutes=policy.lockout_duration_minutes
                )
            await self._session.flush()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password for signature",
            )

        # Load workflow instance with workflow and steps
        instance = await self._instance_repo.get_with_workflow(workflow_instance_id)
        if instance is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow instance not found",
            )

        if instance.status not in ("pending", "in_progress"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Workflow is '{instance.status}', cannot sign",
            )

        # Check expiration
        if instance.expires_at and datetime.now(timezone.utc) > instance.expires_at:
            instance.status = "expired"
            instance.completed_at = datetime.now(timezone.utc)
            await self._session.flush()
            if self._event_bus:
                await self._event_bus.publish(
                    WorkflowExpiredEvent(
                        workflow_instance_id=workflow_instance_id,
                        resource_type=instance.resource_type,
                        resource_id=instance.resource_id,
                    )
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow has expired",
            )

        # Get current step
        steps = sorted(instance.workflow.steps, key=lambda s: s.step_order)
        current_step = None
        for step in steps:
            if step.step_order == instance.current_step:
                current_step = step
                break

        if current_step is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current workflow step not found",
            )

        # Check role
        min_level = ROLE_HIERARCHY.get(current_step.min_role, 0)
        user_level = get_user_role_level_for_plant(user, plant_id)
        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Minimum role '{current_step.min_role}' required for this step",
            )

        # Check self-sign
        if not current_step.allow_self_sign:
            existing_sigs = await self._sig_repo.get_by_resource(
                instance.resource_type, instance.resource_id
            )
            for sig in existing_sigs:
                if sig.user_id == user.id and sig.workflow_step_id is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Self-signing is not allowed for this workflow step",
                    )

        # Get meaning
        meaning = await self._meaning_repo.get_by_code(plant_id, meaning_code)
        if meaning is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown meaning code '{meaning_code}'",
            )

        if meaning.requires_comment and not comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Comment is required for meaning '{meaning_code}'",
            )

        # Compute hashes
        resource_data = await self.load_resource_content(
            self._session, instance.resource_type, instance.resource_id
        )
        resource_hash = compute_resource_hash(instance.resource_type, resource_data)
        now = datetime.now(timezone.utc)
        signature_hash = compute_signature_hash(
            user.id, now, meaning_code, resource_hash
        )

        # Create signature
        sig = await self._sig_repo.create(
            user_id=user.id,
            username=user.username,
            full_name=getattr(user, "full_name", None),
            timestamp=now,
            meaning_code=meaning_code,
            meaning_display=meaning.display_name,
            resource_type=instance.resource_type,
            resource_id=instance.resource_id,
            resource_hash=resource_hash,
            signature_hash=signature_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            workflow_step_id=current_step.id,
            comment=comment,
        )

        # Update last signature auth timestamp
        user.last_signature_auth_at = now
        await self._session.flush()

        # Advance workflow
        next_step_order = instance.current_step + 1
        has_next = any(s.step_order == next_step_order for s in steps)

        if has_next:
            instance.status = "in_progress"
            instance.current_step = next_step_order
            # Update expiration for next step
            next_step = next((s for s in steps if s.step_order == next_step_order), None)
            if next_step and next_step.timeout_hours:
                instance.expires_at = now + timedelta(hours=next_step.timeout_hours)
        else:
            instance.status = "completed"
            instance.completed_at = now

        await self._session.flush()

        # Publish events
        if self._event_bus:
            await self._event_bus.publish(
                SignatureCreatedEvent(
                    signature_id=sig.id,
                    user_id=user.id,
                    username=user.username,
                    resource_type=instance.resource_type,
                    resource_id=instance.resource_id,
                    meaning_code=meaning_code,
                    workflow_instance_id=workflow_instance_id,
                )
            )
            if instance.status == "completed":
                await self._event_bus.publish(
                    WorkflowCompletedEvent(
                        workflow_instance_id=workflow_instance_id,
                        resource_type=instance.resource_type,
                        resource_id=instance.resource_id,
                    )
                )

        logger.info(
            "signature_created",
            signature_id=sig.id,
            user=user.username,
            resource_type=instance.resource_type,
            resource_id=instance.resource_id,
            workflow_status=instance.status,
        )

        return sig

    async def sign_standalone(
        self,
        resource_type: str,
        resource_id: int,
        user: User,
        password: str,
        meaning_code: str,
        plant_id: int,
        comment: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> ElectronicSignature:
        """Execute a standalone signature (no workflow)."""
        # Check account lockout before any password operations
        if user.locked_until and user.locked_until.tzinfo is None:
            locked = user.locked_until.replace(tzinfo=timezone.utc)
        else:
            locked = user.locked_until
        if locked and datetime.now(timezone.utc) < locked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is temporarily locked due to too many failed attempts",
            )

        # Check password expiry before attempting verification
        await self._check_password_expiry(user, plant_id)

        if not verify_password(password, user.hashed_password):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            # Plant-scoped lockout policy lookup — see sign() for rationale.
            from cassini.db.models.signature import PasswordPolicy
            policy_result = await self._session.execute(
                select(PasswordPolicy).where(PasswordPolicy.plant_id == plant_id)
            )
            policy = policy_result.scalar_one_or_none()
            if (
                policy
                and policy.max_failed_attempts > 0
                and user.failed_login_count >= policy.max_failed_attempts
            ):
                user.locked_until = datetime.now(timezone.utc) + timedelta(
                    minutes=policy.lockout_duration_minutes
                )
            await self._session.flush()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password for signature",
            )

        meaning = await self._meaning_repo.get_by_code(plant_id, meaning_code)
        if meaning is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown meaning code '{meaning_code}'",
            )

        if meaning.requires_comment and not comment:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Comment is required for meaning '{meaning_code}'",
            )

        resource_data = await self.load_resource_content(
            self._session, resource_type, resource_id
        )
        resource_hash = compute_resource_hash(resource_type, resource_data)
        now = datetime.now(timezone.utc)
        signature_hash = compute_signature_hash(
            user.id, now, meaning_code, resource_hash
        )

        sig = await self._sig_repo.create(
            user_id=user.id,
            username=user.username,
            full_name=getattr(user, "full_name", None),
            timestamp=now,
            meaning_code=meaning_code,
            meaning_display=meaning.display_name,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_hash=resource_hash,
            signature_hash=signature_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            workflow_step_id=None,
            comment=comment,
        )

        user.last_signature_auth_at = now
        await self._session.flush()

        if self._event_bus:
            await self._event_bus.publish(
                SignatureCreatedEvent(
                    signature_id=sig.id,
                    user_id=user.id,
                    username=user.username,
                    resource_type=resource_type,
                    resource_id=resource_id,
                    meaning_code=meaning_code,
                    workflow_instance_id=None,
                )
            )

        logger.info(
            "standalone_signature_created",
            signature_id=sig.id,
            user=user.username,
            resource_type=resource_type,
            resource_id=resource_id,
        )

        return sig

    async def reject(
        self,
        workflow_instance_id: int,
        user: User,
        password: str,
        reason: str,
        plant_id: int,
        ip_address: str | None = None,
    ) -> None:
        """Reject a workflow at the current step."""
        # Check account lockout before any password operations
        if user.locked_until and user.locked_until.tzinfo is None:
            locked = user.locked_until.replace(tzinfo=timezone.utc)
        else:
            locked = user.locked_until
        if locked and datetime.now(timezone.utc) < locked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is temporarily locked due to too many failed attempts",
            )

        # Check password expiry before authenticating — rejection is a
        # signed action under 21 CFR Part 11 and MUST require a current
        # password, just like sign() and sign_standalone().
        await self._check_password_expiry(user, plant_id)

        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid password for rejection",
            )

        instance = await self._instance_repo.get_with_workflow(workflow_instance_id)
        if instance is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workflow instance not found",
            )

        if instance.status not in ("pending", "in_progress"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Workflow is '{instance.status}', cannot reject",
            )

        # Check role for current step
        steps = sorted(instance.workflow.steps, key=lambda s: s.step_order)
        current_step = next(
            (s for s in steps if s.step_order == instance.current_step), None
        )
        if current_step:
            min_level = ROLE_HIERARCHY.get(current_step.min_role, 0)
            user_level = get_user_role_level_for_plant(user, plant_id)
            if user_level < min_level:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Minimum role '{current_step.min_role}' required to reject this step",
                )

        instance.status = "rejected"
        instance.completed_at = datetime.now(timezone.utc)
        await self._session.flush()

        if self._event_bus:
            await self._event_bus.publish(
                SignatureRejectedEvent(
                    workflow_instance_id=workflow_instance_id,
                    user_id=user.id,
                    username=user.username,
                    resource_type=instance.resource_type,
                    resource_id=instance.resource_id,
                    reason=reason,
                )
            )

        logger.info(
            "workflow_rejected",
            instance_id=workflow_instance_id,
            user=user.username,
            reason=reason,
        )

    async def check_pending_for_user(
        self,
        user: User,
        plant_id: int,
    ) -> list[SignatureWorkflowInstance]:
        """Get all pending workflows the user can sign at a given plant."""
        instances = await self._instance_repo.get_pending(plant_id=plant_id)
        user_level = get_user_role_level_for_plant(user, plant_id)

        result = []
        for inst in instances:
            steps = sorted(inst.workflow.steps, key=lambda s: s.step_order)
            current_step = next(
                (s for s in steps if s.step_order == inst.current_step), None
            )
            if current_step is None:
                continue
            min_level = ROLE_HIERARCHY.get(current_step.min_role, 0)
            if user_level >= min_level:
                result.append(inst)
        return result

    async def check_workflow_complete(
        self,
        resource_type: str,
        resource_id: int,
    ) -> bool:
        """Check if a completed workflow instance exists for this resource.

        Returns True if at least one workflow instance with status 'completed'
        exists for the given resource_type and resource_id.
        """
        instances = await self._instance_repo.get_for_resource(
            resource_type, resource_id
        )
        return any(inst.status == "completed" for inst in instances)

    async def get_or_create_pending_workflow(
        self,
        resource_type: str,
        resource_id: int,
        initiated_by: int,
        plant_id: int,
        *,
        invalidate_prior: bool = False,
    ) -> SignatureWorkflowInstance:
        """Return an existing pending/in_progress workflow, or create a new one.

        Prevents duplicate workflow instances when an endpoint is retried
        before the previous workflow is completed.

        If *invalidate_prior* is True and a **new** instance must be created,
        prior signatures for the resource are invalidated first.  This does
        NOT happen when an existing pending instance is reused (the user may
        already be mid-signing).
        """
        instances = await self._instance_repo.get_for_resource(
            resource_type, resource_id
        )
        for inst in instances:
            if inst.status in ("pending", "in_progress"):
                return inst

        if invalidate_prior:
            await self.invalidate_signatures_for_resource(
                resource_type, resource_id,
                reason=f"{resource_type} workflow — new signature cycle",
            )

        return await self.initiate_workflow(
            resource_type, resource_id, initiated_by, plant_id,
        )

    async def invalidate_signatures_for_resource(
        self,
        resource_type: str,
        resource_id: int,
        reason: str,
    ) -> list[int]:
        """Mark all valid signatures for a resource as invalid."""
        invalidated_ids = await self._sig_repo.invalidate_for_resource(
            resource_type, resource_id, reason
        )
        if invalidated_ids and self._event_bus:
            await self._event_bus.publish(
                SignatureInvalidatedEvent(
                    resource_type=resource_type,
                    resource_id=resource_id,
                    invalidated_signature_ids=invalidated_ids,
                    reason=reason,
                )
            )
        return invalidated_ids

    async def verify_signature(self, signature_id: int) -> dict:
        """Verify a signature's full chain-of-custody integrity.

        Performs two independent checks:
        1. Resource hash — has the signed resource been modified since signing?
        2. Signature hash — can the stored signature_hash be recomputed from
           (user_id, timestamp, meaning_code, resource_hash)?

        Returns a structured dict suitable for the SignatureVerificationResult schema.
        """
        sig = await self._sig_repo.get_by_id(signature_id)
        if sig is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Signature not found",
            )

        # 1. Recompute resource hash from current content
        resource_data = await self.load_resource_content(
            self._session, sig.resource_type, sig.resource_id
        )
        current_resource_hash = compute_resource_hash(sig.resource_type, resource_data)
        resource_hash_valid = sig.resource_hash == current_resource_hash

        # 2. Recompute signature hash from stored fields
        expected_sig_hash = compute_signature_hash(
            sig.user_id, sig.timestamp, sig.meaning_code, sig.resource_hash
        )
        signature_hash_valid = sig.signature_hash == expected_sig_hash

        # Tamper-free requires both hashes to match
        is_tamper_free = resource_hash_valid and signature_hash_valid

        return {
            "signature_id": sig.id,
            "is_tamper_free": is_tamper_free,
            "resource_hash_valid": resource_hash_valid,
            "signature_hash_valid": signature_hash_valid,
            "signed_by": sig.username,
            "signed_at": sig.timestamp.isoformat() if sig.timestamp else "",
            "meaning": sig.meaning_display,
            "resource_type": sig.resource_type,
            "resource_id": str(sig.resource_id),
        }


def _get_signature_key_path() -> Path:
    """Return the absolute path to the signature HMAC key file.

    Resolved relative to the stable data directory (CASSINI_DATA_DIR or
    the default `<backend>/data` dir) — NEVER relative to CWD.

    Resolving relative to CWD (the previous behaviour) created a 21 CFR
    Part 11 §11.10(e) compliance hole: starting uvicorn from a different
    directory caused a fresh key to be generated, permanently invalidating
    every prior signature (`is_tamper_free=False` on all historical
    records).
    """
    from cassini.core.config import get_data_dir

    return get_data_dir() / ".signature_key"


# Module-level cache so the path is resolved once and stays consistent
# even if CWD changes mid-process.
_signature_key_cache: bytes | None = None
_signature_key_path_cache: Path | None = None


def _get_signature_key() -> bytes:
    """Load or generate the server-side signature HMAC key.

    Stored in the stable data directory at `.signature_key`. Once resolved,
    the path is cached for the life of the process — preventing the
    CWD-relative regeneration bug that would silently invalidate all
    historical signatures.
    """
    global _signature_key_cache, _signature_key_path_cache

    if _signature_key_cache is not None:
        return _signature_key_cache

    key_file = _get_signature_key_path()
    _signature_key_path_cache = key_file

    if key_file.exists():
        # NOTE: legacy keys may have trailing whitespace from a previous
        # implementation that wrote bytes naively; strip only newline
        # whitespace, NOT arbitrary bytes that happen to be 0x0d / 0x09.
        # We persist as base64 below to avoid this category of bug.
        raw = key_file.read_bytes()
        # If the file looks like base64 (length % 4 == 0 of ascii chars),
        # decode it. Otherwise treat as legacy raw bytes (decode failed -> use as-is).
        try:
            text = raw.decode("ascii").strip()
            import base64

            _signature_key_cache = base64.b64decode(text, validate=True)
        except (UnicodeDecodeError, ValueError):
            _signature_key_cache = raw  # legacy raw-byte file
        return _signature_key_cache

    # First-time generation: ensure the data dir exists, write the key,
    # and lock down permissions where the OS supports it. Persist as
    # base64 ASCII so the file is robust to whitespace stripping and
    # easy to inspect/back up by operators.
    import base64

    key_file.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_bytes(32)
    key_file.write_bytes(base64.b64encode(key) + b"\n")
    try:
        key_file.chmod(0o600)
    except OSError:
        # chmod isn't always available on Windows
        pass

    logger.info(
        "signature_key_generated",
        path=str(key_file),
        msg="Signature HMAC key generated. Back this file up — losing it "
            "permanently invalidates every historical electronic signature.",
    )
    _signature_key_cache = key
    return key


def verify_signature_key_path(*, signatures_exist: bool) -> Path:
    """Verify the signature key file is readable and consistent.

    Called at app startup (see ``cassini.main``). Behaviour:

    * Logs the resolved key path so operators can confirm it.
    * If signatures already exist in the database but the key file is
      missing, raise RuntimeError so uvicorn fails fast with a clear
      error rather than silently regenerating a fresh key (which would
      mark every historical signature as tampered).
    * If the key file is missing AND no signatures exist yet, this is
      a fresh install: do nothing — the key will be generated lazily on
      the first sign() call.

    Returns the resolved key path.
    """
    key_file = _get_signature_key_path()
    logger.info("signature_key_path_resolved", path=str(key_file))

    if signatures_exist and not key_file.exists():
        raise RuntimeError(
            f"Cassini signature HMAC key not found at {key_file} but "
            "historical electronic signatures exist in the database. "
            "Auto-regenerating the key would mark every prior signature "
            "as tampered (21 CFR Part 11 §11.10(e) violation). Restore "
            "the original .signature_key file from backup, or set "
            "CASSINI_DATA_DIR to point at the directory containing it. "
            "Refusing to start."
        )
    return key_file


def compute_resource_hash(resource_type: str, resource_data: dict) -> str:
    """Compute HMAC-SHA256 hash of resource content with server-side secret.

    Uses sorted JSON serialization for consistency across
    Python versions and platforms.
    """
    canonical = json.dumps(
        {"type": resource_type, **resource_data},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    key = _get_signature_key()
    return hmac_module.new(key, canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def compute_signature_hash(
    user_id: int,
    timestamp: datetime,
    meaning_code: str,
    resource_hash: str,
) -> str:
    """Compute HMAC-SHA256 tamper-detection hash binding signature to record."""
    # Normalize to UTC naive for deterministic hashing across all DB backends
    ts = timestamp
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
    canonical = json.dumps(
        {
            "user_id": user_id,
            "timestamp": ts.isoformat(),
            "meaning_code": meaning_code,
            "resource_hash": resource_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    key = _get_signature_key()
    return hmac_module.new(key, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
