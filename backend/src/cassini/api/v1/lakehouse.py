"""Lakehouse data product endpoints (Pro+).

Exposes whitelisted Cassini tables as read-only Arrow / Parquet / CSV /
JSON exports. Every export is plant-scoped, audited, and rate-limited.

The router is registered as a Pro tier router — the
``LicenseEnforcementMiddleware`` automatically returns 403 for community
callers, and the ``has_feature("lakehouse-export")`` check provides
defense in depth at the endpoint.
"""

# NOTE: do NOT use ``from __future__ import annotations`` in this module —
# FastAPI's Pydantic adapter resolves Query enum defaults at import time
# and fails on forward references.

from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response, StreamingResponse

from cassini.api.deps import (
    get_accessible_plant_ids,
    get_current_user,
    get_db_session,
    get_license_service,
    user_is_global_admin,
)
from cassini.api.schemas.lakehouse import (
    LakehouseCatalog,
    LakehouseFormat,
    LakehouseTable,
    LakehouseTableInfo,
)
from cassini.core.config import get_settings
from cassini.core.licensing import LicenseService
from cassini.core.rate_limit import limiter
from cassini.db.models.user import User
from cassini.services import lakehouse_service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/lakehouse", tags=["lakehouse"])

# Audit action keyword used by the middleware path matcher and the
# explicit log call below. Kept as a constant so a typo here cannot drift
# from the AuditLogViewer ACTION_LABELS mapping.
_AUDIT_ACTION = "lakehouse_export"


@router.get("/tables", response_model=LakehouseCatalog)
async def list_lakehouse_tables(
    _user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
) -> LakehouseCatalog:
    """List the available lakehouse tables and supported formats."""
    _require_lakehouse_feature(license_service)
    settings = get_settings()
    return LakehouseCatalog(
        tables=[LakehouseTableInfo(**t) for t in lakehouse_service.list_tables()],
        formats=[f.value for f in LakehouseFormat],
        rate_limit=settings.rate_limit_export,
    )


@router.get("/{table}")
@limiter.limit(get_settings().rate_limit_export)
async def export_lakehouse_table(
    request: Request,
    table: str,
    format: LakehouseFormat = Query(  # noqa: A002 — matches public API
        LakehouseFormat.JSON, description="Output format.",
    ),
    plant_id: Optional[int] = Query(
        None, description="Restrict the export to a single plant.",
    ),
    columns: Optional[str] = Query(
        None,
        description=(
            "Comma-separated subset of columns to include. Unknown columns "
            "are silently dropped."
        ),
    ),
    from_: Optional[datetime] = Query(
        None, alias="from", description="Inclusive start of the timestamp window.",
    ),
    to: Optional[datetime] = Query(
        None, description="Inclusive end of the timestamp window.",
    ),
    limit: Optional[int] = Query(
        None, ge=1, le=1_000_000,
        description="Maximum rows to return (clamped to 1,000,000).",
    ),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
) -> Response:
    """Export a whitelisted table in the requested format.

    Returns:
        StreamingResponse for Arrow IPC, Response for everything else.
    """
    _require_lakehouse_feature(license_service)

    table_enum = _resolve_table_or_404(table)

    requested_columns = _split_columns(columns)
    resolved_columns = lakehouse_service.resolve_columns(table_enum, requested_columns)

    accessible: Optional[list[int]] = None
    if not user_is_global_admin(user):
        accessible = sorted(get_accessible_plant_ids(user))

    try:
        export = await lakehouse_service.execute_export(
            session=session,
            table=table_enum,
            columns=resolved_columns,
            accessible_plant_ids=accessible,
            plant_id=plant_id,
            start_date=from_,
            end_date=to,
            limit=limit,
        )
    except Exception:  # pragma: no cover - defensive
        logger.warning("lakehouse_export_query_failed", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Lakehouse export failed",
        )

    response = _serialize(export, format, table_enum)

    # Audit context — picked up by AuditMiddleware via request.state. We
    # also log explicitly so the action keyword survives even if the
    # middleware skips GETs.
    audit_detail = {
        "table": table_enum.value,
        "format": format.value,
        "row_count": len(export.rows),
        "plant_filter": export.plant_filter,
        "columns": resolved_columns,
        "truncated": export.truncated,
    }
    request.state.audit_context = {
        "resource_type": "lakehouse",
        "resource_id": None,
        "action": _AUDIT_ACTION,
        "summary": (
            f"Lakehouse export: {table_enum.value} ({format.value}, "
            f"{len(export.rows)} rows)"
        ),
        "fields": audit_detail,
    }
    audit_service = getattr(request.app.state, "audit_service", None)
    if audit_service is not None:
        await audit_service.log(
            action=_AUDIT_ACTION,
            resource_type="lakehouse",
            user_id=user.id,
            username=user.username,
            detail=audit_detail,
            plant_id=plant_id,
        )

    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_lakehouse_feature(license_service: LicenseService) -> None:
    """Defense-in-depth tier check — middleware also blocks community."""
    if not license_service.has_feature("lakehouse-export"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lakehouse export requires a Pro or Enterprise license",
        )


def _resolve_table_or_404(table: str) -> LakehouseTable:
    """Map the path segment to a LakehouseTable, returning 404 on mismatch."""
    try:
        return LakehouseTable(table)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown lakehouse table: {table}",
        )


def _split_columns(raw: Optional[str]) -> Optional[list[str]]:
    """Parse the ``columns=`` query param into a list."""
    if not raw:
        return None
    return [c.strip() for c in raw.split(",") if c.strip()]


def _serialize(
    export: lakehouse_service.LakehouseExportResult,
    fmt: LakehouseFormat,
    table: LakehouseTable,
) -> Response:
    """Render the export in the requested wire format."""
    filename_base = f"cassini-{table.value}"
    headers = {
        "X-Lakehouse-Row-Count": str(len(export.rows)),
        "X-Lakehouse-Truncated": "true" if export.truncated else "false",
    }

    if fmt is LakehouseFormat.JSON:
        body = lakehouse_service.to_json_bytes(export)
        return Response(
            content=body,
            media_type="application/json",
            headers=headers,
        )
    if fmt is LakehouseFormat.CSV:
        body = lakehouse_service.to_csv_bytes(export)
        headers["Content-Disposition"] = (
            f'attachment; filename="{filename_base}.csv"'
        )
        return Response(
            content=body, media_type="text/csv", headers=headers,
        )
    if fmt is LakehouseFormat.PARQUET:
        try:
            body = lakehouse_service.to_parquet_bytes(export)
        except lakehouse_service.LakehouseDependencyError as e:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail=str(e),
            )
        headers["Content-Disposition"] = (
            f'attachment; filename="{filename_base}.parquet"'
        )
        return Response(
            content=body,
            media_type="application/vnd.apache.parquet",
            headers=headers,
        )
    if fmt is LakehouseFormat.ARROW:
        # Verify pyarrow is importable BEFORE returning StreamingResponse,
        # otherwise the import error fires lazily inside the async generator
        # and the client sees a 200 OK followed by a stream-level failure.
        try:
            lakehouse_service.ensure_pyarrow_available()
        except lakehouse_service.LakehouseDependencyError as e:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail=str(e),
            )
        iterator = lakehouse_service.stream_arrow_chunks(export)
        headers["Content-Disposition"] = (
            f'attachment; filename="{filename_base}.arrow"'
        )
        return StreamingResponse(
            iterator,
            media_type="application/vnd.apache.arrow.stream",
            headers=headers,
        )
    # Should never reach here — Pydantic validates the enum.
    raise HTTPException(  # pragma: no cover
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported format: {fmt}",
    )
