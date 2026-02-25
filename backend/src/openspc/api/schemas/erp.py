"""Pydantic schemas for ERP/LIMS connector endpoints."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ERPConnectorCreate(BaseModel):
    plant_id: int
    name: str = Field(..., min_length=1, max_length=255)
    connector_type: str = Field(..., pattern="^(sap_odata|oracle_rest|generic_lims|generic_webhook)$")
    base_url: str = Field(..., min_length=1, max_length=500)
    auth_type: str = Field(..., pattern="^(basic|oauth2_client_credentials|api_key|jwt_bearer)$")
    auth_config: dict[str, Any] = Field(default={}, description="Auth credentials (will be encrypted)")
    headers: dict[str, str] = Field(default={})
    is_active: bool = True


class ERPConnectorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    base_url: Optional[str] = Field(None, min_length=1, max_length=500)
    auth_type: Optional[str] = Field(None, pattern="^(basic|oauth2_client_credentials|api_key|jwt_bearer)$")
    auth_config: Optional[dict[str, Any]] = None
    headers: Optional[dict[str, str]] = None
    is_active: Optional[bool] = None


class ERPConnectorResponse(BaseModel):
    id: int
    plant_id: int
    name: str
    connector_type: str
    base_url: str
    auth_type: str
    headers: dict[str, str]
    is_active: bool
    status: str
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class ERPConnectorStatusResponse(BaseModel):
    id: int
    name: str
    status: str
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None


class ERPFieldMappingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    direction: str = Field(..., pattern="^(inbound|outbound|bidirectional)$")
    erp_entity: str = Field(..., min_length=1, max_length=100)
    erp_field_path: str = Field(..., min_length=1, max_length=500)
    openspc_entity: str = Field(..., pattern="^(characteristic|sample|violation)$")
    openspc_field: str = Field(..., min_length=1, max_length=100)
    transform: Optional[dict[str, Any]] = None
    is_active: bool = True


class ERPFieldMappingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    direction: Optional[str] = Field(None, pattern="^(inbound|outbound|bidirectional)$")
    erp_entity: Optional[str] = None
    erp_field_path: Optional[str] = None
    openspc_entity: Optional[str] = None
    openspc_field: Optional[str] = None
    transform: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ERPFieldMappingResponse(BaseModel):
    id: int
    connector_id: int
    name: str
    direction: str
    erp_entity: str
    erp_field_path: str
    openspc_entity: str
    openspc_field: str
    transform: Optional[dict[str, Any]] = None
    is_active: bool
    model_config = {"from_attributes": True}


class ERPSyncScheduleUpdate(BaseModel):
    direction: str = Field(..., pattern="^(inbound|outbound)$")
    cron_expression: str = Field(..., min_length=1, max_length=100)
    is_active: bool = True


class ERPSyncScheduleResponse(BaseModel):
    id: int
    connector_id: int
    direction: str
    cron_expression: str
    is_active: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class ERPSyncLogResponse(BaseModel):
    id: int
    connector_id: int
    direction: str
    status: str
    records_processed: int
    records_failed: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    detail: Optional[dict[str, Any]] = None
    model_config = {"from_attributes": True}


class ERPTestConnectionResponse(BaseModel):
    success: bool
    message: str
    details: Optional[dict[str, Any]] = None


class ERPManualSyncResponse(BaseModel):
    status: str
    records_processed: int
    records_failed: int
    message: str
