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

from cassini.api.deps import get_current_admin, get_db_session
from cassini.api.schemas.audit import AuditLogEntry, AuditLogListResponse, AuditStats
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.user import User

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


# --- Helpers ---

def _build_audit_query(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
):
    """Build a filtered SELECT for audit_log rows."""
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
    """List audit log entries with optional filtering and pagination. Admin-only."""
    base = _build_audit_query(user_id, action, resource_type, start_date, end_date)

    # Count total matching
    count_stmt = select(func.count()).select_from(base.subquery())
    total = (await session.execute(count_stmt)).scalar() or 0

    # Fetch page
    stmt = base.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
    rows = (await session.execute(stmt)).scalars().all()

    return AuditLogListResponse(
        items=[AuditLogEntry.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/logs/export")
async def export_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    session: AsyncSession = Depends(get_db_session),
    _admin: User = Depends(get_current_admin),
) -> StreamingResponse:
    """Export audit log entries as CSV. Admin-only. Same filters as list endpoint."""
    base = _build_audit_query(user_id, action, resource_type, start_date, end_date)
    stmt = base.order_by(AuditLog.timestamp.desc()).limit(10000)
    rows = (await session.execute(stmt)).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "username", "action", "resource_type", "resource_id", "ip_address", "detail"])
    for row in rows:
        writer.writerow([
            row.timestamp.isoformat() if row.timestamp else "",
            row.username or "",
            row.action,
            row.resource_type or "",
            row.resource_id or "",
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
