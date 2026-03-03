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

            stmt = select(
                FAIReport.status,
                FAIReport.part_number,
                func.count(FAIItem.id).label("items_count"),
            ).outerjoin(FAIItem, FAIItem.report_id == FAIReport.id).where(
                FAIReport.id == resource_id
            ).group_by(FAIReport.id, FAIReport.status, FAIReport.part_number)
            result = await session.execute(stmt)
            row = result.first()
            if row:
                return {
                    "resource_id": resource_id,
                    "status": row.status,
                    "part_number": row.part_number,
                    "items_count": row.items_count,
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

        1. Verify password
        2. Check user meets minimum role for this step
        3. Check not self-signing (if disallowed)
        4. Compute resource hash
        5. Create signature record
        6. Advance workflow
        7. Publish events
        """
        # Verify password with lockout tracking
        if not verify_password(password, user.hashed_password):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            # Check lockout policy
            from cassini.db.models.signature import PasswordPolicy
            policy_result = await self._session.execute(
                select(PasswordPolicy).limit(1)
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
        if not verify_password(password, user.hashed_password):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            from cassini.db.models.signature import PasswordPolicy
            policy_result = await self._session.execute(
                select(PasswordPolicy).limit(1)
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
        """Verify a signature's integrity by recomputing hashes."""
        sig = await self._sig_repo.get_by_id(signature_id)
        if sig is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Signature not found",
            )

        # Recompute resource hash from current content
        resource_data = await self.load_resource_content(
            self._session, sig.resource_type, sig.resource_id
        )
        current_resource_hash = compute_resource_hash(sig.resource_type, resource_data)
        expected_sig_hash = compute_signature_hash(
            sig.user_id, sig.timestamp, sig.meaning_code, sig.resource_hash
        )

        return {
            "signature_id": sig.id,
            "is_valid": sig.is_valid,
            "signer_name": sig.username,
            "full_name": sig.full_name,
            "timestamp": sig.timestamp,
            "meaning": sig.meaning_display,
            "resource_type": sig.resource_type,
            "resource_id": sig.resource_id,
            "stored_hash": sig.resource_hash,
            "current_hash": current_resource_hash,
            "hash_match": sig.resource_hash == current_resource_hash,
            "signature_chain_valid": sig.signature_hash == expected_sig_hash,
        }


def _get_signature_key() -> bytes:
    """Load or generate the server-side signature HMAC key.

    Stored in `.signature_key` file, similar to `.jwt_secret` pattern.
    """
    key_file = Path(".signature_key")
    if key_file.exists():
        return key_file.read_bytes().strip()
    key = secrets.token_bytes(32)
    key_file.write_bytes(key)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key


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
    canonical = json.dumps(
        {
            "user_id": user_id,
            "timestamp": timestamp.isoformat(),
            "meaning_code": meaning_code,
            "resource_hash": resource_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    key = _get_signature_key()
    return hmac_module.new(key, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
