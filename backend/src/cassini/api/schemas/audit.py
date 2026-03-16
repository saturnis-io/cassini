"""Pydantic schemas for audit log endpoints."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    resource_display: Optional[str] = None
    detail: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntry]
    total: int
    limit: int
    offset: int


class AuditStats(BaseModel):
    total_events: int
    events_by_action: dict[str, int]
    events_by_resource: dict[str, int]


class AuditIntegrityResult(BaseModel):
    verified_count: int
    valid: bool
    first_break_id: int | None = None
    first_break_timestamp: datetime | None = None
    message: str


class UserActivityEntry(BaseModel):
    """Per-user activity summary within a date range."""

    user_id: int | None = None
    username: str
    login_count: int
    actions_by_type: dict[str, int]
    violations_acknowledged: int


class UserActivitySummaryResponse(BaseModel):
    """Aggregated user activity report."""

    users: list[UserActivityEntry]
    start_date: datetime | None = None
    end_date: datetime | None = None
    total_actions: int
