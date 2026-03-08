"""Anomaly detection API endpoints.

Provides configuration, event viewing, acknowledgment, dismissal,
on-demand analysis, and plant-wide dashboard endpoints.
"""

from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.anomaly import (
    AcknowledgeRequest,
    AnalysisResultResponse,
    AnomalyConfigResponse,
    AnomalyConfigUpdate,
    AnomalyEventListResponse,
    AnomalyEventResponse,
    AnomalyStatusResponse,
    AnomalySummaryResponse,
    DashboardEventResponse,
    DashboardStatsResponse,
    DetectorStatusResponse,
    DismissRequest,
)
from cassini.db.models.anomaly import AnomalyEvent, AnomalyModelState
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.user import User
from cassini.db.repositories.anomaly import (
    AnomalyConfigRepository,
    AnomalyEventRepository,
    AnomalyModelStateRepository,
)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/anomaly", tags=["anomaly"])


# ---------------------------------------------------------------------------
# Helper: get characteristic IDs accessible to user for a plant
# ---------------------------------------------------------------------------
async def _get_plant_char_ids(
    session: AsyncSession, user: User
) -> list[int]:
    """Get all characteristic IDs accessible to the user."""
    # Get plant IDs the user has access to
    plant_ids = [pr.plant_id for pr in user.plant_roles]
    if not plant_ids:
        return []

    stmt = (
        select(Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .where(Hierarchy.plant_id.in_(plant_ids))
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _get_char_name(session: AsyncSession, char_id: int) -> str:
    """Get characteristic name by ID."""
    stmt = select(Characteristic.name).where(Characteristic.id == char_id)
    result = await session.execute(stmt)
    name = result.scalar_one_or_none()
    return name or f"Characteristic {char_id}"


# ===========================================================================
# DASHBOARD ROUTES (static paths — MUST come before /{char_id} routes)
# ===========================================================================


@router.get("/dashboard", response_model=list[DashboardEventResponse])
async def get_dashboard_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[DashboardEventResponse]:
    """Get all active anomaly events across accessible plants.

    Requires supervisor+ role at any plant.
    """
    check_plant_role(user, user.plant_roles[0].plant_id if user.plant_roles else 0, "supervisor")

    char_ids = await _get_plant_char_ids(session, user)
    repo = AnomalyEventRepository(session)
    events = await repo.get_active_events_for_plant(char_ids, offset, limit)

    result = []
    for event in events:
        char_name = await _get_char_name(session, event.char_id)
        result.append(
            DashboardEventResponse(
                id=event.id,
                char_id=event.char_id,
                characteristic_name=char_name,
                detector_type=event.detector_type,
                event_type=event.event_type,
                severity=event.severity,
                summary=event.summary,
                is_acknowledged=event.is_acknowledged,
                detected_at=event.detected_at,
            )
        )

    return result


@router.get("/dashboard/stats", response_model=DashboardStatsResponse)
async def get_dashboard_stats(
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> DashboardStatsResponse:
    """Get summary statistics for anomaly events across accessible plants.

    Requires supervisor+ role at any plant.
    """
    check_plant_role(user, user.plant_roles[0].plant_id if user.plant_roles else 0, "supervisor")

    char_ids = await _get_plant_char_ids(session, user)
    repo = AnomalyEventRepository(session)
    stats = await repo.get_stats_for_plant(char_ids)

    return DashboardStatsResponse(**stats)


# ===========================================================================
# CONFIGURATION ROUTES
# ===========================================================================


@router.get("/{char_id}/config", response_model=AnomalyConfigResponse)
async def get_config(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyConfigResponse:
    """Get anomaly detector configuration for a characteristic.

    Requires supervisor+ role for the characteristic's plant.
    Returns default configuration if none exists.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "supervisor")

    repo = AnomalyConfigRepository(session)
    config = await repo.get_by_char_id(char_id)

    if config is None:
        # Return defaults by creating a transient config
        config = await repo.upsert(char_id)
        await session.commit()

    return AnomalyConfigResponse.model_validate(config)


@router.put("/{char_id}/config", response_model=AnomalyConfigResponse)
async def update_config(
    char_id: int,
    body: AnomalyConfigUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyConfigResponse:
    """Update anomaly detector configuration for a characteristic.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    repo = AnomalyConfigRepository(session)
    update_data = body.model_dump(exclude_unset=True)

    config = await repo.upsert(char_id, **update_data)
    await session.commit()

    logger.info(
        "anomaly_config_updated",
        char_id=char_id,
        user=user.username,
        fields=list(update_data.keys()),
    )

    request.state.audit_context = {
        "resource_type": "anomaly",
        "resource_id": char_id,
        "action": "update",
        "summary": f"Anomaly config updated for characteristic {char_id}",
        "fields": {
            "char_id": char_id,
            "updated_fields": list(update_data.keys()),
            **{k: v for k, v in update_data.items() if isinstance(v, (str, int, float, bool, type(None)))},
        },
    }

    return AnomalyConfigResponse.model_validate(config)


@router.delete("/{char_id}/config", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def reset_config(
    char_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Reset anomaly detector configuration to defaults.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    repo = AnomalyConfigRepository(session)
    await repo.delete_by_char_id(char_id)
    await session.commit()

    logger.info(
        "anomaly_config_reset",
        char_id=char_id,
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "anomaly",
        "resource_id": char_id,
        "action": "delete",
        "summary": f"Anomaly config reset to defaults for characteristic {char_id}",
        "fields": {
            "char_id": char_id,
        },
    }


# ===========================================================================
# EVENT ROUTES
# ===========================================================================


@router.get("/{char_id}/events", response_model=AnomalyEventListResponse)
async def list_events(
    char_id: int,
    detector_type: str | None = Query(None),
    severity: str | None = Query(None),
    acknowledged: bool | None = Query(None),
    dismissed: bool | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyEventListResponse:
    """List anomaly events for a characteristic with pagination and filters.

    Requires operator+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "operator")

    repo = AnomalyEventRepository(session)
    events = await repo.get_events(
        char_id=char_id,
        detector_type=detector_type,
        severity=severity,
        acknowledged=acknowledged,
        dismissed=dismissed,
        offset=offset,
        limit=limit,
    )
    total = await repo.count_events(
        char_id=char_id,
        detector_type=detector_type,
        severity=severity,
        acknowledged=acknowledged,
        dismissed=dismissed,
    )

    return AnomalyEventListResponse(
        events=[AnomalyEventResponse.model_validate(e) for e in events],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/{char_id}/events/{event_id}", response_model=AnomalyEventResponse)
async def get_event(
    char_id: int,
    event_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyEventResponse:
    """Get a single anomaly event detail.

    Requires operator+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "operator")

    repo = AnomalyEventRepository(session)
    event = await repo.get_by_id(event_id)

    if event is None or event.char_id != char_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly event {event_id} not found for characteristic {char_id}",
        )

    return AnomalyEventResponse.model_validate(event)


@router.post(
    "/{char_id}/events/{event_id}/acknowledge",
    response_model=AnomalyEventResponse,
)
async def acknowledge_event(
    char_id: int,
    event_id: int,
    request: Request,
    body: AcknowledgeRequest = AcknowledgeRequest(),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyEventResponse:
    """Acknowledge an anomaly event.

    Requires operator+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "operator")

    repo = AnomalyEventRepository(session)
    event = await repo.get_by_id(event_id)

    if event is None or event.char_id != char_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly event {event_id} not found",
        )

    event = await repo.acknowledge(event_id, user.username)
    await session.commit()

    logger.info(
        "anomaly_event_acknowledged",
        event_id=event_id,
        user=user.username,
    )

    request.state.audit_context = {
        "resource_type": "anomaly",
        "resource_id": event_id,
        "action": "acknowledge",
        "summary": f"Anomaly event {event_id} acknowledged for characteristic {char_id}",
        "fields": {
            "event_id": event_id,
            "char_id": char_id,
            "detector_type": event.detector_type,
            "severity": event.severity,
        },
    }

    return AnomalyEventResponse.model_validate(event)


@router.post(
    "/{char_id}/events/{event_id}/dismiss",
    response_model=AnomalyEventResponse,
)
async def dismiss_event(
    char_id: int,
    event_id: int,
    request: Request,
    body: DismissRequest = DismissRequest(),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyEventResponse:
    """Dismiss an anomaly event as a false positive.

    Requires engineer+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    repo = AnomalyEventRepository(session)
    event = await repo.get_by_id(event_id)

    if event is None or event.char_id != char_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly event {event_id} not found",
        )

    event = await repo.dismiss(event_id, user.username, body.reason)
    await session.commit()

    logger.info(
        "anomaly_event_dismissed",
        event_id=event_id,
        user=user.username,
        reason=body.reason,
    )

    request.state.audit_context = {
        "resource_type": "anomaly",
        "resource_id": event_id,
        "action": "dismiss",
        "summary": f"Anomaly event {event_id} dismissed for characteristic {char_id}",
        "fields": {
            "event_id": event_id,
            "char_id": char_id,
            "detector_type": event.detector_type,
            "severity": event.severity,
            "reason": body.reason,
        },
    }

    return AnomalyEventResponse.model_validate(event)


# ===========================================================================
# SUMMARY AND STATUS ROUTES
# ===========================================================================


@router.get("/{char_id}/summary", response_model=AnomalySummaryResponse)
async def get_summary(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalySummaryResponse:
    """Get AI summary and detector status for a characteristic.

    Requires supervisor+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "supervisor")

    char_name = await _get_char_name(session, char_id)
    config_repo = AnomalyConfigRepository(session)
    event_repo = AnomalyEventRepository(session)

    config = await config_repo.get_by_char_id(char_id)

    # Active anomalies count
    active_count = await event_repo.count_events(
        char_id=char_id, dismissed=False
    )

    # Latest event for summary text
    latest = await event_repo.get_latest_for_char(char_id)
    latest_summary = latest.summary if latest else "No anomalies detected."
    last_analysis_at = latest.detected_at if latest else None

    # Build detector status list
    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    detectors: list[DetectorStatusResponse] = []

    # PELT status
    pelt_last = await event_repo.get_latest_for_char(char_id, "pelt")
    pelt_24h = await _count_events_since(
        session, char_id, "pelt", cutoff_24h
    )
    detectors.append(
        DetectorStatusResponse(
            detector_type="pelt",
            enabled=config.pelt_enabled if config else True,
            last_detection_at=pelt_last.detected_at if pelt_last else None,
            events_last_24h=pelt_24h,
        )
    )

    # Isolation Forest status
    iforest_last = await event_repo.get_latest_for_char(
        char_id, "isolation_forest"
    )
    iforest_24h = await _count_events_since(
        session, char_id, "isolation_forest", cutoff_24h
    )
    # Get model age
    model_state = await session.execute(
        select(AnomalyModelState).where(
            AnomalyModelState.char_id == char_id,
            AnomalyModelState.detector_type == "isolation_forest",
        )
    )
    model = model_state.scalar_one_or_none()
    detectors.append(
        DetectorStatusResponse(
            detector_type="isolation_forest",
            enabled=config.iforest_enabled if config else False,
            last_detection_at=(
                iforest_last.detected_at if iforest_last else None
            ),
            model_age_samples=(
                model.training_samples if model else None
            ),
            events_last_24h=iforest_24h,
        )
    )

    # K-S status
    ks_last = await event_repo.get_latest_for_char(char_id, "ks_test")
    ks_24h = await _count_events_since(
        session, char_id, "ks_test", cutoff_24h
    )
    detectors.append(
        DetectorStatusResponse(
            detector_type="ks_test",
            enabled=config.ks_enabled if config else True,
            last_detection_at=ks_last.detected_at if ks_last else None,
            events_last_24h=ks_24h,
        )
    )

    return AnomalySummaryResponse(
        characteristic_id=char_id,
        characteristic_name=char_name,
        active_anomalies=active_count,
        latest_summary=latest_summary,
        detectors=detectors,
        last_analysis_at=last_analysis_at,
    )


@router.get("/{char_id}/status", response_model=AnomalyStatusResponse)
async def get_status(
    char_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnomalyStatusResponse:
    """Get detector status for a characteristic.

    Requires supervisor+ role for the characteristic's plant.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "supervisor")

    config_repo = AnomalyConfigRepository(session)
    event_repo = AnomalyEventRepository(session)

    config = await config_repo.get_by_char_id(char_id)
    is_enabled = config.is_enabled if config else False

    total_events = await event_repo.count_events(char_id=char_id)
    active_events = await event_repo.count_events(
        char_id=char_id, dismissed=False
    )

    latest = await event_repo.get_latest_for_char(char_id)
    last_event_at = latest.detected_at if latest else None

    now = datetime.now(timezone.utc)
    cutoff_24h = now - timedelta(hours=24)

    detectors: list[DetectorStatusResponse] = []

    for det_type, enabled_check in [
        ("pelt", config.pelt_enabled if config else True),
        ("isolation_forest", config.iforest_enabled if config else False),
        ("ks_test", config.ks_enabled if config else True),
    ]:
        det_last = await event_repo.get_latest_for_char(char_id, det_type)
        det_24h = await _count_events_since(
            session, char_id, det_type, cutoff_24h
        )

        model_samples = None
        if det_type == "isolation_forest":
            ms_result = await session.execute(
                select(AnomalyModelState).where(
                    AnomalyModelState.char_id == char_id,
                    AnomalyModelState.detector_type == "isolation_forest",
                )
            )
            ms = ms_result.scalar_one_or_none()
            model_samples = ms.training_samples if ms else None

        detectors.append(
            DetectorStatusResponse(
                detector_type=det_type,
                enabled=enabled_check,
                last_detection_at=(
                    det_last.detected_at if det_last else None
                ),
                model_age_samples=model_samples,
                events_last_24h=det_24h,
            )
        )

    return AnomalyStatusResponse(
        characteristic_id=char_id,
        is_enabled=is_enabled,
        detectors=detectors,
        total_events=total_events,
        active_events=active_events,
        last_event_at=last_event_at,
    )


# ===========================================================================
# ANALYSIS TRIGGER
# ===========================================================================


@router.post("/{char_id}/analyze", response_model=AnalysisResultResponse)
async def trigger_analysis(
    char_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> AnalysisResultResponse:
    """Trigger on-demand full anomaly analysis for a characteristic.

    Requires engineer+ role for the characteristic's plant.
    Runs all enabled detectors and returns detected anomalies.
    """
    plant_id = await resolve_plant_id_for_characteristic(char_id, session)
    check_plant_role(user, plant_id, "engineer")

    # Get the anomaly detector from app state
    detector = getattr(request.app.state, "anomaly_detector", None)
    if detector is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Anomaly detection service not initialized",
        )

    results = await detector.analyze_characteristic(session, char_id)
    await session.commit()

    # Fetch the persisted events for the response
    event_repo = AnomalyEventRepository(session)
    events = await event_repo.get_events(
        char_id=char_id, offset=0, limit=len(results) if results else 10
    )

    logger.info(
        "anomaly_analysis_triggered",
        char_id=char_id,
        user=user.username,
        events_detected=len(results),
    )

    request.state.audit_context = {
        "resource_type": "anomaly",
        "resource_id": char_id,
        "action": "analyze",
        "summary": f"On-demand anomaly analysis for characteristic {char_id} ({len(results)} events detected)",
        "fields": {
            "char_id": char_id,
            "events_detected": len(results),
        },
    }

    return AnalysisResultResponse(
        characteristic_id=char_id,
        events_detected=len(results),
        events=[AnomalyEventResponse.model_validate(e) for e in events[: len(results)]],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _count_events_since(
    session: AsyncSession,
    char_id: int,
    detector_type: str,
    since: datetime,
) -> int:
    """Count events for a detector type since a given datetime."""
    from sqlalchemy import func as sa_func

    stmt = (
        select(sa_func.count())
        .select_from(AnomalyEvent)
        .where(
            AnomalyEvent.char_id == char_id,
            AnomalyEvent.detector_type == detector_type,
            AnomalyEvent.detected_at >= since,
        )
    )
    result = await session.execute(stmt)
    return result.scalar_one()
