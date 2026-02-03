"""Violation REST API endpoints.

Implements violation management and acknowledgment endpoints for SPC monitoring.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status

from openspc.api.deps import get_alert_manager, get_violation_repo
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

router = APIRouter(prefix="/api/v1/violations", tags=["violations"])


@router.get("/", response_model=PaginatedResponse[ViolationResponse])
async def list_violations(
    repo: ViolationRepository = Depends(get_violation_repo),
    characteristic_id: int | None = None,
    sample_id: int | None = None,
    acknowledged: bool | None = None,
    severity: str | None = None,
    rule_id: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = 0,
    limit: int = 100,
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
    violations, total = await repo.list_violations(
        characteristic_id=characteristic_id,
        sample_id=sample_id,
        acknowledged=acknowledged,
        severity=severity,
        rule_id=rule_id,
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )

    items = [ViolationResponse.model_validate(v) for v in violations]

    return PaginatedResponse(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/stats", response_model=ViolationStats)
async def get_violation_stats(
    manager: AlertManager = Depends(get_alert_manager),
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
        by_rule=stats.by_rule,
        by_severity=stats.by_severity,
    )


@router.get("/reason-codes", response_model=list[str])
async def get_reason_codes() -> list[str]:
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
        except ValueError as e:
            results.append(
                AcknowledgeResultItem(
                    violation_id=violation_id,
                    success=False,
                    error=str(e),
                )
            )
            failed += 1

    return BatchAcknowledgeResult(
        total=len(request.violation_ids),
        successful=successful,
        failed=failed,
        results=results,
    )
