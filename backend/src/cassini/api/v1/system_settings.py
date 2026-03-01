"""System settings API endpoints."""

import structlog
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session
from cassini.api.schemas.system_settings import (
    BrandConfigSchema,
    DisplayKeyFormatSchema,
    SystemSettingsResponse,
    SystemSettingsUpdate,
)
from cassini.db.models.plant import Plant
from cassini.db.models.system_settings import SystemSettings
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/system-settings", tags=["system-settings"])


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Deep-merge override into base. Override values win for non-None fields.

    Returns a new dict (does not mutate inputs).
    """
    merged = dict(base)
    for key, value in override.items():
        if value is None:
            continue
        if (
            key in merged
            and isinstance(merged[key], dict)
            and isinstance(value, dict)
        ):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _settings_to_response(settings: SystemSettings) -> SystemSettingsResponse:
    """Convert a SystemSettings model to a response, validating brand_config."""
    brand = None
    if settings.brand_config is not None:
        brand = BrandConfigSchema.model_validate(settings.brand_config)
    dk_format = None
    if settings.display_key_format is not None:
        dk_format = DisplayKeyFormatSchema.model_validate(settings.display_key_format)
    return SystemSettingsResponse(
        date_format=settings.date_format,
        datetime_format=settings.datetime_format,
        brand_config=brand,
        display_key_format=dk_format,
        updated_at=settings.updated_at,
    )


def _default_response() -> SystemSettingsResponse:
    """Return a default response when no settings row exists."""
    return SystemSettingsResponse(
        date_format="YYYY-MM-DD",
        datetime_format="YYYY-MM-DD HH:mm:ss",
        brand_config=None,
        display_key_format=None,
        updated_at=datetime.now(timezone.utc),
    )


# STATIC routes MUST come before any /{param} routes (FastAPI top-to-bottom matching)


@router.get("/resolved", response_model=SystemSettingsResponse)
async def get_resolved_settings(
    plant_id: int | None = None,
    session: AsyncSession = Depends(get_db_session),
) -> SystemSettingsResponse:
    """Get system settings with plant-level brand overrides merged.

    Public endpoint (no auth required) — brand config is cosmetic data
    needed before login (login page colors, logo, app name).

    If plant_id is provided and that plant has a brand_override in its
    settings JSON, the override is deep-merged onto the global brand_config
    (plant values win for non-None fields).
    """
    result = await session.execute(
        select(SystemSettings).where(SystemSettings.id == 1)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        base_response = _default_response()
    else:
        base_response = _settings_to_response(settings)

    if plant_id is None:
        return base_response

    # Fetch plant and merge brand override
    plant_result = await session.execute(
        select(Plant).where(Plant.id == plant_id)
    )
    plant = plant_result.scalar_one_or_none()
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )

    plant_settings = plant.settings or {}
    brand_override = plant_settings.get("brand_override")
    if not brand_override or not isinstance(brand_override, dict):
        return base_response

    # Deep-merge: plant override wins for non-None fields
    base_brand_dict = (
        base_response.brand_config.model_dump(exclude_none=False)
        if base_response.brand_config
        else {}
    )
    merged = _deep_merge(base_brand_dict, brand_override)
    merged_brand = BrandConfigSchema.model_validate(merged)

    return SystemSettingsResponse(
        date_format=base_response.date_format,
        datetime_format=base_response.datetime_format,
        brand_config=merged_brand,
        display_key_format=base_response.display_key_format,
        updated_at=base_response.updated_at,
    )


@router.get("/", response_model=SystemSettingsResponse)
async def get_system_settings(
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> SystemSettingsResponse:
    """Get system-wide settings. Any authenticated user can read."""
    result = await session.execute(
        select(SystemSettings).where(SystemSettings.id == 1)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        return _default_response()
    return _settings_to_response(settings)


@router.put("/", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> SystemSettingsResponse:
    """Update system-wide settings. Admin only."""
    result = await session.execute(
        select(SystemSettings).where(SystemSettings.id == 1)
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SystemSettings(id=1)
        session.add(settings)

    if data.date_format is not None:
        settings.date_format = data.date_format
    if data.datetime_format is not None:
        settings.datetime_format = data.datetime_format
    if data.brand_config is not None:
        settings.brand_config = data.brand_config.model_dump(exclude_none=False)
    if data.display_key_format is not None:
        settings.display_key_format = data.display_key_format.model_dump()

    await session.commit()
    await session.refresh(settings)
    logger.info(
        "system_settings_updated",
        date_format=settings.date_format,
        datetime_format=settings.datetime_format,
        has_brand_config=settings.brand_config is not None,
        has_display_key_format=settings.display_key_format is not None,
    )
    return _settings_to_response(settings)


@router.put("/brand-override/{plant_id}", response_model=BrandConfigSchema)
async def update_plant_brand_override(
    plant_id: int,
    data: BrandConfigSchema,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> BrandConfigSchema:
    """Set plant-specific brand override. Admin only.

    Stored in plant.settings["brand_override"]. Only non-None fields
    from the payload are persisted as overrides.
    """
    result = await session.execute(select(Plant).where(Plant.id == plant_id))
    plant = result.scalar_one_or_none()
    if plant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plant not found",
        )

    plant_settings: dict[str, Any] = dict(plant.settings) if plant.settings else {}
    plant_settings["brand_override"] = data.model_dump(exclude_none=True)
    plant.settings = plant_settings

    await session.commit()
    await session.refresh(plant)

    logger.info(
        "plant_brand_override_updated",
        plant_id=plant_id,
        plant_name=plant.name,
    )

    saved_override = (plant.settings or {}).get("brand_override", {})
    return BrandConfigSchema.model_validate(saved_override)
