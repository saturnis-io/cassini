"""Repository for ElectronicSignature, SignatureMeaning, and PasswordPolicy models."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.db.models.signature import (
    ElectronicSignature,
    PasswordPolicy,
    SignatureMeaning,
)
from openspc.db.repositories.base import BaseRepository


class SignatureRepository(BaseRepository[ElectronicSignature]):
    """CRUD operations for electronic signatures."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ElectronicSignature)

    async def get_by_resource(
        self,
        resource_type: str,
        resource_id: int,
    ) -> list[ElectronicSignature]:
        """Get all signatures for a resource, ordered by timestamp."""
        stmt = (
            select(ElectronicSignature)
            .where(
                ElectronicSignature.resource_type == resource_type,
                ElectronicSignature.resource_id == resource_id,
            )
            .order_by(ElectronicSignature.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_signature_hash(self, signature_hash: str) -> ElectronicSignature | None:
        """Look up a signature by its unique hash."""
        stmt = select(ElectronicSignature).where(
            ElectronicSignature.signature_hash == signature_hash
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_valid_for_resource(
        self,
        resource_type: str,
        resource_id: int,
    ) -> list[ElectronicSignature]:
        """Get all valid (non-invalidated) signatures for a resource."""
        stmt = (
            select(ElectronicSignature)
            .where(
                ElectronicSignature.resource_type == resource_type,
                ElectronicSignature.resource_id == resource_id,
                ElectronicSignature.is_valid == True,  # noqa: E712
            )
            .order_by(ElectronicSignature.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_history(
        self,
        plant_id: int | None = None,
        resource_type: str | None = None,
        user_id: int | None = None,
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[ElectronicSignature], int]:
        """Get signature history with optional filters. Returns (items, total)."""
        base = select(ElectronicSignature)
        count_base = select(func.count()).select_from(ElectronicSignature)

        if resource_type is not None:
            base = base.where(ElectronicSignature.resource_type == resource_type)
            count_base = count_base.where(ElectronicSignature.resource_type == resource_type)
        if user_id is not None:
            base = base.where(ElectronicSignature.user_id == user_id)
            count_base = count_base.where(ElectronicSignature.user_id == user_id)

        total = (await self.session.execute(count_base)).scalar_one()

        stmt = base.order_by(ElectronicSignature.timestamp.desc()).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    async def invalidate_for_resource(
        self,
        resource_type: str,
        resource_id: int,
        reason: str,
    ) -> list[int]:
        """Mark all valid signatures for a resource as invalid. Returns invalidated IDs."""
        sigs = await self.get_valid_for_resource(resource_type, resource_id)
        invalidated_ids = []
        now = datetime.now()
        for sig in sigs:
            sig.is_valid = False
            sig.invalidated_at = now
            sig.invalidated_reason = reason
            invalidated_ids.append(sig.id)
        await self.session.flush()
        return invalidated_ids

    async def get_for_workflow_step(self, workflow_step_id: int) -> list[ElectronicSignature]:
        """Get signatures for a specific workflow step."""
        stmt = (
            select(ElectronicSignature)
            .where(ElectronicSignature.workflow_step_id == workflow_step_id)
            .order_by(ElectronicSignature.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


class SignatureMeaningRepository(BaseRepository[SignatureMeaning]):
    """CRUD operations for signature meanings."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SignatureMeaning)

    async def get_for_plant(
        self,
        plant_id: int,
        active_only: bool = True,
    ) -> list[SignatureMeaning]:
        """Get all meanings for a plant, ordered by sort_order."""
        stmt = (
            select(SignatureMeaning)
            .where(SignatureMeaning.plant_id == plant_id)
        )
        if active_only:
            stmt = stmt.where(SignatureMeaning.is_active == True)  # noqa: E712
        stmt = stmt.order_by(SignatureMeaning.sort_order.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_code(
        self,
        plant_id: int,
        code: str,
    ) -> SignatureMeaning | None:
        """Look up a meaning by plant and code."""
        stmt = select(SignatureMeaning).where(
            SignatureMeaning.plant_id == plant_id,
            SignatureMeaning.code == code,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()


class PasswordPolicyRepository(BaseRepository[PasswordPolicy]):
    """CRUD operations for password policies."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, PasswordPolicy)

    async def get_for_plant(self, plant_id: int) -> PasswordPolicy | None:
        """Get the password policy for a plant."""
        stmt = select(PasswordPolicy).where(PasswordPolicy.plant_id == plant_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert(self, plant_id: int, **kwargs) -> PasswordPolicy:
        """Create or update the password policy for a plant."""
        existing = await self.get_for_plant(plant_id)
        if existing:
            for key, value in kwargs.items():
                if hasattr(existing, key) and value is not None:
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        policy = PasswordPolicy(plant_id=plant_id, **kwargs)
        self.session.add(policy)
        await self.session.flush()
        await self.session.refresh(policy)
        return policy
