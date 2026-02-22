"""First Article Inspection (FAI) REST endpoints — AS9102 Rev C.

Provides CRUD for FAI reports and items, status workflow
(draft → submitted → approved/rejected), and AS9102 form data export.
"""

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from openspc.api.schemas.fai import (
    FAIItemCreate,
    FAIItemResponse,
    FAIItemUpdate,
    FAIRejectRequest,
    FAIReportCreate,
    FAIReportDetailResponse,
    FAIReportResponse,
    FAIReportUpdate,
)
from openspc.db.models.fai import FAIItem, FAIReport
from openspc.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/fai", tags=["fai"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_report_or_404(
    session: AsyncSession,
    report_id: int,
    *,
    load_items: bool = False,
) -> FAIReport:
    """Fetch an FAI report by ID, optionally eager-loading items."""
    stmt = select(FAIReport).where(FAIReport.id == report_id)
    if load_items:
        stmt = stmt.options(selectinload(FAIReport.items))
    result = await session.execute(stmt)
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"FAI report {report_id} not found",
        )
    return report


def _require_draft(report: FAIReport) -> None:
    """Raise 409 if the report is not in draft status."""
    if report.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Report is in '{report.status}' status — only draft reports can be modified",
        )


# ===========================================================================
# REPORT ENDPOINTS
# ===========================================================================


@router.post("/reports", response_model=FAIReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    body: FAIReportCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Create a new FAI report in draft status.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    report = FAIReport(
        plant_id=body.plant_id,
        part_number=body.part_number,
        part_name=body.part_name,
        revision=body.revision,
        serial_number=body.serial_number,
        lot_number=body.lot_number,
        drawing_number=body.drawing_number,
        organization_name=body.organization_name,
        supplier=body.supplier,
        purchase_order=body.purchase_order,
        reason_for_inspection=body.reason_for_inspection,
        material_supplier=body.material_supplier,
        material_spec=body.material_spec,
        special_processes=body.special_processes,
        functional_test_results=body.functional_test_results,
        status="draft",
        created_by=user.id,
    )
    session.add(report)
    await session.commit()
    await session.refresh(report)

    logger.info("fai_report_created", report_id=report.id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.get("/reports", response_model=list[FAIReportResponse])
async def list_reports(
    plant_id: int = Query(..., description="Plant ID (required)"),
    report_status: str | None = Query(None, alias="status", description="Filter by status"),
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> list[FAIReportResponse]:
    """List FAI reports for a plant.

    Requires supervisor+ role for the plant.
    """
    check_plant_role(user, plant_id, "supervisor")

    stmt = select(FAIReport).where(FAIReport.plant_id == plant_id)
    if report_status is not None:
        stmt = stmt.where(FAIReport.status == report_status)
    stmt = stmt.order_by(FAIReport.created_at.desc())

    result = await session.execute(stmt)
    reports = list(result.scalars().all())
    return [FAIReportResponse.model_validate(r) for r in reports]


@router.get("/reports/{report_id}", response_model=FAIReportDetailResponse)
async def get_report(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportDetailResponse:
    """Get a single FAI report with all inspection items.

    Requires supervisor+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id, load_items=True)
    check_plant_role(user, report.plant_id, "supervisor")

    return FAIReportDetailResponse.model_validate(report)


@router.put("/reports/{report_id}", response_model=FAIReportResponse)
async def update_report(
    report_id: int,
    body: FAIReportUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Update an FAI report header. Only draft reports can be edited.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(report, field, value)

    await session.commit()
    await session.refresh(report)

    logger.info("fai_report_updated", report_id=report_id, user=user.username, fields=list(update_data.keys()))
    return FAIReportResponse.model_validate(report)


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete an FAI report. Only draft reports can be deleted.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    await session.delete(report)
    await session.commit()

    logger.info("fai_report_deleted", report_id=report_id, user=user.username)


# ===========================================================================
# ITEM ENDPOINTS
# ===========================================================================


@router.post(
    "/reports/{report_id}/items",
    response_model=FAIItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_item(
    report_id: int,
    body: FAIItemCreate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIItemResponse:
    """Add an inspection item to an FAI report.

    Auto-assigns sequence_order based on existing items.
    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    # Determine next sequence_order
    count_stmt = (
        select(sa_func.coalesce(sa_func.max(FAIItem.sequence_order), 0))
        .where(FAIItem.report_id == report_id)
    )
    max_order = (await session.execute(count_stmt)).scalar_one()

    item = FAIItem(
        report_id=report_id,
        balloon_number=body.balloon_number,
        characteristic_name=body.characteristic_name,
        nominal=body.nominal,
        usl=body.usl,
        lsl=body.lsl,
        actual_value=body.actual_value,
        unit=body.unit,
        tools_used=body.tools_used,
        designed_char=body.designed_char,
        result=body.result,
        deviation_reason=body.deviation_reason,
        characteristic_id=body.characteristic_id,
        sequence_order=max_order + 1,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)

    logger.info("fai_item_added", report_id=report_id, item_id=item.id, user=user.username)
    return FAIItemResponse.model_validate(item)


@router.put("/reports/{report_id}/items/{item_id}", response_model=FAIItemResponse)
async def update_item(
    report_id: int,
    item_id: int,
    body: FAIItemUpdate,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIItemResponse:
    """Update an inspection item.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    stmt = select(FAIItem).where(FAIItem.id == item_id, FAIItem.report_id == report_id)
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"FAI item {item_id} not found in report {report_id}",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)

    await session.commit()
    await session.refresh(item)

    logger.info("fai_item_updated", report_id=report_id, item_id=item_id, user=user.username)
    return FAIItemResponse.model_validate(item)


@router.delete("/reports/{report_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(
    report_id: int,
    item_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Remove an inspection item from an FAI report.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    stmt = select(FAIItem).where(FAIItem.id == item_id, FAIItem.report_id == report_id)
    result = await session.execute(stmt)
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"FAI item {item_id} not found in report {report_id}",
        )

    await session.delete(item)
    await session.commit()

    logger.info("fai_item_deleted", report_id=report_id, item_id=item_id, user=user.username)


# ===========================================================================
# WORKFLOW ENDPOINTS
# ===========================================================================


@router.post("/reports/{report_id}/submit", response_model=FAIReportResponse)
async def submit_report(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Submit an FAI report for approval. Changes status: draft → submitted.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    report.status = "submitted"
    report.submitted_at = datetime.now(timezone.utc)
    report.rejection_reason = None  # Clear any previous rejection

    await session.commit()
    await session.refresh(report)

    logger.info("fai_report_submitted", report_id=report_id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.post("/reports/{report_id}/approve", response_model=FAIReportResponse)
async def approve_report(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Approve a submitted FAI report. Changes status: submitted → approved.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")

    if report.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Report is in '{report.status}' status — only submitted reports can be approved",
        )

    report.status = "approved"
    report.approved_by = user.id
    report.approved_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(report)

    logger.info("fai_report_approved", report_id=report_id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.post("/reports/{report_id}/reject", response_model=FAIReportResponse)
async def reject_report(
    report_id: int,
    body: FAIRejectRequest,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Reject a submitted FAI report. Changes status: submitted → draft.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")

    if report.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Report is in '{report.status}' status — only submitted reports can be rejected",
        )

    report.status = "draft"
    report.rejection_reason = body.reason

    await session.commit()
    await session.refresh(report)

    logger.info("fai_report_rejected", report_id=report_id, user=user.username, reason=body.reason)
    return FAIReportResponse.model_validate(report)


# ===========================================================================
# FORM DATA EXPORT
# ===========================================================================


@router.get("/reports/{report_id}/forms")
async def get_form_data(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> dict:
    """Get structured AS9102 form data for a report.

    Returns the report header and items organized by AS9102 form sections:
    - Form 1: Part Number Accountability
    - Form 2: Product Accountability (material, processes, functional tests)
    - Form 3: Characteristic Accountability (inspection items)

    Requires supervisor+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id, load_items=True)
    check_plant_role(user, report.plant_id, "supervisor")

    items = [FAIItemResponse.model_validate(item) for item in report.items]

    return {
        "report_id": report.id,
        "status": report.status,
        "form1_part_accountability": {
            "part_number": report.part_number,
            "part_name": report.part_name,
            "revision": report.revision,
            "serial_number": report.serial_number,
            "lot_number": report.lot_number,
            "drawing_number": report.drawing_number,
            "organization_name": report.organization_name,
            "supplier": report.supplier,
            "purchase_order": report.purchase_order,
            "reason_for_inspection": report.reason_for_inspection,
            "created_by": report.created_by,
            "created_at": report.created_at.isoformat() if report.created_at else None,
            "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
            "approved_by": report.approved_by,
            "approved_at": report.approved_at.isoformat() if report.approved_at else None,
        },
        "form2_product_accountability": {
            "material_supplier": report.material_supplier,
            "material_spec": report.material_spec,
            "special_processes": report.special_processes,
            "functional_test_results": report.functional_test_results,
        },
        "form3_characteristic_accountability": {
            "total_characteristics": len(items),
            "pass_count": sum(1 for i in items if i.result == "pass"),
            "fail_count": sum(1 for i in items if i.result == "fail"),
            "deviation_count": sum(1 for i in items if i.result == "deviation"),
            "items": [item.model_dump() for item in items],
        },
    }
