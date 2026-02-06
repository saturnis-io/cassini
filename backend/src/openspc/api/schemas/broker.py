"""Pydantic schemas for MQTT Broker operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BrokerCreate(BaseModel):
    """Schema for creating a new MQTT broker configuration.

    Attributes:
        name: Unique display name for this broker
        host: MQTT broker hostname or IP address
        port: MQTT broker port (default 1883, or 8883 for TLS)
        username: Optional username for authentication
        password: Optional password for authentication
        client_id: MQTT client identifier
        keepalive: Keepalive interval in seconds
        max_reconnect_delay: Maximum delay between reconnection attempts
        use_tls: Whether to use TLS encryption
        is_active: Whether this broker should be used for connections
    """

    name: str = Field(..., min_length=1, max_length=100)
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=1883, ge=1, le=65535)
    username: str | None = Field(None, max_length=100)
    password: str | None = Field(None, max_length=255)
    client_id: str = Field(default="openspc-client", max_length=100)
    keepalive: int = Field(default=60, ge=5, le=3600)
    max_reconnect_delay: int = Field(default=300, ge=10, le=3600)
    use_tls: bool = False
    is_active: bool = True


class BrokerUpdate(BaseModel):
    """Schema for updating an existing MQTT broker configuration.

    All fields are optional to support partial updates.
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    host: str | None = Field(None, min_length=1, max_length=255)
    port: int | None = Field(None, ge=1, le=65535)
    username: str | None = Field(None, max_length=100)
    password: str | None = Field(None, max_length=255)
    client_id: str | None = Field(None, max_length=100)
    keepalive: int | None = Field(None, ge=5, le=3600)
    max_reconnect_delay: int | None = Field(None, ge=10, le=3600)
    use_tls: bool | None = None
    is_active: bool | None = None


class BrokerResponse(BaseModel):
    """Schema for MQTT broker response.

    Note: Password is never returned in responses for security.
    """

    id: int
    name: str
    host: str
    port: int
    username: str | None
    client_id: str
    keepalive: int
    max_reconnect_delay: int
    use_tls: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BrokerConnectionStatus(BaseModel):
    """Schema for broker connection status.

    Attributes:
        broker_id: ID of the broker
        broker_name: Name of the broker
        is_connected: Whether currently connected
        last_connected: Timestamp of last successful connection
        error_message: Current error message if disconnected
        subscribed_topics: List of currently subscribed topics
    """

    broker_id: int
    broker_name: str
    is_connected: bool
    last_connected: datetime | None = None
    error_message: str | None = None
    subscribed_topics: list[str] = []


class BrokerTestRequest(BaseModel):
    """Schema for testing broker connection.

    Attributes:
        host: MQTT broker hostname
        port: MQTT broker port
        username: Optional username
        password: Optional password
        use_tls: Whether to use TLS
    """

    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(default=1883, ge=1, le=65535)
    username: str | None = None
    password: str | None = None
    use_tls: bool = False


class BrokerTestResponse(BaseModel):
    """Schema for broker connection test response."""

    success: bool
    message: str
    latency_ms: float | None = None


class DiscoveredTopicResponse(BaseModel):
    """Schema for a discovered MQTT topic."""

    topic: str
    message_count: int
    last_seen: datetime
    last_payload_size: int
    is_sparkplug: bool
    sparkplug_group: str | None = None
    sparkplug_node: str | None = None
    sparkplug_device: str | None = None
    sparkplug_message_type: str | None = None


class TopicTreeNodeResponse(BaseModel):
    """Schema for a topic tree node (recursive)."""

    name: str
    full_topic: str | None = None
    children: list["TopicTreeNodeResponse"] = []
    message_count: int = 0
    is_sparkplug: bool = False

    model_config = ConfigDict(from_attributes=True)


# Rebuild model for self-reference
TopicTreeNodeResponse.model_rebuild()


class BrokerAllStatesResponse(BaseModel):
    """Schema for multi-broker status response."""

    states: list[BrokerConnectionStatus]
