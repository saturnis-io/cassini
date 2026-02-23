"""Gage Bridge API schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# -- Request Schemas --------------------------------------------------------


class GageBridgeCreate(BaseModel):
    plant_id: int
    name: str = Field(..., max_length=255)
    mqtt_broker_id: int | None = None


class GageBridgeUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    mqtt_broker_id: int | None = None


class GagePortCreate(BaseModel):
    port_name: str = Field(..., max_length=50)
    baud_rate: int = 9600
    data_bits: int = 8
    parity: str = Field("none", pattern=r"^(none|even|odd)$")
    stop_bits: float = Field(1.0, ge=1.0, le=2.0)
    protocol_profile: str = Field("generic", pattern=r"^(mitutoyo_digimatic|generic)$")
    parse_pattern: str | None = Field(None, max_length=500)
    characteristic_id: int | None = None
    is_active: bool = True


class GagePortUpdate(BaseModel):
    port_name: str | None = Field(None, max_length=50)
    baud_rate: int | None = None
    data_bits: int | None = None
    parity: str | None = Field(None, pattern=r"^(none|even|odd)$")
    stop_bits: float | None = Field(None, ge=1.0, le=2.0)
    protocol_profile: str | None = Field(None, pattern=r"^(mitutoyo_digimatic|generic)$")
    parse_pattern: str | None = None
    characteristic_id: int | None = None
    is_active: bool | None = None


class BridgeHeartbeat(BaseModel):
    status: str = Field("online", pattern=r"^(online|error)$")


# -- Response Schemas -------------------------------------------------------


class GagePortResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    bridge_id: int
    port_name: str
    baud_rate: int
    data_bits: int
    parity: str
    stop_bits: float
    protocol_profile: str
    parse_pattern: str | None
    mqtt_topic: str
    characteristic_id: int | None
    is_active: bool
    created_at: datetime


class GageBridgeResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    plant_id: int
    name: str
    mqtt_broker_id: int | None
    status: str
    last_heartbeat_at: datetime | None
    registered_by: int
    created_at: datetime


class GageBridgeDetailResponse(GageBridgeResponse):
    ports: list[GagePortResponse] = []


class GageBridgeRegistered(GageBridgeResponse):
    """Returned only on registration -- includes the plaintext API key (shown once)."""
    api_key: str


class GageProfileResponse(BaseModel):
    id: str
    name: str
    description: str
    default_baud_rate: int
    default_data_bits: int
    default_parity: str
    default_stop_bits: float
    parse_pattern: str | None
