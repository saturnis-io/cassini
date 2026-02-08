"""Pydantic schemas for tag mapping operations."""

from datetime import datetime

from pydantic import BaseModel, Field


class TagMappingCreate(BaseModel):
    """Schema for creating a tag-to-characteristic mapping.

    Attributes:
        characteristic_id: ID of the characteristic to map
        mqtt_topic: MQTT topic that provides values for this characteristic
        trigger_strategy: How to trigger sample submission (on_change, on_trigger, on_timer)
        trigger_tag: MQTT topic for trigger signal (used with on_trigger)
        broker_id: ID of the broker this tag is on
    """

    characteristic_id: int
    mqtt_topic: str = Field(..., min_length=1, max_length=500)
    trigger_strategy: str = Field(default="on_change", pattern="^(on_change|on_trigger|on_timer)$")
    trigger_tag: str | None = Field(None, max_length=500)
    broker_id: int
    metric_name: str | None = Field(None, max_length=255)


class TagMappingResponse(BaseModel):
    """Schema for tag mapping response.

    Attributes:
        characteristic_id: ID of the characteristic
        characteristic_name: Name of the characteristic
        mqtt_topic: Mapped MQTT topic
        trigger_strategy: Trigger strategy
        trigger_tag: Trigger tag topic (if any)
        broker_id: ID of the broker
        broker_name: Name of the broker
    """

    characteristic_id: int
    characteristic_name: str
    mqtt_topic: str
    trigger_strategy: str
    trigger_tag: str | None = None
    broker_id: int
    broker_name: str
    metric_name: str | None = None


class TagPreviewValue(BaseModel):
    """A single value received during topic preview."""

    value: float | str | bool
    timestamp: datetime
    raw_payload: str
    metric_name: str | None = None


class TagPreviewRequest(BaseModel):
    """Schema for requesting a topic value preview."""

    broker_id: int
    topic: str = Field(..., min_length=1, max_length=500)
    duration_seconds: float = Field(default=5.0, ge=1.0, le=30.0)


class TagPreviewResponse(BaseModel):
    """Schema for topic preview response.

    Attributes:
        topic: The topic that was previewed
        values: List of sampled values
        sample_count: Number of values collected
        started_at: When sampling started
        duration_seconds: How long sampling ran
    """

    topic: str
    values: list[TagPreviewValue]
    sample_count: int
    started_at: datetime
    duration_seconds: float
