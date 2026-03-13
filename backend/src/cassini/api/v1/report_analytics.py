"""Report analytics endpoints.

Provides plant-wide health analytics for the Plant Health Report
(commercial-only template). Aggregates capability, violation, and
stability data across all characteristics in a plant.
"""

from datetime import datetime, timedelta, timezone

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, case, and_
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import get_current_user, get_db_session, check_plant_role
from cassini.api.schemas.report_analytics import (
    CharacteristicHealthItem,
    HealthSummaryResponse,
    PlantHealthResponse,
)
from cassini.db.models.capability import CapabilityHistory
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Sample
from cassini.db.models.user import User
from cassini.db.models.violation import Violation

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/reports/analytics", tags=["report-analytics"])


def _compute_risk_score(
    cpk: float | None,
    ppk: float | None,
    in_control_pct: float,
    violation_count: int,
    unacknowledged_count: int,
) -> float:
    """Weighted risk score: 0 = healthy, 100 = critical.

    Weights:
      - Capability gap (40%): distance from Cpk 1.33 target
      - Stability (30%): OOC percentage
      - Violations (20%): total violation count (capped)
      - Unacknowledged (10%): unresolved violations (capped)
    """
    best_cpk = cpk if cpk is not None else ppk
    if best_cpk is not None:
        cap_gap = max(0.0, min(100.0, (1.33 - best_cpk) / 1.33 * 100))
    else:
        cap_gap = 50.0  # Unknown = moderate risk

    ooc_pct = max(0.0, min(100.0, 100.0 - in_control_pct))
    stability_score = min(100.0, ooc_pct * 5)  # 20% OOC = max score

    violation_score = min(100.0, violation_count * 2.0)
    unack_score = min(100.0, unacknowledged_count * 5.0)

    return round(
        cap_gap * 0.40
        + stability_score * 0.30
        + violation_score * 0.20
        + unack_score * 0.10,
        1,
    )


def _health_status(risk_score: float) -> str:
    if risk_score >= 50:
        return "critical"
    if risk_score >= 25:
        return "warning"
    return "good"


async def _build_hierarchy_path(
    char: Characteristic,
    session: AsyncSession,
    path_cache: dict[int, str],
) -> str:
    """Build 'Plant > Line > Station' path by walking parent chain."""
    node = char.hierarchy
    if not node:
        return "Unknown"

    if node.id in path_cache:
        return path_cache[node.id]

    parts: list[str] = [node.name]
    current = node
    while current.parent_id is not None:
        if current.parent_id in path_cache:
            parts.append(path_cache[current.parent_id])
            break
        parent_result = await session.execute(
            select(Hierarchy).where(Hierarchy.id == current.parent_id)
        )
        parent = parent_result.scalar_one_or_none()
        if not parent:
            break
        parts.append(parent.name)
        current = parent

    path = " > ".join(reversed(parts))
    path_cache[node.id] = path
    return path


@router.get("/plant-health", response_model=PlantHealthResponse)
async def get_plant_health(
    plant_id: int = Query(..., description="Plant ID"),
    window_days: int = Query(30, ge=1, le=365, description="Lookback window in days"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
):
    """Get plant-wide health analytics for the Plant Health Report."""
    check_plant_role(user, plant_id, "operator")

    plant_result = await session.execute(
        select(Plant).where(Plant.id == plant_id)
    )
    plant = plant_result.scalar_one_or_none()
    if not plant:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plant not found")

    cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

    # Load all characteristics for this plant via hierarchy
    from sqlalchemy.orm import selectinload
    char_stmt = (
        select(Characteristic)
        .options(selectinload(Characteristic.hierarchy))
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
        .where(Hierarchy.plant_id == plant_id)
    )
    char_result = await session.execute(char_stmt)
    characteristics = char_result.scalars().all()

    if not characteristics:
        return PlantHealthResponse(
            plant_id=plant_id,
            plant_name=plant.name,
            generated_at=datetime.now(timezone.utc).isoformat(),
            window_days=window_days,
            total_characteristics=0,
            summary=HealthSummaryResponse(
                good_count=0, warning_count=0, critical_count=0,
            ),
            characteristics=[],
        )

    char_ids = [c.id for c in characteristics]

    # Batch: sample counts + last_sample_at per characteristic within window
    sample_stats_stmt = (
        select(
            Sample.char_id,
            func.count(Sample.id).label("sample_count"),
            func.max(Sample.timestamp).label("last_sample_at"),
        )
        .where(Sample.char_id.in_(char_ids))
        .where(Sample.timestamp >= cutoff)
        .group_by(Sample.char_id)
    )
    sample_stats = await session.execute(sample_stats_stmt)
    sample_map: dict[int, tuple[int, datetime | None]] = {}
    for row in sample_stats:
        sample_map[row.char_id] = (row.sample_count, row.last_sample_at)

    # Batch: violation counts per characteristic within window
    violation_stats_stmt = (
        select(
            Violation.char_id,
            func.count(Violation.id).label("violation_count"),
            func.sum(
                case((Violation.acknowledged == False, 1), else_=0)  # noqa: E712
            ).label("unacknowledged_count"),
        )
        .where(Violation.char_id.in_(char_ids))
        .where(Violation.created_at >= cutoff)
        .group_by(Violation.char_id)
    )
    violation_stats = await session.execute(violation_stats_stmt)
    violation_map: dict[int, tuple[int, int]] = {}
    for row in violation_stats:
        violation_map[row.char_id] = (row.violation_count, row.unacknowledged_count or 0)

    # Batch: OOC sample count (distinct samples with violations) per characteristic
    ooc_stmt = (
        select(
            Violation.char_id,
            func.count(func.distinct(Violation.sample_id)).label("ooc_samples"),
        )
        .where(Violation.char_id.in_(char_ids))
        .where(Violation.created_at >= cutoff)
        .group_by(Violation.char_id)
    )
    ooc_result = await session.execute(ooc_stmt)
    ooc_map: dict[int, int] = {}
    for row in ooc_result:
        ooc_map[row.char_id] = row.ooc_samples

    # Latest capability snapshot per characteristic (subquery for max calculated_at)
    latest_sub = (
        select(
            CapabilityHistory.characteristic_id,
            func.max(CapabilityHistory.calculated_at).label("max_at"),
        )
        .where(CapabilityHistory.characteristic_id.in_(char_ids))
        .group_by(CapabilityHistory.characteristic_id)
        .subquery()
    )
    cap_raw = await session.execute(
        select(CapabilityHistory)
        .join(
            latest_sub,
            and_(
                CapabilityHistory.characteristic_id == latest_sub.c.characteristic_id,
                CapabilityHistory.calculated_at == latest_sub.c.max_at,
            ),
        )
    )
    cap_map: dict[int, tuple[float | None, float | None]] = {}
    for snap in cap_raw.scalars():
        cap_map[snap.characteristic_id] = (snap.cpk, snap.ppk)

    # Build hierarchy paths with caching
    path_cache: dict[int, str] = {}

    items: list[CharacteristicHealthItem] = []
    for char in characteristics:
        sample_count, last_at = sample_map.get(char.id, (0, None))
        v_count, unack_count = violation_map.get(char.id, (0, 0))
        ooc_samples = ooc_map.get(char.id, 0)
        cpk, ppk = cap_map.get(char.id, (None, None))

        in_control_pct = (
            round((1.0 - ooc_samples / sample_count) * 100, 1)
            if sample_count > 0
            else 100.0
        )

        risk = _compute_risk_score(cpk, ppk, in_control_pct, v_count, unack_count)
        hierarchy_path = await _build_hierarchy_path(char, session, path_cache)

        items.append(
            CharacteristicHealthItem(
                characteristic_id=char.id,
                name=char.name,
                hierarchy_path=hierarchy_path,
                data_type=char.data_type or "variable",
                cpk=round(cpk, 4) if cpk is not None else None,
                ppk=round(ppk, 4) if ppk is not None else None,
                in_control_pct=in_control_pct,
                sample_count=sample_count,
                violation_count=v_count,
                unacknowledged_count=unack_count,
                risk_score=risk,
                health_status=_health_status(risk),
                last_sample_at=last_at.isoformat() if last_at else None,
            )
        )

    # Sort by risk_score descending (worst first)
    items.sort(key=lambda x: x.risk_score, reverse=True)

    # Build summary
    good = sum(1 for i in items if i.health_status == "good")
    warning = sum(1 for i in items if i.health_status == "warning")
    critical = sum(1 for i in items if i.health_status == "critical")

    cpk_values = [i.cpk for i in items if i.cpk is not None]
    avg_cpk = round(sum(cpk_values) / len(cpk_values), 4) if cpk_values else None
    worst = items[0] if items else None

    return PlantHealthResponse(
        plant_id=plant_id,
        plant_name=plant.name,
        generated_at=datetime.now(timezone.utc).isoformat(),
        window_days=window_days,
        total_characteristics=len(items),
        summary=HealthSummaryResponse(
            good_count=good,
            warning_count=warning,
            critical_count=critical,
            avg_cpk=avg_cpk,
            worst_characteristic=worst.name if worst else None,
            worst_cpk=worst.cpk if worst else None,
        ),
        characteristics=items,
    )
