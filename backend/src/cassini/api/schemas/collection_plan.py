"""Collection Plan API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CollectionPlanItemCreate(BaseModel):
    characteristic_id: int
    sequence_order: int = Field(..., ge=0)
    instructions: str | None = None
    required: bool = True


class CollectionPlanCreate(BaseModel):
    name: str = Field(..., max_length=255)
    plant_id: int
    description: str | None = None
    items: list[CollectionPlanItemCreate] = Field(..., min_length=1)


class CollectionPlanUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    items: list[CollectionPlanItemCreate] | None = None


class CollectionPlanItemResponse(BaseModel):
    id: int
    characteristic_id: int
    characteristic_name: str | None = None
    hierarchy_path: str | None = None
    sequence_order: int
    instructions: str | None = None
    required: bool
    usl: float | None = None
    lsl: float | None = None
    target_value: float | None = None
    subgroup_size: int = 1


class CollectionPlanResponse(BaseModel):
    id: int
    plant_id: int
    name: str
    description: str | None = None
    is_active: bool
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime | None = None
    item_count: int = 0


class CollectionPlanDetailResponse(CollectionPlanResponse):
    items: list[CollectionPlanItemResponse] = []


class CollectionPlanExecutionCreate(BaseModel):
    items_completed: int = Field(..., ge=0)
    items_skipped: int = Field(..., ge=0)
    status: str = Field(..., pattern=r"^(completed|abandoned)$")


class CollectionPlanExecutionResponse(BaseModel):
    id: int
    plan_id: int
    executed_by: int | None = None
    started_at: datetime
    completed_at: datetime | None = None
    status: str
    items_completed: int
    items_skipped: int


class StaleItemInfo(BaseModel):
    """Info about a characteristic that is no longer valid for execution."""
    characteristic_id: int
    characteristic_name: str | None = None
    reason: str


class ExecutionStartResponse(BaseModel):
    """Response when starting a plan execution."""
    execution_id: int
    plan_id: int
    started_at: datetime
    items: list[CollectionPlanItemResponse]
