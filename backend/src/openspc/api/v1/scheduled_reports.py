"""Scheduled reports REST endpoints for OpenSPC.

Provides CRUD operations for report schedules, manual trigger, and run history.
Engineer+ role required for all operations.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    check_plant_role,
    get_current_engineer,
    get_db_session,
)
from openspc.api.schemas.scheduled_report import (
    ReportRunResponse,
    ReportScheduleCreate,
    ReportScheduleResponse,
    ReportScheduleUpdate,
)
from openspc.db.models.report_schedule import ReportSchedule
from openspc.db.models.user import User
from openspc.db.repositories.report_schedule import ReportScheduleRepository

router = APIRouter(prefix="/api/v1/reports/schedules", tags=["scheduled-reports"])


async def get_schedule_repo(
    session: AsyncSession = Depends(get_db_session),
) -> ReportScheduleRepository:
    """Dependency to get ReportScheduleRepository instance."""
    return ReportScheduleRepository(session)


def _schedule_to_response(schedule: ReportSchedule) -> ReportScheduleResponse:
    """Convert a ReportSchedule model to response schema."""
    return ReportScheduleResponse.model_validate(schedule)


# ------------------------------------------------------------------
# CRUD endpoints
# ------------------------------------------------------------------


@router.get("/", response_model=list[ReportScheduleResponse])
async def list_schedules(
    plant_id: int = Query(..., description="Plant ID"),
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    user: User = Depends(get_current_engineer),
) -> list[ReportScheduleResponse]:
    """List all report schedules for a plant. Requires engineer+."""
    check_plant_role(user, plant_id, "engineer")
    schedules = await repo.get_by_plant(plant_id)
    return [_schedule_to_response(s) for s in schedules]


@router.post("/", response_model=ReportScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ReportScheduleCreate,
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> ReportScheduleResponse:
    """Create a new report schedule. Requires engineer+."""
    check_plant_role(user, data.plant_id, "engineer")

    schedule = await repo.create(
        plant_id=data.plant_id,
        name=data.name,
        template_id=data.template_id,
        scope_type=data.scope_type.value,
        scope_id=data.scope_id,
        frequency=data.frequency.value,
        hour=data.hour,
        day_of_week=data.day_of_week,
        day_of_month=data.day_of_month,
        recipients=json.dumps(data.recipients),
        window_days=data.window_days,
        is_active=data.is_active,
        created_by=user.id,
    )
    await session.commit()
    await session.refresh(schedule)
    return _schedule_to_response(schedule)


@router.get("/{schedule_id}", response_model=ReportScheduleResponse)
async def get_schedule(
    schedule_id: int,
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    user: User = Depends(get_current_engineer),
) -> ReportScheduleResponse:
    """Get a report schedule by ID. Requires engineer+."""
    schedule = await repo.get_by_id(schedule_id)
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    check_plant_role(user, schedule.plant_id, "engineer")
    return _schedule_to_response(schedule)


@router.put("/{schedule_id}", response_model=ReportScheduleResponse)
async def update_schedule(
    schedule_id: int,
    data: ReportScheduleUpdate,
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> ReportScheduleResponse:
    """Update a report schedule. Requires engineer+."""
    schedule = await repo.get_by_id(schedule_id)
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    check_plant_role(user, schedule.plant_id, "engineer")

    update_data = data.model_dump(exclude_unset=True)

    # Convert recipients list to JSON string for storage
    if "recipients" in update_data and update_data["recipients"] is not None:
        update_data["recipients"] = json.dumps(update_data["recipients"])

    # Convert enums to values
    if "frequency" in update_data and update_data["frequency"] is not None:
        update_data["frequency"] = update_data["frequency"].value
    if "scope_type" in update_data and update_data["scope_type"] is not None:
        update_data["scope_type"] = update_data["scope_type"].value

    updated = await repo.update(schedule_id, **update_data)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    await session.commit()
    await session.refresh(updated)
    return _schedule_to_response(updated)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: int,
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_engineer),
) -> None:
    """Delete a report schedule. Requires engineer+."""
    schedule = await repo.get_by_id(schedule_id)
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    check_plant_role(user, schedule.plant_id, "engineer")

    deleted = await repo.delete(schedule_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    await session.commit()


# ------------------------------------------------------------------
# Manual trigger
# ------------------------------------------------------------------


@router.post("/{schedule_id}/trigger", response_model=ReportRunResponse)
async def trigger_report(
    schedule_id: int,
    request: Request,
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    user: User = Depends(get_current_engineer),
) -> ReportRunResponse:
    """Manually trigger a report generation. Requires engineer+."""
    schedule = await repo.get_by_id(schedule_id)
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    check_plant_role(user, schedule.plant_id, "engineer")

    report_scheduler = getattr(request.app.state, "report_scheduler", None)
    if report_scheduler is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Report scheduler is not running",
        )

    await report_scheduler.run_schedule(schedule_id)

    # Reload runs to get the latest
    from openspc.db.database import get_database

    db = get_database()
    async with db.session() as session:
        run_repo = ReportScheduleRepository(session)
        runs = await run_repo.get_runs(schedule_id, limit=1)

    if not runs:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Report triggered but no run record found",
        )
    return ReportRunResponse.model_validate(runs[0])


# ------------------------------------------------------------------
# Run history
# ------------------------------------------------------------------


@router.get("/{schedule_id}/runs", response_model=list[ReportRunResponse])
async def get_run_history(
    schedule_id: int,
    limit: int = Query(50, ge=1, le=200),
    repo: ReportScheduleRepository = Depends(get_schedule_repo),
    user: User = Depends(get_current_engineer),
) -> list[ReportRunResponse]:
    """Get run history for a report schedule. Requires engineer+."""
    schedule = await repo.get_by_id(schedule_id)
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report schedule {schedule_id} not found",
        )
    check_plant_role(user, schedule.plant_id, "engineer")

    runs = await repo.get_runs(schedule_id, limit=limit)
    return [ReportRunResponse.model_validate(r) for r in runs]
