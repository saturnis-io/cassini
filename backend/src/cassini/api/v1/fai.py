"""First Article Inspection (FAI) REST endpoints — AS9102 Rev C.

Provides CRUD for FAI reports, items, and Form 2 child tables (materials,
special processes, functional tests), status workflow
(draft -> submitted -> approved/rejected), AS9102 form data export,
PDF/Excel export, and delta FAI support.
"""

import json
from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func as sa_func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.api.deps import (
    check_plant_role,
    get_current_user,
    get_db_session,
)
from cassini.api.schemas.fai import (
    FAIFunctionalTestCreate,
    FAIFunctionalTestResponse,
    FAIItemCreate,
    FAIItemResponse,
    FAIItemUpdate,
    FAIMaterialCreate,
    FAIMaterialResponse,
    FAIRejectRequest,
    FAIReportCreate,
    FAIReportDetailResponse,
    FAIReportResponse,
    FAIReportUpdate,
    FAISpecialProcessCreate,
    FAISpecialProcessResponse,
)
from cassini.core.signature_engine import SignatureWorkflowEngine
from cassini.db.models.fai import FAIItem, FAIReport
from cassini.db.models.fai_detail import FAIFunctionalTest, FAIMaterial, FAISpecialProcess
from cassini.db.models.user import User

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/fai", tags=["fai"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _serialize_measurements(measurements: list[float] | None) -> str | None:
    """Convert a list of floats to JSON string for DB storage."""
    if measurements is None:
        return None
    return json.dumps(measurements)


def _deserialize_measurements(raw: str | None) -> list[float] | None:
    """Convert JSON string from DB to list of floats."""
    if raw is None:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [float(v) for v in parsed]
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    return None


def _item_to_response(item: FAIItem) -> FAIItemResponse:
    """Convert an FAIItem model to its response schema, deserializing measurements."""
    data = {
        "id": item.id,
        "report_id": item.report_id,
        "balloon_number": item.balloon_number,
        "characteristic_name": item.characteristic_name,
        "drawing_zone": item.drawing_zone,
        "nominal": item.nominal,
        "usl": item.usl,
        "lsl": item.lsl,
        "actual_value": item.actual_value,
        "value_type": item.value_type,
        "actual_value_text": item.actual_value_text,
        "measurements": _deserialize_measurements(item.measurements),
        "unit": item.unit,
        "tools_used": item.tools_used,
        "designed_char": item.designed_char,
        "result": item.result,
        "deviation_reason": item.deviation_reason,
        "characteristic_id": item.characteristic_id,
        "sequence_order": item.sequence_order,
        "carried_forward": item.carried_forward,
    }
    return FAIItemResponse.model_validate(data)


async def _get_report_or_404(
    session: AsyncSession,
    report_id: int,
    *,
    load_items: bool = False,
    load_details: bool = False,
) -> FAIReport:
    """Fetch an FAI report by ID, optionally eager-loading items and child tables."""
    stmt = select(FAIReport).where(FAIReport.id == report_id)
    if load_items or load_details:
        stmt = stmt.options(selectinload(FAIReport.items))
    if load_details:
        stmt = stmt.options(
            selectinload(FAIReport.materials),
            selectinload(FAIReport.special_processes_items),
            selectinload(FAIReport.functional_tests_items),
        )
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


def _report_detail_response(report: FAIReport) -> FAIReportDetailResponse:
    """Build a FAIReportDetailResponse with proper measurements deserialization."""
    items = [_item_to_response(item) for item in report.items]
    materials = [FAIMaterialResponse.model_validate(m) for m in report.materials]
    sp = [FAISpecialProcessResponse.model_validate(s) for s in report.special_processes_items]
    ft = [FAIFunctionalTestResponse.model_validate(t) for t in report.functional_tests_items]

    data = {
        "id": report.id,
        "plant_id": report.plant_id,
        "fai_type": report.fai_type,
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
        "material_supplier": report.material_supplier,
        "material_spec": report.material_spec,
        "special_processes": report.special_processes,
        "functional_test_results": report.functional_test_results,
        "status": report.status,
        "created_by": report.created_by,
        "created_at": report.created_at,
        "submitted_by": report.submitted_by,
        "submitted_at": report.submitted_at,
        "approved_by": report.approved_by,
        "approved_at": report.approved_at,
        "rejection_reason": report.rejection_reason,
        "parent_report_id": report.parent_report_id,
        "items": items,
        "materials": materials,
        "special_processes_items": sp,
        "functional_tests_items": ft,
    }
    return FAIReportDetailResponse.model_validate(data)


# ===========================================================================
# REPORT ENDPOINTS
# ===========================================================================


@router.post("/reports", response_model=FAIReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    body: FAIReportCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Create a new FAI report in draft status.

    Requires engineer+ role for the target plant.
    """
    check_plant_role(user, body.plant_id, "engineer")

    report = FAIReport(
        plant_id=body.plant_id,
        fai_type=body.fai_type,
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

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "create",
        "summary": f"FAI report '{report.part_name}' created for part '{report.part_number}'",
        "fields": {
            "name": report.part_name,
            "part_number": report.part_number,
            "revision": report.revision,
            "fai_type": report.fai_type,
            "status": report.status,
        },
    }

    logger.info("fai_report_created", report_id=report.id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.get("/reports", response_model=list[FAIReportResponse])
async def list_reports(
    plant_id: int = Query(..., description="Plant ID (required)"),
    report_status: str | None = Query(None, alias="status", description="Filter by status"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
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
    stmt = stmt.order_by(FAIReport.created_at.desc()).offset(offset).limit(limit)

    result = await session.execute(stmt)
    reports = list(result.scalars().all())
    return [FAIReportResponse.model_validate(r) for r in reports]


@router.get("/reports/{report_id}", response_model=FAIReportDetailResponse)
async def get_report(
    report_id: int,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportDetailResponse:
    """Get a single FAI report with all inspection items and Form 2 child tables.

    Requires supervisor+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id, load_details=True)
    check_plant_role(user, report.plant_id, "supervisor")

    return _report_detail_response(report)


@router.put("/reports/{report_id}", response_model=FAIReportResponse)
async def update_report(
    report_id: int,
    body: FAIReportUpdate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Update an FAI report header. Only draft reports can be edited.

    Requires engineer+ role for the report's plant.
    Invalidates any prior electronic signatures on this report.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    update_data = body.model_dump(exclude_unset=True)

    # Capture old values for audit trail before mutation
    old_values = {field: getattr(report, field) for field in update_data}
    old_name = report.part_name

    for field, value in update_data.items():
        setattr(report, field, value)

    # Invalidate any prior signatures — content has changed
    sig_engine = SignatureWorkflowEngine(session)
    await sig_engine.invalidate_signatures_for_resource(
        "fai_report", report_id, reason="FAI report edited after submission",
    )

    await session.commit()
    await session.refresh(report)

    # Build changed-fields dict for audit (old vs new, only changed)
    changed_fields: dict = {}
    for field in update_data:
        if old_values[field] != update_data[field]:
            changed_fields[field] = {"old": old_values[field], "new": update_data[field]}

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "update",
        "summary": f"FAI report '{old_name}' updated",
        "fields": {
            "old_values": {f: v["old"] for f, v in changed_fields.items()},
            "new_values": {f: v["new"] for f, v in changed_fields.items()},
        },
    }

    logger.info("fai_report_updated", report_id=report_id, user=user.username, fields=list(update_data.keys()))
    return FAIReportResponse.model_validate(report)


@router.delete("/reports/{report_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_report(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Delete an FAI report. Only draft reports can be deleted.

    Requires engineer+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    # Capture details before deletion for audit trail
    report_name = report.part_name
    report_part_number = report.part_number
    report_status = report.status
    item_count_result = await session.execute(
        select(sa_func.count()).where(FAIItem.report_id == report_id)
    )
    item_count = item_count_result.scalar_one()

    await session.delete(report)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "delete",
        "summary": f"FAI report '{report_name}' ({report_part_number}) deleted",
        "fields": {
            "name": report_name,
            "part_number": report_part_number,
            "status": report_status,
            "item_count": item_count,
        },
    }

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
    request: Request,
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

    # If measurements provided, compute actual_value as mean
    actual_value = body.actual_value
    if body.measurements and len(body.measurements) > 0:
        actual_value = sum(body.measurements) / len(body.measurements)

    item = FAIItem(
        report_id=report_id,
        balloon_number=body.balloon_number,
        characteristic_name=body.characteristic_name,
        drawing_zone=body.drawing_zone,
        nominal=body.nominal,
        usl=body.usl,
        lsl=body.lsl,
        actual_value=actual_value,
        value_type=body.value_type,
        actual_value_text=body.actual_value_text,
        measurements=_serialize_measurements(body.measurements),
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

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "create",
        "summary": f"Inspection item added to FAI report {report_id}",
        "fields": {
            "item_id": item.id,
            "characteristic_name": item.characteristic_name,
            "balloon_number": item.balloon_number,
            "sequence_order": item.sequence_order,
            "report_id": report_id,
        },
    }

    logger.info("fai_item_added", report_id=report_id, item_id=item.id, user=user.username)
    return _item_to_response(item)


@router.put("/reports/{report_id}/items/{item_id}", response_model=FAIItemResponse)
async def update_item(
    report_id: int,
    item_id: int,
    body: FAIItemUpdate,
    request: Request,
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

    # Capture old values for audit trail before mutation
    old_values = {field: getattr(item, field) for field in update_data}

    # Handle measurements: serialize to JSON, compute mean for actual_value
    if "measurements" in update_data:
        measurements = update_data.pop("measurements")
        item.measurements = _serialize_measurements(measurements)
        if measurements and len(measurements) > 0:
            item.actual_value = sum(measurements) / len(measurements)

    for field, value in update_data.items():
        setattr(item, field, value)

    await session.commit()
    await session.refresh(item)

    # Build changed-fields dict for audit (old vs new, only changed)
    all_update_fields = body.model_dump(exclude_unset=True)
    changed_fields: dict = {}
    for field in all_update_fields:
        old_val = old_values.get(field)
        new_val = all_update_fields[field]
        if old_val != new_val:
            changed_fields[field] = {"old": old_val, "new": new_val}

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "update",
        "summary": f"Inspection item {item_id} updated in FAI report {report_id}",
        "fields": {
            "item_id": item_id,
            "old_values": {f: v["old"] for f, v in changed_fields.items()},
            "new_values": {f: v["new"] for f, v in changed_fields.items()},
        },
    }

    logger.info("fai_item_updated", report_id=report_id, item_id=item_id, user=user.username)
    return _item_to_response(item)


@router.delete("/reports/{report_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_item(
    report_id: int,
    item_id: int,
    request: Request,
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

    # Capture item details before deletion for audit trail
    item_characteristic_name = item.characteristic_name
    item_balloon_number = item.balloon_number
    item_sequence_order = item.sequence_order
    item_result = item.result

    await session.delete(item)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "delete",
        "summary": f"Inspection item deleted from FAI report {report_id}",
        "fields": {
            "item_id": item_id,
            "characteristic_name": item_characteristic_name,
            "balloon_number": item_balloon_number,
            "sequence_order": item_sequence_order,
            "result": item_result,
        },
    }

    logger.info("fai_item_deleted", report_id=report_id, item_id=item_id, user=user.username)


# ===========================================================================
# FORM 2 CHILD TABLE ENDPOINTS — Materials
# ===========================================================================


@router.post(
    "/reports/{report_id}/materials",
    response_model=FAIMaterialResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_material(
    report_id: int,
    body: FAIMaterialCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIMaterialResponse:
    """Add a material record to an FAI report (Form 2)."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    material = FAIMaterial(
        report_id=report_id,
        material_part_number=body.material_part_number,
        material_spec=body.material_spec,
        cert_number=body.cert_number,
        supplier=body.supplier,
        result=body.result,
    )
    session.add(material)
    await session.commit()
    await session.refresh(material)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "create",
        "summary": f"Material record added to FAI report {report_id}",
        "fields": {"material_id": material.id, "supplier": material.supplier},
    }

    logger.info("fai_material_added", report_id=report_id, material_id=material.id, user=user.username)
    return FAIMaterialResponse.model_validate(material)


@router.delete(
    "/reports/{report_id}/materials/{material_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_material(
    report_id: int,
    material_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Remove a material record from an FAI report."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    stmt = select(FAIMaterial).where(FAIMaterial.id == material_id, FAIMaterial.report_id == report_id)
    result = await session.execute(stmt)
    material = result.scalar_one_or_none()
    if material is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Material {material_id} not found in report {report_id}",
        )

    supplier = material.supplier
    await session.delete(material)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "delete",
        "summary": f"Material record deleted from FAI report {report_id}",
        "fields": {"material_id": material_id, "supplier": supplier},
    }

    logger.info("fai_material_deleted", report_id=report_id, material_id=material_id, user=user.username)


# ===========================================================================
# FORM 2 CHILD TABLE ENDPOINTS — Special Processes
# ===========================================================================


@router.post(
    "/reports/{report_id}/special-processes",
    response_model=FAISpecialProcessResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_special_process(
    report_id: int,
    body: FAISpecialProcessCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAISpecialProcessResponse:
    """Add a special process record to an FAI report (Form 2)."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    sp = FAISpecialProcess(
        report_id=report_id,
        process_name=body.process_name,
        process_spec=body.process_spec,
        cert_number=body.cert_number,
        approved_supplier=body.approved_supplier,
        result=body.result,
    )
    session.add(sp)
    await session.commit()
    await session.refresh(sp)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "create",
        "summary": f"Special process added to FAI report {report_id}",
        "fields": {"process_id": sp.id, "process_name": sp.process_name},
    }

    logger.info("fai_special_process_added", report_id=report_id, sp_id=sp.id, user=user.username)
    return FAISpecialProcessResponse.model_validate(sp)


@router.delete(
    "/reports/{report_id}/special-processes/{process_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_special_process(
    report_id: int,
    process_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Remove a special process record from an FAI report."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    stmt = select(FAISpecialProcess).where(
        FAISpecialProcess.id == process_id, FAISpecialProcess.report_id == report_id
    )
    result = await session.execute(stmt)
    sp = result.scalar_one_or_none()
    if sp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Special process {process_id} not found in report {report_id}",
        )

    process_name = sp.process_name
    await session.delete(sp)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "delete",
        "summary": f"Special process deleted from FAI report {report_id}",
        "fields": {"process_id": process_id, "process_name": process_name},
    }

    logger.info("fai_special_process_deleted", report_id=report_id, sp_id=process_id, user=user.username)


# ===========================================================================
# FORM 2 CHILD TABLE ENDPOINTS — Functional Tests
# ===========================================================================


@router.post(
    "/reports/{report_id}/functional-tests",
    response_model=FAIFunctionalTestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_functional_test(
    report_id: int,
    body: FAIFunctionalTestCreate,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIFunctionalTestResponse:
    """Add a functional test record to an FAI report (Form 2)."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    ft = FAIFunctionalTest(
        report_id=report_id,
        test_description=body.test_description,
        procedure_number=body.procedure_number,
        actual_results=body.actual_results,
        result=body.result,
    )
    session.add(ft)
    await session.commit()
    await session.refresh(ft)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "create",
        "summary": f"Functional test added to FAI report {report_id}",
        "fields": {"test_id": ft.id, "test_description": ft.test_description},
    }

    logger.info("fai_functional_test_added", report_id=report_id, ft_id=ft.id, user=user.username)
    return FAIFunctionalTestResponse.model_validate(ft)


@router.delete(
    "/reports/{report_id}/functional-tests/{test_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_functional_test(
    report_id: int,
    test_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> None:
    """Remove a functional test record from an FAI report."""
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    stmt = select(FAIFunctionalTest).where(
        FAIFunctionalTest.id == test_id, FAIFunctionalTest.report_id == report_id
    )
    result = await session.execute(stmt)
    ft = result.scalar_one_or_none()
    if ft is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Functional test {test_id} not found in report {report_id}",
        )

    test_description = ft.test_description
    await session.delete(ft)
    await session.commit()

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "delete",
        "summary": f"Functional test deleted from FAI report {report_id}",
        "fields": {"test_id": test_id, "test_description": test_description},
    }

    logger.info("fai_functional_test_deleted", report_id=report_id, ft_id=test_id, user=user.username)


# ===========================================================================
# WORKFLOW ENDPOINTS
# ===========================================================================


@router.post("/reports/{report_id}/submit", response_model=FAIReportResponse)
async def submit_report(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse | JSONResponse:
    """Submit an FAI report for approval. Changes status: draft -> submitted.

    Requires engineer+ role for the report's plant.
    If a signature workflow is configured for ``fai_report``, the endpoint
    blocks the status transition until signatures are collected.  On first
    call it returns **428 Precondition Required** with
    ``signature_required: true`` and a ``workflow_instance_id``.  The
    frontend collects signatures via the ``SignatureDialog``, then re-calls
    this endpoint -- the second call detects the completed workflow and
    proceeds with the status change.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")
    _require_draft(report)

    # Check if a signature workflow is required BEFORE changing status
    sig_engine = SignatureWorkflowEngine(session)
    workflow_required = await sig_engine.check_workflow_required(
        session, "fai_report", report.plant_id,
    )

    if workflow_required:
        workflow_complete = await sig_engine.check_workflow_complete(
            "fai_report", report.id,
        )
        if not workflow_complete:
            # Re-use an existing pending instance or create a new one
            instance = await sig_engine.get_or_create_pending_workflow(
                "fai_report", report.id, user.id, report.plant_id,
            )
            await session.commit()
            logger.info(
                "fai_submit_blocked_pending_signature",
                report_id=report_id,
                workflow_instance_id=instance.id,
                user=user.username,
            )
            return JSONResponse(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                content={
                    "detail": "Signature required before submission",
                    "signature_required": True,
                    "workflow_instance_id": instance.id,
                },
            )

    report.status = "submitted"
    report.submitted_by = user.id
    report.submitted_at = datetime.now(timezone.utc)
    report.rejection_reason = None  # Clear any previous rejection

    await session.commit()
    await session.refresh(report)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "submit",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' submitted for approval",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "part_number": report.part_number,
            "serial_number": report.serial_number,
            "plant_id": report.plant_id,
        },
    }

    logger.info("fai_report_submitted", report_id=report_id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.post("/reports/{report_id}/approve", response_model=FAIReportResponse)
async def approve_report(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse | JSONResponse:
    """Approve a submitted FAI report. Changes status: submitted -> approved.

    Requires engineer+ role for the report's plant.
    Enforces separation of duties: approver cannot be the submitter.
    If a signature workflow is configured for ``fai_report``, the endpoint
    blocks the status transition until signatures are collected.  On first
    call it returns **428 Precondition Required** with
    ``signature_required: true`` and a ``workflow_instance_id``.  The
    frontend collects signatures via the ``SignatureDialog``, then re-calls
    this endpoint -- the second call detects the completed workflow and
    proceeds with the status change.
    """
    report = await _get_report_or_404(session, report_id)
    check_plant_role(user, report.plant_id, "engineer")

    if report.status != "submitted":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Report is in '{report.status}' status — only submitted reports can be approved",
        )

    # Separation of duties: approver must differ from submitter
    if report.submitted_by == user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Separation of duties: the approver cannot be the same person who submitted the report",
        )

    # Check if a signature workflow is required BEFORE changing status
    sig_engine = SignatureWorkflowEngine(session)
    workflow_required = await sig_engine.check_workflow_required(
        session, "fai_report", report.plant_id,
    )

    if workflow_required:
        workflow_complete = await sig_engine.check_workflow_complete(
            "fai_report", report.id,
        )
        if not workflow_complete:
            # Re-use an existing pending/in-progress workflow, or
            # create a new one (invalidating stale signatures first).
            instance = await sig_engine.get_or_create_pending_workflow(
                "fai_report", report.id, user.id, report.plant_id,
                invalidate_prior=True,
            )
            await session.commit()
            logger.info(
                "fai_approve_blocked_pending_signature",
                report_id=report_id,
                workflow_instance_id=instance.id,
                user=user.username,
            )
            return JSONResponse(
                status_code=status.HTTP_428_PRECONDITION_REQUIRED,
                content={
                    "detail": "Signature required before approval",
                    "signature_required": True,
                    "workflow_instance_id": instance.id,
                },
            )

    report.status = "approved"
    report.approved_by = user.id
    report.approved_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(report)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "approve",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' approved",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "part_number": report.part_number,
            "approved_by": user.username,
            "plant_id": report.plant_id,
        },
    }

    logger.info("fai_report_approved", report_id=report_id, user=user.username)
    return FAIReportResponse.model_validate(report)


@router.post("/reports/{report_id}/reject", response_model=FAIReportResponse)
async def reject_report(
    report_id: int,
    body: FAIRejectRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportResponse:
    """Reject a submitted FAI report. Changes status: submitted -> draft.

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

    # Invalidate any prior signatures — status has changed
    sig_engine = SignatureWorkflowEngine(session)
    await sig_engine.invalidate_signatures_for_resource(
        "fai_report", report.id, reason="FAI report rejected",
    )

    await session.commit()
    await session.refresh(report)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report.id,
        "action": "reject",
        "summary": f"FAI Report '{report.part_number} Rev {report.revision}' rejected",
        "fields": {
            "report_name": f"{report.part_number} Rev {report.revision}",
            "rejected_by": user.username,
            "reason": body.reason,
            "plant_id": report.plant_id,
        },
    }

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
    report = await _get_report_or_404(session, report_id, load_details=True)
    check_plant_role(user, report.plant_id, "supervisor")

    items = [_item_to_response(item) for item in report.items]
    materials = [FAIMaterialResponse.model_validate(m) for m in report.materials]
    sp = [FAISpecialProcessResponse.model_validate(s) for s in report.special_processes_items]
    ft = [FAIFunctionalTestResponse.model_validate(t) for t in report.functional_tests_items]

    return {
        "report_id": report.id,
        "status": report.status,
        "fai_type": report.fai_type,
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
            "materials": [m.model_dump() for m in materials],
            "special_processes": [s.model_dump() for s in sp],
            "functional_tests": [t.model_dump() for t in ft],
            # Legacy fields (read-only)
            "material_supplier": report.material_supplier,
            "material_spec": report.material_spec,
        },
        "form3_characteristic_accountability": {
            "total_characteristics": len(items),
            "pass_count": sum(1 for i in items if i.result == "pass"),
            "fail_count": sum(1 for i in items if i.result == "fail"),
            "deviation_count": sum(1 for i in items if i.result == "deviation"),
            "items": [item.model_dump() for item in items],
        },
    }


# ===========================================================================
# AS9102 STANDARD EXPORT (PDF / Excel)
# ===========================================================================


def _report_to_export_dict(report: FAIReport) -> dict:
    """Build a flat dict from a fully-loaded FAIReport for the export module."""
    items = [_item_to_response(item).model_dump() for item in report.items]
    materials = [FAIMaterialResponse.model_validate(m).model_dump() for m in report.materials]
    sp = [FAISpecialProcessResponse.model_validate(s).model_dump() for s in report.special_processes_items]
    ft = [FAIFunctionalTestResponse.model_validate(t).model_dump() for t in report.functional_tests_items]

    return {
        "id": report.id,
        "plant_id": report.plant_id,
        "fai_type": report.fai_type,
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
        "status": report.status,
        "created_by": report.created_by,
        "created_at": report.created_at,
        "submitted_by": report.submitted_by,
        "submitted_at": report.submitted_at,
        "approved_by": report.approved_by,
        "approved_at": report.approved_at,
        "parent_report_id": report.parent_report_id,
        "items": items,
        "materials": materials,
        "special_processes_items": sp,
        "functional_tests_items": ft,
    }


@router.get("/reports/{report_id}/export/pdf")
async def export_report_pdf(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Export an FAI report as an AS9102 Rev C PDF.

    Requires supervisor+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id, load_details=True)
    check_plant_role(user, report.plant_id, "supervisor")

    from cassini.core.fai_export import generate_fai_pdf

    export_data = _report_to_export_dict(report)
    pdf_bytes = generate_fai_pdf(export_data)

    part = report.part_number or "unknown"
    rev = report.revision or ""
    filename = f"FAI_{part}_Rev{rev}_{report_id}.pdf"

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "export",
        "summary": f"FAI report {report_id} exported as PDF",
        "fields": {"format": "pdf", "part_number": part},
    }

    logger.info("fai_report_exported", report_id=report_id, format="pdf", user=user.username)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/{report_id}/export/excel")
async def export_report_excel(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Export an FAI report as an AS9102 Rev C Excel workbook.

    Three sheets: Form 1, Form 2, Form 3.
    Requires supervisor+ role for the report's plant.
    """
    report = await _get_report_or_404(session, report_id, load_details=True)
    check_plant_role(user, report.plant_id, "supervisor")

    from cassini.core.fai_export import generate_fai_excel

    export_data = _report_to_export_dict(report)
    xlsx_bytes = generate_fai_excel(export_data)

    part = report.part_number or "unknown"
    rev = report.revision or ""
    filename = f"FAI_{part}_Rev{rev}_{report_id}.xlsx"

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": report_id,
        "action": "export",
        "summary": f"FAI report {report_id} exported as Excel",
        "fields": {"format": "excel", "part_number": part},
    }

    logger.info("fai_report_exported", report_id=report_id, format="excel", user=user.username)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ===========================================================================
# DELTA FAI
# ===========================================================================


@router.post("/reports/{report_id}/delta", response_model=FAIReportDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_delta_report(
    report_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_user),
) -> FAIReportDetailResponse:
    """Create a delta FAI report from an approved parent report.

    Copies all items from the parent, marking them as carried_forward=True.
    The user then modifies the items that need re-inspection.

    Rules:
    - Parent must be in "approved" status
    - Parent status is NOT changed by delta creation
    - Delta gets its own signature workflow (new resource)
    - Parent signatures are NOT invalidated

    Requires engineer+ role for the parent report's plant.
    """
    parent = await _get_report_or_404(session, report_id, load_details=True)
    check_plant_role(user, parent.plant_id, "engineer")

    if parent.status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Parent report is in '{parent.status}' status — only approved reports can have delta FAIs",
        )

    # Create the delta report, copying header fields from parent
    delta = FAIReport(
        plant_id=parent.plant_id,
        fai_type=parent.fai_type,
        part_number=parent.part_number,
        part_name=parent.part_name,
        revision=parent.revision,
        serial_number=parent.serial_number,
        lot_number=parent.lot_number,
        drawing_number=parent.drawing_number,
        organization_name=parent.organization_name,
        supplier=parent.supplier,
        purchase_order=parent.purchase_order,
        reason_for_inspection="delta",
        material_supplier=parent.material_supplier,
        material_spec=parent.material_spec,
        special_processes=parent.special_processes,
        functional_test_results=parent.functional_test_results,
        status="draft",
        created_by=user.id,
        parent_report_id=parent.id,
    )
    session.add(delta)
    await session.flush()  # Get delta.id

    # Copy items from parent, all marked as carried_forward
    for item in parent.items:
        delta_item = FAIItem(
            report_id=delta.id,
            balloon_number=item.balloon_number,
            characteristic_name=item.characteristic_name,
            drawing_zone=item.drawing_zone,
            nominal=item.nominal,
            usl=item.usl,
            lsl=item.lsl,
            actual_value=item.actual_value,
            value_type=item.value_type,
            actual_value_text=item.actual_value_text,
            measurements=item.measurements,
            unit=item.unit,
            tools_used=item.tools_used,
            designed_char=item.designed_char,
            result=item.result,
            deviation_reason=item.deviation_reason,
            characteristic_id=item.characteristic_id,
            sequence_order=item.sequence_order,
            carried_forward=True,
        )
        session.add(delta_item)

    # Copy Form 2 child tables
    for mat in parent.materials:
        session.add(FAIMaterial(
            report_id=delta.id,
            material_part_number=mat.material_part_number,
            material_spec=mat.material_spec,
            cert_number=mat.cert_number,
            supplier=mat.supplier,
            result=mat.result,
        ))

    for sp in parent.special_processes_items:
        session.add(FAISpecialProcess(
            report_id=delta.id,
            process_name=sp.process_name,
            process_spec=sp.process_spec,
            cert_number=sp.cert_number,
            approved_supplier=sp.approved_supplier,
            result=sp.result,
        ))

    for ft in parent.functional_tests_items:
        session.add(FAIFunctionalTest(
            report_id=delta.id,
            test_description=ft.test_description,
            procedure_number=ft.procedure_number,
            actual_results=ft.actual_results,
            result=ft.result,
        ))

    await session.commit()

    # Reload with all relationships for response
    delta = await _get_report_or_404(session, delta.id, load_details=True)

    request.state.audit_context = {
        "resource_type": "fai_report",
        "resource_id": delta.id,
        "action": "create",
        "summary": f"Delta FAI report created from parent #{report_id}",
        "fields": {
            "parent_report_id": report_id,
            "part_number": delta.part_number,
            "items_copied": len(delta.items),
        },
    }

    logger.info(
        "fai_delta_created",
        delta_id=delta.id,
        parent_id=report_id,
        items_copied=len(delta.items),
        user=user.username,
    )
    return _report_detail_response(delta)
