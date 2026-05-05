"""Audit log API endpoints.

Provides admin-only access to audit trail data with filtering,
pagination, CSV export, and summary statistics.
"""

import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    get_admin_plant_ids,
    get_current_admin,
    get_db_session,
)
from cassini.api.schemas.audit import (
    AuditIntegrityResult,
    AuditLogEntry,
    AuditLogListResponse,
    AuditStats,
    UserActivitySummaryResponse,
)
from cassini.core.audit import AuditService, compute_audit_hash
from cassini.core.resource_display import resolve_resource_display
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.user import User

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


# --- Static-path endpoints (must come before any /{param} routes) ---


@router.get("/health")
async def audit_health(
    request: Request,
    admin: User = Depends(get_current_admin),
):
    """Admin-only: check audit subsystem health.

    Returns failure_count, last_failure_at, and overall status
    ("healthy" or "degraded").
    """
    audit_service: AuditService = request.app.state.audit_service
    return audit_service.get_health()


@router.get("/user-activity-summary", response_model=UserActivitySummaryResponse)
async def get_user_activity_summary(
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> UserActivitySummaryResponse:
    """Get per-user activity summary for a date range. Admin-only.

    Groups audit log entries by user_id, counting logins, actions
    by type, and acknowledged violations.
    """
    # Base filter
    conditions = []
    if start_date is not None:
        conditions.append(AuditLog.timestamp >= start_date)
    if end_date is not None:
        conditions.append(AuditLog.timestamp <= end_date)

    # Total actions
    total_stmt = select(func.count(AuditLog.id))
    if conditions:
        total_stmt = total_stmt.where(*conditions)
    total_actions = (await session.execute(total_stmt)).scalar() or 0

    # Group by username: action counts
    action_stmt = select(
        AuditLog.user_id,
        AuditLog.username,
        AuditLog.action,
        func.count(AuditLog.id),
    ).group_by(AuditLog.user_id, AuditLog.username, AuditLog.action)
    if conditions:
        action_stmt = action_stmt.where(*conditions)
    action_rows = (await session.execute(action_stmt)).all()

    # Aggregate per-user
    user_map: dict[str, dict] = {}
    for user_id, username, action, count in action_rows:
        uname = username or "system"
        if uname not in user_map:
            user_map[uname] = {
                "user_id": user_id,
                "username": uname,
                "login_count": 0,
                "actions_by_type": {},
                "violations_acknowledged": 0,
            }
        entry = user_map[uname]
        entry["actions_by_type"][action] = entry["actions_by_type"].get(action, 0) + count
        if action == "login":
            entry["login_count"] += count
        if action == "acknowledge":
            entry["violations_acknowledged"] += count

    from cassini.api.schemas.audit import UserActivityEntry

    users = [UserActivityEntry(**data) for data in user_map.values()]
    # Sort by total action count descending
    users.sort(key=lambda u: sum(u.actions_by_type.values()), reverse=True)

    return UserActivitySummaryResponse(
        users=users,
        start_date=start_date,
        end_date=end_date,
        total_actions=total_actions,
    )


# --- Helpers ---

def _build_audit_query(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    plant_ids: Optional[list[int]] = None,
):
    """Build a filtered SELECT for audit_log rows.

    ``plant_ids`` is a tenant-scoping allow-list. When provided, rows are
    constrained to either a matching ``plant_id`` OR ``plant_id IS NULL``
    (system-level events such as logins are not plant-scoped and remain
    visible). Pass ``None`` to disable plant filtering (admin-everywhere).
    """
    stmt = select(AuditLog)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if resource_type is not None:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if start_date is not None:
        stmt = stmt.where(AuditLog.timestamp >= start_date)
    if end_date is not None:
        stmt = stmt.where(AuditLog.timestamp <= end_date)
    if plant_ids is not None:
        from sqlalchemy import or_

        if not plant_ids:
            # Caller has no plants: only see plant-agnostic system rows.
            stmt = stmt.where(AuditLog.plant_id.is_(None))
        else:
            stmt = stmt.where(
                or_(
                    AuditLog.plant_id.in_(plant_ids),
                    AuditLog.plant_id.is_(None),
                )
            )
    return stmt


# --- Endpoints ---

@router.get("/logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> AuditLogListResponse:
    """List audit log entries with optional filtering and pagination. Admin-only.

    Plant-scoped: results are constrained to plants the caller is *admin* at
    (plus plant-agnostic system rows like login events). Cross-plant audit
    access requires an explicit admin role at each target plant.
    """
    plant_ids = list(get_admin_plant_ids(_admin))
    base = _build_audit_query(
        user_id, action, resource_type, start_date, end_date, plant_ids=plant_ids
    )

    # Count total matching
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    # Fetch page
    stmt = base.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()

    items = []
    for r in rows:
        entry = AuditLogEntry.model_validate(r)
        # Prefer the denormalized display name stored at capture time.
        # Fall back to on-the-fly resolution for legacy entries that
        # were created before the column existed.
        if not entry.resource_display and entry.resource_type and entry.resource_id:
            entry.resource_display = await resolve_resource_display(
                session, entry.resource_type, entry.resource_id
            )
        items.append(entry)

    return AuditLogListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/verify-integrity", response_model=AuditIntegrityResult)
async def verify_audit_integrity(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> AuditIntegrityResult:
    """Verify audit log integrity by walking the SHA-256 hash chain. Admin-only.

    Checks both hash chain continuity and sequence number gaps (missing
    numbers indicate deleted records in a multi-instance deployment).
    """
    stmt = (
        select(AuditLog)
        .where(AuditLog.sequence_hash.isnot(None))
        .order_by(AuditLog.sequence_number.asc().nulls_first(), AuditLog.timestamp.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()

    if not rows:
        return AuditIntegrityResult(
            verified_count=0,
            valid=True,
            message="No hashed entries to verify",
        )

    # Check for sequence number gaps (indicates deleted records)
    sequence_gaps: list[int] = []
    for i in range(1, len(rows)):
        prev_seq = rows[i - 1].sequence_number
        curr_seq = rows[i].sequence_number
        if prev_seq is not None and curr_seq is not None:
            if curr_seq != prev_seq + 1:
                # Record all missing sequence numbers
                for gap_seq in range(prev_seq + 1, curr_seq):
                    sequence_gaps.append(gap_seq)

    if sequence_gaps:
        return AuditIntegrityResult(
            verified_count=0,
            valid=False,
            first_break_id=rows[0].id,
            first_break_timestamp=rows[0].timestamp,
            message=f"Sequence gap detected: {len(sequence_gaps)} missing entries (first missing: #{sequence_gaps[0]})",
        )

    # Walk the hash chain
    previous_hash = "0" * 64
    for i, row in enumerate(rows):
        expected = compute_audit_hash(
            previous_hash,
            row.action,
            row.resource_type,
            row.resource_id,
            row.user_id,
            row.username,
            row.timestamp,
            sequence_number=row.sequence_number,
        )
        if row.sequence_hash != expected:
            return AuditIntegrityResult(
                verified_count=i,
                valid=False,
                first_break_id=row.id,
                first_break_timestamp=row.timestamp,
                message=f"Hash chain break at entry {row.id}",
            )
        previous_hash = row.sequence_hash

    return AuditIntegrityResult(
        verified_count=len(rows),
        valid=True,
        message=f"All {len(rows)} entries verified",
    )


@router.get("/logs/export")
async def export_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(100000, ge=1, le=100000),
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> StreamingResponse:
    """Export audit log entries as CSV. Admin-only. Same filters as list endpoint.

    Plant-scoped to plants the caller is admin at (plus plant-agnostic rows).
    """
    plant_ids = list(get_admin_plant_ids(_admin))
    base = _build_audit_query(
        user_id, action, resource_type, start_date, end_date, plant_ids=plant_ids
    )
    stmt = base.order_by(AuditLog.timestamp.desc()).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()

    # Resolve resource display names — prefer stored value, fall back to live lookup
    display_cache: dict[tuple[str, int], str] = {}
    for row in rows:
        if row.resource_type and row.resource_id:
            key = (row.resource_type, row.resource_id)
            if key not in display_cache:
                stored = getattr(row, "resource_display", None)
                if stored:
                    display_cache[key] = stored
                else:
                    display_cache[key] = await resolve_resource_display(
                        session, row.resource_type, row.resource_id
                    )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "username", "action", "resource_type", "resource_id", "resource", "ip_address", "detail"])
    for row in rows:
        resource_display = ""
        if row.resource_type and row.resource_id:
            # Prefer per-row stored display, then cache
            resource_display = getattr(row, "resource_display", None) or display_cache.get(
                (row.resource_type, row.resource_id), ""
            )
        writer.writerow([
            row.timestamp.isoformat() if row.timestamp else "",
            row.username or "",
            row.action,
            row.resource_type or "",
            row.resource_id or "",
            resource_display,
            row.ip_address or "",
            str(row.detail) if row.detail else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_log.csv"},
    )


@router.get("/stats", response_model=AuditStats)
async def get_audit_stats(
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> AuditStats:
    """Get audit log summary statistics. Admin-only."""
    # Total count
    total = (await session.execute(select(func.count(AuditLog.id)))).scalar() or 0

    # Events by action
    action_rows = (
        await session.execute(
            select(AuditLog.action, func.count(AuditLog.id))
            .group_by(AuditLog.action)
        )
    ).all()
    events_by_action = {row[0]: row[1] for row in action_rows}

    # Events by resource type
    resource_rows = (
        await session.execute(
            select(AuditLog.resource_type, func.count(AuditLog.id))
            .where(AuditLog.resource_type.isnot(None))
            .group_by(AuditLog.resource_type)
        )
    ).all()
    events_by_resource = {row[0]: row[1] for row in resource_rows}

    return AuditStats(
        total_events=total,
        events_by_action=events_by_action,
        events_by_resource=events_by_resource,
    )
