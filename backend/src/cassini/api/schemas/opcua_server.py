"""Pydantic schemas for OPC-UA Server operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OPCUAServerCreate(BaseModel):
    """Schema for creating a new OPC-UA server configuration."""

    name: str = Field(..., min_length=1, max_length=100)
    endpoint_url: str = Field(
        ..., min_length=1, max_length=500, pattern=r"^opc\.tcp://"
    )
    auth_mode: str = Field(
        default="anonymous", pattern=r"^(anonymous|username_password)$"
    )
    username: str | None = Field(None, max_length=255)
    password: str | None = Field(None, max_length=255)
    security_policy: str = Field(
        default="None", pattern=r"^(None|Basic256Sha256)$"
    )
    security_mode: str = Field(
        default="None", pattern=r"^(None|Sign|SignAndEncrypt)$"
    )
    is_active: bool = True
    session_timeout: int = Field(default=30000, ge=1000, le=300000)
    publishing_interval: int = Field(default=1000, ge=50, le=60000)
    sampling_interval: int = Field(default=250, ge=10, le=60000)
    plant_id: int | None = Field(None, description="Plant this server belongs to")


class OPCUAServerUpdate(BaseModel):
    """Schema for updating an OPC-UA server (partial)."""

    name: str | None = Field(None, min_length=1, max_length=100)
    endpoint_url: str | None = Field(
        None, min_length=1, max_length=500, pattern=r"^opc\.tcp://"
    )
    auth_mode: str | None = Field(
        None, pattern=r"^(anonymous|username_password)$"
    )
    username: str | None = None
    password: str | None = None
    security_policy: str | None = Field(
        None, pattern=r"^(None|Basic256Sha256)$"
    )
    security_mode: str | None = Field(
        None, pattern=r"^(None|Sign|SignAndEncrypt)$"
    )
    is_active: bool | None = None
    session_timeout: int | None = Field(None, ge=1000, le=300000)
    publishing_interval: int | None = Field(None, ge=50, le=60000)
    sampling_interval: int | None = Field(None, ge=10, le=60000)


class OPCUAServerResponse(BaseModel):
    """Response schema. Password is NEVER returned."""

    id: int
    name: str
    endpoint_url: str
    auth_mode: str
    username: str | None
    security_policy: str
    security_mode: str
    is_active: bool
    session_timeout: int
    publishing_interval: int
    sampling_interval: int
    plant_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OPCUAServerConnectionStatus(BaseModel):
    """Connection status for an OPC-UA server."""

    server_id: int
    server_name: str
    endpoint_url: str
    is_connected: bool
    last_connected: datetime | None = None
    error_message: str | None = None
    monitored_nodes: list[str] = []


class OPCUAServerTestRequest(BaseModel):
    """Schema for testing OPC-UA server connection."""

    endpoint_url: str = Field(
        ..., min_length=1, max_length=500, pattern=r"^opc\.tcp://"
    )
    auth_mode: str = Field(
        default="anonymous", pattern=r"^(anonymous|username_password)$"
    )
    username: str | None = None
    password: str | None = None
    timeout: float = Field(default=5.0, ge=1.0, le=30.0)


class OPCUAServerTestResponse(BaseModel):
    """Response for connection test."""

    success: bool
    message: str
    latency_ms: float | None = None
    server_name: str | None = None


class OPCUAAllStatesResponse(BaseModel):
    """Multi-server status response."""

    states: list[OPCUAServerConnectionStatus]


class BrowsedNodeResponse(BaseModel):
    """Schema for a discovered OPC-UA node."""

    node_id: str
    browse_name: str
    display_name: str
    node_class: str
    data_type: str | None = None
    is_readable: bool = False
    children_count: int | None = None


class NodeValueResponse(BaseModel):
    """Schema for a node value read."""

    node_id: str
    value: str | float | int | bool | None = None
    data_type: str | None = None
    source_timestamp: datetime | None = None
    server_timestamp: datetime | None = None
    status_code: str
