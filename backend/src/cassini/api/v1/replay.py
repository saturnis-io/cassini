"""Time-travel SPC replay API endpoints.

Audit-grade reconstruction of any control chart's state at any historical
moment.  The replay endpoint is read-only: the snapshot is rebuilt on
demand from the hash-chained audit log and never persisted as a new
artifact (21 CFR Part 11 §11.10(b)).

Tier: **Pro** (regulated industries differentiator). Gated through both
``LicenseEnforcementMiddleware`` (router membership in ``_PRO_ROUTERS``)
and an explicit ``has_feature("time_travel_replay")`` check that runs
BEFORE plant scope checks so unauthorized callers cannot probe for
which characteristic IDs exist.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.deps import (
    get_current_user,
    get_db_session,
    get_license_service,
    resolve_plant_id_for_characteristic,
)
from cassini.api.schemas.replay import ReplaySnapshot
from cassini.core.audit import AuditService
from cassini.core.licensing import LicenseService
from cassini.core.replay_service import (
    ReplayNotFoundError,
    reconstruct_snapshot,
)
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

# IMPORTANT: prefix is "/api/v1/replay" — DO NOT use just "/replay".
# Although the project rule says "router prefix = /resource-name", existing
# routers in this codebase use the full /api/v1/<name> path (see audit.py,
# anomaly.py, etc.). The app does NOT auto-add /api/v1 — main.py registers
# routers via include_router(router) without a path argument.
router = APIRouter(prefix="/api/v1/replay", tags=["replay"])


_SUPPORTED_RESOURCE_TYPES = frozenset({"characteristic"})


@router.get("/{resource_type}/{resource_id}", response_model=ReplaySnapshot)
async def get_replay_snapshot(
    request: Request,
    resource_type: str,
    resource_id: int,
    at: datetime = Query(
        ...,
        description=(
            "ISO-8601 UTC timestamp to replay to. "
            "Example: 2026-03-14T14:00:00Z"
        ),
    ),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
    license_service: LicenseService = Depends(get_license_service),
) -> ReplaySnapshot:
    """Replay the state of a resource at a historical moment.

    Reconstructs the control chart's limits, rules, signatures, and sample
    list as they existed at the requested timestamp.  Returns a read-only
    snapshot.

    Auth and authz order (deliberate):
      1. **Tier check** (Pro+) — block before any data lookup so callers
         without the entitlement cannot enumerate resource IDs.
      2. **Resource-type allowlist** — only ``characteristic`` is
         currently supported; other types return 400 fast.
      3. **Plant scope check** — same path as every other characteristic
         endpoint, returning 404 (not 403) for cross-plant probes so
         existence is not leaked.

    Args:
        resource_type: Must be ``characteristic`` (path validated).
        resource_id: Numeric ID of the resource.
        at: Historical UTC timestamp to replay to.

    Returns:
        :class:`ReplaySnapshot`.

    Raises:
        HTTPException 400: Unsupported resource type or malformed ``at``.
        HTTPException 403: License tier doesn't include the feature.
        HTTPException 404: Resource missing or cross-plant probe.
        HTTPException 422: ``at`` not parseable as datetime.
    """
    # ------------------------------------------------------------------
    # 1. Tier gate — must run BEFORE any DB lookup or plant scope check.
    # ------------------------------------------------------------------
    if not license_service.has_feature("time_travel_replay"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Time-travel replay requires a Pro or Enterprise license. "
                "Upgrade your subscription to enable historical reconstruction."
            ),
        )

    # ------------------------------------------------------------------
    # 2. Validate resource type early — 400 with clear error.
    # ------------------------------------------------------------------
    if resource_type not in _SUPPORTED_RESOURCE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Replay not supported for resource_type={resource_type!r}. "
                f"Supported: {sorted(_SUPPORTED_RESOURCE_TYPES)}."
            ),
        )

    # ------------------------------------------------------------------
    # 3. Plant scope — uses the shared helper so cross-plant probes get
    #    a 404 identical to "doesn't exist". Must run AFTER tier check
    #    so unentitled users see 403 first.
    # ------------------------------------------------------------------
    plant_id = await resolve_plant_id_for_characteristic(resource_id, session)
    accessible_plants = {pr.plant_id for pr in user.plant_roles}
    is_admin = any(pr.role.value == "admin" for pr in user.plant_roles)
    if not is_admin and plant_id not in accessible_plants:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {resource_id} not found",
        )

    # ------------------------------------------------------------------
    # 4. Reconstruct the snapshot from the audit log.
    # ------------------------------------------------------------------
    try:
        snapshot = await reconstruct_snapshot(
            session=session,
            resource_type=resource_type,
            resource_id=resource_id,
            plant_id=plant_id,
            at=at,
        )
    except ReplayNotFoundError as e:
        # No reconstructable history. Return 404 so the caller knows
        # there's nothing to replay rather than guessing they typed a
        # wrong timestamp.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        # _RECONSTRUCTORS lookup miss (defense-in-depth — already caught
        # by the allowlist above, but kept so future expansion of
        # _SUPPORTED_RESOURCE_TYPES without a reconstructor surfaces
        # cleanly).
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # ------------------------------------------------------------------
    # 5. Audit log the replay action — explicit because the AuditMiddleware
    #    only auto-logs mutating methods. Replay reads protected history,
    #    so the action of viewing it must be tracked. Logged AFTER a
    #    successful response so we don't record probes that 403/404'd.
    # ------------------------------------------------------------------
    audit_service: Optional[AuditService] = getattr(
        request.app.state, "audit_service", None
    )
    if audit_service is not None:
        try:
            await audit_service.log(
                action="replay",
                resource_type="replay",
                resource_id=resource_id,
                user_id=getattr(user, "id", None),
                username=getattr(user, "username", None),
                plant_id=plant_id,
                detail={
                    "resource_type": resource_type,
                    "requested_at": at.isoformat(),
                    "audit_event_count": snapshot.audit_event_count,
                },
            )
        except Exception:
            # Don't fail the request just because audit logging hiccuped;
            # the audit pipeline records its own failure metric.
            logger.warning(
                "replay_audit_log_failed",
                resource_id=resource_id,
                exc_info=True,
            )

    return snapshot
