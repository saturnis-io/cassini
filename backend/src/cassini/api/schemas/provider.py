"""Pydantic schemas for data provider endpoints."""

from datetime import datetime

from pydantic import BaseModel


class TagProviderStatusResponse(BaseModel):
    """Response schema for TAG provider status."""

    is_running: bool
    subscribed_topics: list[str]
    characteristics_count: int
    samples_processed: int
    last_sample_time: datetime | None
    error_message: str | None


class MQTTStatusResponse(BaseModel):
    """Response schema for MQTT connection status."""

    is_connected: bool
    broker_id: int | None
    broker_name: str | None
    last_connected: datetime | None
    error_message: str | None
    subscribed_topics: list[str]


class ProviderStatusResponse(BaseModel):
    """Combined provider status response."""

    mqtt: MQTTStatusResponse
    tag_provider: TagProviderStatusResponse
