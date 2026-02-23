"""FAI (First Article Inspection) API schemas — AS9102 Rev C."""
from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, Field


# ── Request Schemas ──────────────────────────────────────────

class FAIReportCreate(BaseModel):
    plant_id: int
    part_number: str = Field(..., max_length=100)
    part_name: str | None = Field(None, max_length=255)
    revision: str | None = Field(None, max_length=50)
    serial_number: str | None = Field(None, max_length=100)
    lot_number: str | None = Field(None, max_length=100)
    drawing_number: str | None = Field(None, max_length=100)
    organization_name: str | None = Field(None, max_length=255)
    supplier: str | None = Field(None, max_length=255)
    purchase_order: str | None = Field(None, max_length=100)
    reason_for_inspection: str | None = Field(None, max_length=50)
    # Form 2
    material_supplier: str | None = Field(None, max_length=255)
    material_spec: str | None = Field(None, max_length=255)
    special_processes: str | None = None  # JSON array string
    functional_test_results: str | None = None  # JSON string


class FAIReportUpdate(BaseModel):
    part_number: str | None = Field(None, max_length=100)
    part_name: str | None = Field(None, max_length=255)
    revision: str | None = Field(None, max_length=50)
    serial_number: str | None = Field(None, max_length=100)
    lot_number: str | None = Field(None, max_length=100)
    drawing_number: str | None = Field(None, max_length=100)
    organization_name: str | None = Field(None, max_length=255)
    supplier: str | None = Field(None, max_length=255)
    purchase_order: str | None = Field(None, max_length=100)
    reason_for_inspection: str | None = Field(None, max_length=50)
    material_supplier: str | None = Field(None, max_length=255)
    material_spec: str | None = Field(None, max_length=255)
    special_processes: str | None = None
    functional_test_results: str | None = None


class FAIItemCreate(BaseModel):
    balloon_number: int = 1
    characteristic_name: str = Field("", max_length=255)
    nominal: float | None = None
    usl: float | None = None
    lsl: float | None = None
    actual_value: float | None = None
    unit: str = Field("mm", max_length=50)
    tools_used: str | None = Field(None, max_length=255)
    designed_char: bool = False
    result: str = Field("pass", pattern=r"^(pass|fail|deviation)$")
    deviation_reason: str | None = None
    characteristic_id: int | None = None


class FAIItemUpdate(BaseModel):
    balloon_number: int | None = None
    characteristic_name: str | None = Field(None, max_length=255)
    nominal: float | None = None
    usl: float | None = None
    lsl: float | None = None
    actual_value: float | None = None
    unit: str | None = Field(None, max_length=50)
    tools_used: str | None = Field(None, max_length=255)
    designed_char: bool | None = None
    result: str | None = Field(None, pattern=r"^(pass|fail|deviation)$")
    deviation_reason: str | None = None
    characteristic_id: int | None = None


class FAIRejectRequest(BaseModel):
    reason: str


# ── Response Schemas ─────────────────────────────────────────

class FAIItemResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    report_id: int
    balloon_number: int
    characteristic_name: str
    nominal: float | None
    usl: float | None
    lsl: float | None
    actual_value: float | None
    unit: str
    tools_used: str | None
    designed_char: bool
    result: str
    deviation_reason: str | None
    characteristic_id: int | None
    sequence_order: int


class FAIReportResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    plant_id: int
    part_number: str
    part_name: str | None
    revision: str | None
    serial_number: str | None
    lot_number: str | None
    drawing_number: str | None
    organization_name: str | None
    supplier: str | None
    purchase_order: str | None
    reason_for_inspection: str | None
    material_supplier: str | None
    material_spec: str | None
    special_processes: str | None
    functional_test_results: str | None
    status: str
    created_by: int
    created_at: datetime
    submitted_by: int | None
    submitted_at: datetime | None
    approved_by: int | None
    approved_at: datetime | None
    rejection_reason: str | None


class FAIReportDetailResponse(FAIReportResponse):
    items: list[FAIItemResponse] = []
