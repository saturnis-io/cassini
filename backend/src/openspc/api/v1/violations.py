"""Violation REST API endpoints.

Implements violation management and acknowledgment endpoints for SPC monitoring.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openspc.api.deps import (
    check_plant_role,
    get_alert_manager,
    get_current_user,
    get_db_session,
    get_violation_repo,
    resolve_plant_id_for_characteristic,
)
from openspc.db.models.sample import Sample
from openspc.db.models.user import User
from openspc.api.schemas.common import PaginatedResponse, PaginationParams
from openspc.api.schemas.violation import (
    AcknowledgeResultItem,
    BatchAcknowledgeRequest,
    BatchAcknowledgeResult,
    ViolationAcknowledge,
    ViolationResponse,
    ViolationStats,
)
from openspc.core.alerts.manager import AlertManager
from openspc.db.repositories.violation import ViolationRepository
from openspc.db.repositories.hierarchy import HierarchyRepository

router = APIRouter(prefix="/api/v1/violations", tags=["violations"])


async def build_hierarchy_path(
    hierarchy_repo: HierarchyRepository, hierarchy_id: int
) -> str:
    """Build hierarchy path string like 'Plant > Line > Machine'."""
    path_parts = []
    current_id: int | None = hierarchy_id

    while current_id is not None:
        node = await hierarchy_repo.get_by_id(current_id)
        if node is None:
            break
        path_parts.insert(0, node.name)
        current_id = node.parent_id

    return " > ".join(path_parts) if path_parts else ""


@router.get("/", response_model=PaginatedResponse[ViolationResponse])
async def list_violations(
    repo: ViolationRepository = Depends(get_violation_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
    characteristic_id: int | None = None,
    sample_id: int | None = None,
    acknowledged: bool | None = None,
    requires_acknowledgement: bool | None = Query(
        None, description="Filter by requires_acknowledgement flag"
    ),
    severity: str | None = None,
    rule_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = 0,
    limit: int = 100,
    page: int | None = None,
    per_page: int | None = None,
) -> PaginatedResponse[ViolationResponse]:
    """List violations with comprehensive filtering.

    Supports filtering by multiple criteria including characteristic,
    sample, acknowledgment status, severity, rule, and date range.

    Args:
        characteristic_id: Optional characteristic ID filter
        sample_id: Optional sample ID filter
        acknowledged: Optional acknowledgment status filter
        severity: Optional severity filter (WARNING or CRITICAL)
        rule_id: Optional Nelson Rule ID filter (1-8)
        start_date: Optional start date filter (inclusive)
        end_date: Optional end date filter (inclusive)
        offset: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of violations with metadata

    Example Response:
        ```json
        {
            "items": [
                {
                    "id": 1,
                    "sample_id": 42,
                    "rule_id": 1,
                    "rule_name": "Outlier",
                    "severity": "CRITICAL",
                    "acknowledged": false,
                    "ack_user": null,
                    "ack_reason": null,
                    "ack_timestamp": null
                }
            ],
            "total": 1,
            "offset": 0,
            "limit": 100
        }
        ```
    """
    # Convert page/per_page to offset/limit if provided
    if per_page is not None:
        limit = per_page
    if page is not None:
        offset = (page - 1) * limit

    violations, total = await repo.list_violations(
        characteristic_id=characteristic_id,
        sample_id=sample_id,
        acknowledged=acknowledged,
        requires_acknowledgement=requires_acknowledgement,
        severity=severity,
        rule_id=rule_id,
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )

    # Build response with characteristic context
    hierarchy_repo = HierarchyRepository(session)
    hierarchy_cache: dict[int, str] = {}  # Cache paths to avoid repeated queries

    items: list[ViolationResponse] = []
    for v in violations:
        # Get characteristic info from loaded relationships
        char_id = None
        char_name = None
        hierarchy_path = None

        if v.sample and v.sample.characteristic:
            char = v.sample.characteristic
            char_id = char.id
            char_name = char.name

            # Build or get cached hierarchy path
            if char.hierarchy_id not in hierarchy_cache:
                hierarchy_cache[char.hierarchy_id] = await build_hierarchy_path(
                    hierarchy_repo, char.hierarchy_id
                )
            hierarchy_path = hierarchy_cache[char.hierarchy_id]

        items.append(
            ViolationResponse(
                id=v.id,
                sample_id=v.sample_id,
                rule_id=v.rule_id,
                rule_name=v.rule_name or f"Rule {v.rule_id}",
                severity=v.severity,
                acknowledged=v.acknowledged,
                requires_acknowledgement=v.requires_acknowledgement,
                ack_user=v.ack_user,
                ack_reason=v.ack_reason,
                ack_timestamp=v.ack_timestamp,
                created_at=v.sample.timestamp if v.sample else None,
                characteristic_id=char_id,
                characteristic_name=char_name,
                hierarchy_path=hierarchy_path,
            )
        )

    return PaginatedResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/stats", response_model=ViolationStats)
async def get_violation_stats(
    manager: AlertManager = Depends(get_alert_manager),
    _user: User = Depends(get_current_user),
    characteristic_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> ViolationStats:
    """Get violation statistics for dashboard.

    Provides aggregated statistics including total violations,
    unacknowledged count, and breakdowns by rule and severity.

    Args:
        characteristic_id: Optional characteristic ID filter
        start_date: Optional start date filter (inclusive)
        end_date: Optional end date filter (inclusive)

    Returns:
        Aggregated violation statistics

    Example Response:
        ```json
        {
            "total": 15,
            "unacknowledged": 3,
            "by_rule": {
                "1": 5,
                "2": 3,
                "3": 7
            },
            "by_severity": {
                "WARNING": 10,
                "CRITICAL": 5
            }
        }
        ```
    """
    stats = await manager.get_violation_stats(
        characteristic_id=characteristic_id,
        start_date=start_date,
        end_date=end_date,
    )

    return ViolationStats(
        total=stats.total,
        unacknowledged=stats.unacknowledged,
        informational=stats.informational,
        by_rule=stats.by_rule,
        by_severity=stats.by_severity,
    )


@router.get("/reason-codes", response_model=list[str])
async def get_reason_codes(
    _user: User = Depends(get_current_user),
) -> list[str]:
    """Get list of standard acknowledgment reason codes.

    Returns predefined reason codes that can be used when
    acknowledging violations.

    Returns:
        List of standard reason codes

    Example Response:
        ```json
        [
            "Tool Change",
            "Raw Material Change",
            "Setup Adjustment",
            "Measurement Error",
            "Process Adjustment",
            "Environmental Factor",
            "Operator Error",
            "Equipment Malfunction",
            "False Alarm",
            "Under Investigation",
            "Other"
        ]
        ```
    """
    return AlertManager.get_reason_codes()


@router.get("/{violation_id}", response_model=ViolationResponse)
async def get_violation(
    violation_id: int,
    repo: ViolationRepository = Depends(get_violation_repo),
    _user: User = Depends(get_current_user),
) -> ViolationResponse:
    """Get violation details.

    Retrieves detailed information about a specific violation.

    Args:
        violation_id: ID of the violation to retrieve

    Returns:
        Violation details

    Raises:
        HTTPException 404: If violation doesn't exist

    Example Response:
        ```json
        {
            "id": 1,
            "sample_id": 42,
            "rule_id": 1,
            "rule_name": "Outlier",
            "severity": "CRITICAL",
            "acknowledged": true,
            "ack_user": "john.doe",
            "ack_reason": "Tool Change",
            "ack_timestamp": "2025-01-15T10:30:00Z"
        }
        ```
    """
    violation = await repo.get_by_id(violation_id)
    if violation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Violation {violation_id} not found",
        )
    return ViolationResponse.model_validate(violation)


@router.post("/{violation_id}/acknowledge", response_model=ViolationResponse)
async def acknowledge_violation(
    violation_id: int,
    data: ViolationAcknowledge,
    manager: AlertManager = Depends(get_alert_manager),
    repo: ViolationRepository = Depends(get_violation_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> ViolationResponse:
    """Acknowledge a violation.

    Marks a violation as acknowledged with user information and reason.
    Optionally excludes the associated sample from control limit calculations.

    Args:
        violation_id: ID of the violation to acknowledge
        data: Acknowledgment data including user, reason, and exclude_sample flag

    Returns:
        Updated violation with acknowledgment information

    Raises:
        HTTPException 404: If violation doesn't exist
        HTTPException 409: If violation is already acknowledged

    Example Request:
        ```json
        {
            "user": "john.doe",
            "reason": "Tool Change",
            "exclude_sample": true
        }
        ```

    Example Response:
        ```json
        {
            "id": 1,
            "sample_id": 42,
            "rule_id": 1,
            "rule_name": "Outlier",
            "severity": "CRITICAL",
            "acknowledged": true,
            "ack_user": "john.doe",
            "ack_reason": "Tool Change",
            "ack_timestamp": "2025-01-15T10:30:00Z"
        }
        ```
    """
    # Plant-scoped authorization: look up the violation's characteristic's plant
    violation_obj = await repo.get_by_id(violation_id)
    if violation_obj is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Violation {violation_id} not found",
        )
    # Resolve plant via direct query (avoids async lazy-loading on relationships)
    char_id = (await session.execute(
        select(Sample.char_id).where(Sample.id == violation_obj.sample_id)
    )).scalar_one_or_none()
    if char_id is not None:
        plant_id = await resolve_plant_id_for_characteristic(char_id, session)
        check_plant_role(_user, plant_id, "supervisor")
    else:
        # Fallback: require supervisor at any plant if we can't resolve
        from openspc.api.deps import ROLE_HIERARCHY

        has_role = any(
            ROLE_HIERARCHY.get(pr.role.value, 0) >= ROLE_HIERARCHY["supervisor"]
            for pr in _user.plant_roles
        )
        if not has_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="supervisor or higher privileges required",
            )

    try:
        violation = await manager.acknowledge(
            violation_id=violation_id,
            user=data.user,
            reason=data.reason,
            exclude_sample=data.exclude_sample,
        )
        return ViolationResponse.model_validate(violation)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            )
        elif "already acknowledged" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=error_msg,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg,
            )


@router.post("/batch-acknowledge", response_model=BatchAcknowledgeResult)
async def batch_acknowledge(
    request: BatchAcknowledgeRequest,
    manager: AlertManager = Depends(get_alert_manager),
    repo: ViolationRepository = Depends(get_violation_repo),
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> BatchAcknowledgeResult:
    """Acknowledge multiple violations at once.

    Processes acknowledgment for multiple violations in a single operation.
    Handles partial success - returns detailed results for each violation.

    Args:
        request: Batch acknowledgment request with violation IDs and acknowledgment data

    Returns:
        Summary and detailed results of batch operation

    Example Request:
        ```json
        {
            "violation_ids": [1, 2, 3],
            "user": "john.doe",
            "reason": "Tool Change",
            "exclude_sample": false
        }
        ```

    Example Response:
        ```json
        {
            "total": 3,
            "successful": 2,
            "failed": 1,
            "results": [
                {
                    "violation_id": 1,
                    "success": true,
                    "error": null
                },
                {
                    "violation_id": 2,
                    "success": true,
                    "error": null
                },
                {
                    "violation_id": 3,
                    "success": false,
                    "error": "Violation 3 is already acknowledged"
                }
            ]
        }
        ```
    """
    results: list[AcknowledgeResultItem] = []
    successful = 0
    failed = 0

    for violation_id in request.violation_ids:
        try:
            # Plant-scoped authorization per violation
            violation_obj = await repo.get_by_id(violation_id)
            if violation_obj is None:
                raise ValueError(f"Violation {violation_id} not found")
            # Resolve plant via direct query (avoids async lazy-loading)
            char_id = (await session.execute(
                select(Sample.char_id).where(Sample.id == violation_obj.sample_id)
            )).scalar_one_or_none()
            if char_id is not None:
                plant_id = await resolve_plant_id_for_characteristic(
                    char_id, session
                )
                check_plant_role(_user, plant_id, "supervisor")

            await manager.acknowledge(
                violation_id=violation_id,
                user=request.user,
                reason=request.reason,
                exclude_sample=request.exclude_sample,
            )
            results.append(
                AcknowledgeResultItem(
                    violation_id=violation_id,
                    success=True,
                    error=None,
                )
            )
            successful += 1
        except HTTPException as e:
            results.append(
                AcknowledgeResultItem(
                    violation_id=violation_id,
                    success=False,
                    error=e.detail,
                )
            )
            failed += 1
        except ValueError as e:
            results.append(
                AcknowledgeResultItem(
                    violation_id=violation_id,
                    success=False,
                    error=str(e),
                )
            )
            failed += 1

    # Build frontend-friendly fields
    acknowledged_ids = [r.violation_id for r in results if r.success]
    error_map = {r.violation_id: (r.error or "Unknown error") for r in results if not r.success}

    return BatchAcknowledgeResult(
        total=len(request.violation_ids),
        successful=successful,
        failed=failed,
        results=results,
        acknowledged=acknowledged_ids,
        errors=error_map,
    )
