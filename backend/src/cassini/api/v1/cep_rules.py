"""CEP (Complex Event Processing) rule REST endpoints.

Plant-scoped CRUD plus a stand-alone YAML validation endpoint so the
Monaco editor can show inline diagnostics without a round-trip through
the persistence path.

Authorization: every read requires plant access; every write requires
``engineer`` role at the target plant. The plant is taken from query
parameters or the request body but ALWAYS cross-checked against the
authenticated user's plant_roles via ``check_plant_role``.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_engineer,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.cep import (
    CepRuleCreate,
    CepRuleResponse,
    CepRuleSpec,
    CepRuleUpdate,
    CepRuleValidateRequest,
    CepRuleValidateResponse,
)
from cassini.core.cep import CepYamlError, load_rule_from_yaml
from cassini.db.models.cep_rule import CepRule
from cassini.db.models.user import User
from cassini.db.repositories.cep_rule import CepRuleRepository


logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/cep_rules", tags=["cep-rules"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_repo(session: AsyncSession = Depends(get_db_session)) -> CepRuleRepository:
    return CepRuleRepository(session)


def _to_response(rule: CepRule, spec: CepRuleSpec) -> CepRuleResponse:
    return CepRuleResponse(
        id=rule.id,
        plant_id=rule.plant_id,
        name=rule.name,
        description=rule.description,
        yaml_text=rule.yaml_text,
        enabled=rule.enabled,
        parsed=spec,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


async def _reload_engine_for_plant(request: Request, plant_id: int) -> None:
    """Trigger a hot-reload of the CEP engine for a plant.

    No-op when the engine isn't attached to ``app.state`` (community
    edition or test harness without engine wiring).
    """
    engine = getattr(request.app.state, "cep_engine", None)
    if engine is None:
        return
    try:
        await engine.reload_rules_for_plant(plant_id)
    except Exception:
        logger.warning("cep_engine_reload_failed", exc_info=True)


# ---------------------------------------------------------------------------
# Validation endpoint — no DB write, supports the editor's lint loop
# ---------------------------------------------------------------------------


@router.post("/validate", response_model=CepRuleValidateResponse)
async def validate_yaml(
    payload: CepRuleValidateRequest,
    _user: User = Depends(get_current_user),
) -> CepRuleValidateResponse:
    """Validate YAML without persisting. Returns structured marker errors."""
    try:
        spec = load_rule_from_yaml(payload.yaml_text)
    except CepYamlError as exc:
        return CepRuleValidateResponse(valid=False, errors=exc.errors, parsed=None)
    return CepRuleValidateResponse(valid=True, errors=[], parsed=spec)


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=list[CepRuleResponse])
async def list_rules(
    plant_id: int = Query(..., description="Plant ID to filter rules by"),
    repo: CepRuleRepository = Depends(_get_repo),
    user: User = Depends(get_current_user),
) -> list[CepRuleResponse]:
    """List CEP rules for a plant. Operator-or-higher access required."""
    check_plant_role(user, plant_id, "operator")
    rows = await repo.list_for_plant(plant_id)
    out: list[CepRuleResponse] = []
    for rule in rows:
        try:
            spec = CepRuleSpec.model_validate_json(rule.parsed_json)
        except Exception:
            try:
                spec = load_rule_from_yaml(rule.yaml_text)
            except CepYamlError:
                logger.warning(
                    "cep_rule_corrupt_skipping",
                    extra={"rule_id": rule.id, "plant_id": rule.plant_id},
                )
                continue
        out.append(_to_response(rule, spec))
    return out


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------


@router.get("/{rule_id}", response_model=CepRuleResponse)
async def get_rule(
    rule_id: int,
    plant_id: int = Query(..., description="Plant ID"),
    repo: CepRuleRepository = Depends(_get_repo),
    user: User = Depends(get_current_user),
) -> CepRuleResponse:
    check_plant_role(user, plant_id, "operator")
    rule = await repo.get_for_plant(plant_id, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CEP rule not found"
        )
    try:
        spec = CepRuleSpec.model_validate_json(rule.parsed_json)
    except Exception:
        try:
            spec = load_rule_from_yaml(rule.yaml_text)
        except CepYamlError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Stored rule is corrupted; please re-upload via PUT.",
            ) from exc
    return _to_response(rule, spec)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post("", response_model=CepRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: CepRuleCreate,
    request: Request,
    repo: CepRuleRepository = Depends(_get_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> CepRuleResponse:
    check_plant_role(user, payload.plant_id, "engineer")

    try:
        spec = load_rule_from_yaml(payload.yaml_text)
    except CepYamlError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid CEP rule YAML", "errors": exc.errors},
        ) from exc

    try:
        rule = await repo.create_rule(
            plant_id=payload.plant_id,
            name=spec.name,
            description=spec.description,
            yaml_text=payload.yaml_text,
            parsed_json=spec.model_dump_json(),
            enabled=payload.enabled,
        )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A CEP rule named '{spec.name}' already exists for this plant.",
        ) from exc

    await session.commit()

    request.state.audit_context = {
        "resource_type": "cep_rule",
        "resource_id": rule.id,
        "action": "create",
        "summary": f"Created CEP rule '{spec.name}'",
        "fields": {
            "plant_id": payload.plant_id,
            "rule_name": spec.name,
            "enabled": payload.enabled,
            "condition_count": len(spec.conditions),
        },
    }

    await _reload_engine_for_plant(request, payload.plant_id)
    return _to_response(rule, spec)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.put("/{rule_id}", response_model=CepRuleResponse)
async def update_rule(
    rule_id: int,
    payload: CepRuleUpdate,
    request: Request,
    plant_id: int = Query(..., description="Plant ID"),
    repo: CepRuleRepository = Depends(_get_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> CepRuleResponse:
    check_plant_role(user, plant_id, "engineer")

    if payload.yaml_text is None and payload.enabled is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of 'yaml_text' or 'enabled' must be provided",
        )

    new_name: str | None = None
    new_description: str | None = None
    new_parsed_json: str | None = None
    spec: CepRuleSpec | None = None

    if payload.yaml_text is not None:
        try:
            spec = load_rule_from_yaml(payload.yaml_text)
        except CepYamlError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Invalid CEP rule YAML", "errors": exc.errors},
            ) from exc
        new_name = spec.name
        new_description = spec.description
        new_parsed_json = spec.model_dump_json()

    try:
        rule = await repo.update_rule(
            plant_id=plant_id,
            rule_id=rule_id,
            name=new_name,
            description=new_description,
            yaml_text=payload.yaml_text,
            parsed_json=new_parsed_json,
            enabled=payload.enabled,
        )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another CEP rule with this name already exists for the plant.",
        ) from exc

    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CEP rule not found"
        )
    await session.commit()

    # If we didn't have a fresh spec (only enabled flipped), parse from
    # the now-current parsed_json so the response stays correct.
    if spec is None:
        try:
            spec = CepRuleSpec.model_validate_json(rule.parsed_json)
        except Exception:
            spec = load_rule_from_yaml(rule.yaml_text)

    action = "update"
    if payload.yaml_text is None and payload.enabled is False:
        action = "disable"
    elif payload.yaml_text is None and payload.enabled is True:
        action = "enable"

    request.state.audit_context = {
        "resource_type": "cep_rule",
        "resource_id": rule.id,
        "action": action,
        "summary": f"Updated CEP rule '{rule.name}'",
        "fields": {
            "plant_id": plant_id,
            "rule_name": rule.name,
            "enabled": rule.enabled,
        },
    }

    await _reload_engine_for_plant(request, plant_id)
    return _to_response(rule, spec)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    request: Request,
    plant_id: int = Query(..., description="Plant ID"),
    repo: CepRuleRepository = Depends(_get_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> None:
    check_plant_role(user, plant_id, "engineer")

    rule = await repo.get_for_plant(plant_id, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CEP rule not found"
        )
    rule_name = rule.name

    await repo.delete_for_plant(plant_id, rule_id)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "cep_rule",
        "resource_id": rule_id,
        "action": "delete",
        "summary": f"Deleted CEP rule '{rule_name}'",
        "fields": {"plant_id": plant_id, "rule_name": rule_name},
    }

    # Drop from the engine cache and trigger a plant reload so any
    # leftover state is cleaned up.
    engine = getattr(request.app.state, "cep_engine", None)
    if engine is not None:
        try:
            engine.remove_rule(rule_id)
        except Exception:
            logger.debug("cep_engine_remove_failed", exc_info=True)
    await _reload_engine_for_plant(request, plant_id)
