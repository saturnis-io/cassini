"""Pydantic schemas for DataSource operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DataSourceResponse(BaseModel):
    """Base data source response included in characteristic responses."""

    id: int
    type: str
    characteristic_id: int
    trigger_strategy: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MQTTDataSourceResponse(DataSourceResponse):
    """MQTT-specific data source response."""

    broker_id: int | None = None
    topic: str
    metric_name: str | None = None
    trigger_tag: str | None = None
    broker_name: str | None = None
