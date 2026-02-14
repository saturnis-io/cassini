"""Repository for SignatureWorkflow, SignatureWorkflowStep, and SignatureWorkflowInstance."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.signature import (
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from openspc.db.repositories.base import BaseRepository


class WorkflowRepository(BaseRepository[SignatureWorkflow]):
    """CRUD operations for signature workflows."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SignatureWorkflow)

    async def get_for_plant(
        self,
        plant_id: int,
        active_only: bool = False,
    ) -> list[SignatureWorkflow]:
        """Get all workflows for a plant."""
        stmt = select(SignatureWorkflow).where(SignatureWorkflow.plant_id == plant_id)
        if active_only:
            stmt = stmt.where(SignatureWorkflow.is_active == True)  # noqa: E712
        stmt = stmt.order_by(SignatureWorkflow.name.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_resource_type(
        self,
        plant_id: int,
        resource_type: str,
    ) -> SignatureWorkflow | None:
        """Get the active workflow for a resource type at a plant."""
        stmt = (
            select(SignatureWorkflow)
            .where(
                SignatureWorkflow.plant_id == plant_id,
                SignatureWorkflow.resource_type == resource_type,
                SignatureWorkflow.is_active == True,  # noqa: E712
            )
            .options(selectinload(SignatureWorkflow.steps))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_steps(self, workflow_id: int) -> SignatureWorkflow | None:
        """Get a workflow with its steps eagerly loaded."""
        stmt = (
            select(SignatureWorkflow)
            .where(SignatureWorkflow.id == workflow_id)
            .options(selectinload(SignatureWorkflow.steps))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class WorkflowStepRepository(BaseRepository[SignatureWorkflowStep]):
    """CRUD operations for workflow steps."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SignatureWorkflowStep)

    async def get_for_workflow(self, workflow_id: int) -> list[SignatureWorkflowStep]:
        """Get all steps for a workflow, ordered by step_order."""
        stmt = (
            select(SignatureWorkflowStep)
            .where(SignatureWorkflowStep.workflow_id == workflow_id)
            .order_by(SignatureWorkflowStep.step_order.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_step_at_order(
        self,
        workflow_id: int,
        step_order: int,
    ) -> SignatureWorkflowStep | None:
        """Get a specific step by its order within a workflow."""
        stmt = select(SignatureWorkflowStep).where(
            SignatureWorkflowStep.workflow_id == workflow_id,
            SignatureWorkflowStep.step_order == step_order,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class WorkflowInstanceRepository(BaseRepository[SignatureWorkflowInstance]):
    """CRUD operations for workflow instances."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SignatureWorkflowInstance)

    async def get_for_resource(
        self,
        resource_type: str,
        resource_id: int,
    ) -> list[SignatureWorkflowInstance]:
        """Get all workflow instances for a resource."""
        stmt = (
            select(SignatureWorkflowInstance)
            .where(
                SignatureWorkflowInstance.resource_type == resource_type,
                SignatureWorkflowInstance.resource_id == resource_id,
            )
            .order_by(SignatureWorkflowInstance.initiated_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_pending(
        self,
        plant_id: int | None = None,
    ) -> list[SignatureWorkflowInstance]:
        """Get all pending/in_progress workflow instances, optionally filtered by plant."""
        stmt = (
            select(SignatureWorkflowInstance)
            .where(
                SignatureWorkflowInstance.status.in_(["pending", "in_progress"]),
            )
        )
        if plant_id is not None:
            stmt = stmt.join(SignatureWorkflow).where(
                SignatureWorkflow.plant_id == plant_id
            )
        stmt = stmt.options(
            selectinload(SignatureWorkflowInstance.workflow).selectinload(
                SignatureWorkflow.steps
            )
        )
        stmt = stmt.order_by(SignatureWorkflowInstance.initiated_at.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_workflow(
        self, instance_id: int
    ) -> SignatureWorkflowInstance | None:
        """Get an instance with its workflow and steps eagerly loaded."""
        stmt = (
            select(SignatureWorkflowInstance)
            .where(SignatureWorkflowInstance.id == instance_id)
            .options(
                selectinload(SignatureWorkflowInstance.workflow).selectinload(
                    SignatureWorkflow.steps
                )
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
