"""System settings API endpoints."""

import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_admin, get_current_user, get_db_session
from cassini.api.schemas.system_settings import (
    SystemSettingsResponse,
    SystemSettingsUpdate,
)
from cassini.db.models.system_settings import SystemSettings
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/system-settings", tags=["system-settings"])


@router.get("/", response_model=SystemSettingsResponse)
async def get_system_settings(
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> SystemSettingsResponse:
    """Get system-wide settings. Any authenticated user can read."""
    result = await session.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        return SystemSettingsResponse(
            date_format="YYYY-MM-DD",
            datetime_format="YYYY-MM-DD HH:mm:ss",
            updated_at=datetime.now(timezone.utc),
        )
    return SystemSettingsResponse.model_validate(settings)


@router.put("/", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_admin),
) -> SystemSettingsResponse:
    """Update system-wide settings. Admin only."""
    result = await session.execute(select(SystemSettings).where(SystemSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = SystemSettings(id=1)
        session.add(settings)

    if data.date_format is not None:
        settings.date_format = data.date_format
    if data.datetime_format is not None:
        settings.datetime_format = data.datetime_format

    await session.commit()
    await session.refresh(settings)
    logger.info(
        "system_settings_updated",
        date_format=settings.date_format,
        datetime_format=settings.datetime_format,
    )
    return SystemSettingsResponse.model_validate(settings)
