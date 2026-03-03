"""Rule preset REST endpoints for Cassini.

Provides listing, retrieval, creation, and application of Nelson Rule presets
(builtin + plant-scoped custom presets).
"""

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    get_current_engineer,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
    check_plant_role,
)
from cassini.api.schemas.rule_preset import (
    ApplyPresetRequest,
    CreatePresetRequest,
    PresetResponse,
    RuleConfigItem,
)
from cassini.db.models.characteristic import CharacteristicRule
from cassini.db.models.rule_preset import RulePreset
from cassini.db.models.user import User
from cassini.db.repositories import CharacteristicRepository

router = APIRouter(prefix="/api/v1", tags=["rules"])


# ---- Helpers ----

def _parse_preset(preset: RulePreset) -> PresetResponse:
    """Convert a RulePreset ORM object to a response model."""
    rules = json.loads(preset.rules_config) if isinstance(preset.rules_config, str) else preset.rules_config
    return PresetResponse(
        id=preset.id,
        name=preset.name,
        description=preset.description,
        is_builtin=preset.is_builtin,
        rules_config=[RuleConfigItem(**r) for r in rules],
        plant_id=preset.plant_id,
    )


# ---- Endpoints ----

@router.get("/rule-presets", response_model=list[PresetResponse])
async def list_presets(
    plant_id: int | None = Query(None, description="Filter by plant ID"),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[PresetResponse]:
    """List all presets (builtins + global user-created + plant-specific)."""
    conditions = [
        RulePreset.is_builtin.is_(True),
        RulePreset.plant_id.is_(None),
    ]
    if plant_id is not None:
        conditions.append(RulePreset.plant_id == plant_id)

    stmt = select(RulePreset).where(or_(*conditions)).order_by(RulePreset.id)
    result = await session.execute(stmt)
    presets = list(result.scalars().all())
    return [_parse_preset(p) for p in presets]


@router.get("/rule-presets/{preset_id}", response_model=PresetResponse)
async def get_preset(
    preset_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> PresetResponse:
    """Get a single preset by ID."""
    stmt = select(RulePreset).where(RulePreset.id == preset_id)
    result = await session.execute(stmt)
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {preset_id} not found",
        )
    return _parse_preset(preset)


@router.post("/rule-presets", response_model=PresetResponse, status_code=status.HTTP_201_CREATED)
async def create_preset(
    body: CreatePresetRequest,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> PresetResponse:
    """Create a custom preset (engineer+). Cannot create builtin presets."""
    preset = RulePreset(
        name=body.name,
        description=body.description,
        is_builtin=False,
        rules_config=json.dumps([r.model_dump() for r in body.rules_config]),
        plant_id=body.plant_id,
    )
    session.add(preset)
    await session.commit()
    await session.refresh(preset)
    return _parse_preset(preset)


@router.put("/characteristics/{char_id}/rules/preset")
async def apply_preset(
    char_id: int,
    body: ApplyPresetRequest,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_engineer),
) -> list[dict]:
    """Apply a preset to a characteristic — upserts CharacteristicRule rows."""
    # Validate characteristic exists
    repo = CharacteristicRepository(session)
    characteristic = await repo.get_with_rules(char_id)
    if characteristic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {char_id} not found",
        )

    # Plant-scoped authorization
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(_user, plant_id, "engineer")

    # Load preset
    stmt = select(RulePreset).where(RulePreset.id == body.preset_id)
    result = await session.execute(stmt)
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Preset {body.preset_id} not found",
        )

    rules_config = json.loads(preset.rules_config) if isinstance(preset.rules_config, str) else preset.rules_config

    # Delete existing rules
    for existing_rule in characteristic.rules:
        await session.delete(existing_rule)
    await session.flush()

    # Create new rules from preset config
    created = []
    for rc in rules_config:
        params = rc.get("parameters")
        rule = CharacteristicRule(
            char_id=char_id,
            rule_id=rc["rule_id"],
            is_enabled=rc.get("is_enabled", True),
            require_acknowledgement=True,
            parameters=json.dumps(params) if params else None,
        )
        session.add(rule)
        created.append({
            "rule_id": rc["rule_id"],
            "is_enabled": rc.get("is_enabled", True),
            "require_acknowledgement": True,
            "parameters": params,
        })

    await session.commit()
    return created
