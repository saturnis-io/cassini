"""Plant compliance enforcement for license plant limits.

Tracks how many active plants exist vs. the license limit, and provides
a cache on app.state for the compliance middleware to read without
hitting the database on every request.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.licensing import LicenseService
from cassini.db.repositories.plant import PlantRepository

logger = structlog.get_logger(__name__)


@dataclass
class PlantComplianceInfo:
    """Per-plant compliance information."""

    plant_id: int
    plant_name: str
    plant_code: str
    is_active: bool
    characteristic_count: int
    sample_count: int


@dataclass
class ComplianceStatus:
    """Overall compliance status."""

    max_plants: int
    active_plant_count: int
    total_plant_count: int
    excess: int  # max(0, active_plant_count - max_plants)
    plants: list[PlantComplianceInfo] = field(default_factory=list)


async def get_compliance_status(
    session: AsyncSession,
    license_service: LicenseService,
) -> ComplianceStatus:
    """Compute the current compliance status.

    Args:
        session: Database session for querying plants.
        license_service: License service for max_plants limit.

    Returns:
        ComplianceStatus with per-plant details.
    """
    repo = PlantRepository(session)
    stats = await repo.get_compliance_stats()

    max_plants = license_service.max_plants
    active_count = sum(1 for s in stats if s["is_active"])
    total_count = len(stats)
    excess = max(0, active_count - max_plants)

    plants = [
        PlantComplianceInfo(
            plant_id=s["plant_id"],
            plant_name=s["plant_name"],
            plant_code=s["plant_code"],
            is_active=s["is_active"],
            characteristic_count=s["characteristic_count"],
            sample_count=s["sample_count"],
        )
        for s in stats
    ]

    return ComplianceStatus(
        max_plants=max_plants,
        active_plant_count=active_count,
        total_plant_count=total_count,
        excess=excess,
        plants=plants,
    )


async def refresh_compliance_cache(app: FastAPI, session: AsyncSession) -> int:
    """Refresh the compliance excess value cached on app.state.

    Args:
        app: FastAPI application instance.
        session: Database session.

    Returns:
        The computed excess value (0 means compliant).
    """
    license_service: LicenseService = app.state.license_service
    status = await get_compliance_status(session, license_service)
    app.state.compliance_excess = status.excess

    if status.excess > 0:
        logger.warning(
            "compliance_excess",
            active_plants=status.active_plant_count,
            max_plants=status.max_plants,
            excess=status.excess,
        )
    else:
        logger.info(
            "compliance_ok",
            active_plants=status.active_plant_count,
            max_plants=status.max_plants,
        )

    return status.excess
