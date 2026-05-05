"""Repository for CEP rule CRUD with plant-scoped queries.

All queries are plant-scoped. Callers MUST pass a ``plant_id`` derived
from the authenticated user's authorization context — the model layer
trusts that filter and never cross-checks against the request body.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.cep_rule import CepRule
from cassini.db.repositories.base import BaseRepository


class CepRuleRepository(BaseRepository[CepRule]):
    """Async CRUD repository for ``cep_rule`` rows."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, CepRule)

    async def list_for_plant(self, plant_id: int) -> list[CepRule]:
        """Return all CEP rules for a plant, ordered by name for stable UI."""
        stmt = (
            select(CepRule)
            .where(CepRule.plant_id == plant_id)
            .order_by(CepRule.name)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_for_plant(self, plant_id: int, rule_id: int) -> Optional[CepRule]:
        """Return a single CEP rule, scoped to the plant. ``None`` if not found."""
        stmt = select(CepRule).where(
            CepRule.id == rule_id, CepRule.plant_id == plant_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_rule(
        self,
        *,
        plant_id: int,
        name: str,
        description: Optional[str],
        yaml_text: str,
        parsed_json: str,
        enabled: bool,
    ) -> CepRule:
        """Create a CEP rule. Raises on (plant_id, name) duplicate."""
        rule = CepRule(
            plant_id=plant_id,
            name=name,
            description=description,
            yaml_text=yaml_text,
            parsed_json=parsed_json,
            enabled=enabled,
        )
        self.session.add(rule)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise
        await self.session.refresh(rule)
        return rule

    async def update_rule(
        self,
        *,
        plant_id: int,
        rule_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        yaml_text: Optional[str] = None,
        parsed_json: Optional[str] = None,
        enabled: Optional[bool] = None,
    ) -> Optional[CepRule]:
        """Partial update — returns the refreshed row, or None if not found."""
        rule = await self.get_for_plant(plant_id, rule_id)
        if rule is None:
            return None
        if name is not None:
            rule.name = name
        if description is not None:
            rule.description = description
        if yaml_text is not None:
            rule.yaml_text = yaml_text
        if parsed_json is not None:
            rule.parsed_json = parsed_json
        if enabled is not None:
            rule.enabled = enabled
        await self.session.flush()
        await self.session.refresh(rule)
        return rule

    async def delete_for_plant(self, plant_id: int, rule_id: int) -> bool:
        """Delete a rule. Returns True if a row was deleted."""
        rule = await self.get_for_plant(plant_id, rule_id)
        if rule is None:
            return False
        await self.session.delete(rule)
        await self.session.flush()
        return True
