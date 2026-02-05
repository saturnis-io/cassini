"""Polymorphic configuration schemas for characteristics.

Supports discriminated unions for Manual vs Tag configuration strategies.
"""

from datetime import time
from decimal import Decimal
from enum import Enum
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field


# ============================================================
# ENUMS
# ============================================================

class ConfigType(str, Enum):
    """Discriminator for configuration strategy."""
    MANUAL = "MANUAL"
    TAG = "TAG"


class ScheduleType(str, Enum):
    """Schedule pattern types for manual data collection."""
    NONE = "NONE"
    INTERVAL = "INTERVAL"
    SHIFT = "SHIFT"
    CRON = "CRON"
    BATCH_START = "BATCH_START"


class TriggerType(str, Enum):
    """Trigger strategies for automated tag data."""
    ON_UPDATE = "ON_UPDATE"
    ON_EVENT = "ON_EVENT"
    ON_VALUE_CHANGE = "ON_VALUE_CHANGE"


class EdgeType(str, Enum):
    """Edge detection for boolean triggers."""
    RISING = "RISING"
    FALLING = "FALLING"
    BOTH = "BOTH"


# ============================================================
# SCHEDULE DEFINITIONS (for ManualConfig)
# ============================================================

class IntervalSchedule(BaseModel):
    """Fixed interval scheduling (e.g., every 2 hours)."""
    schedule_type: Literal[ScheduleType.INTERVAL] = ScheduleType.INTERVAL
    interval_minutes: int = Field(..., ge=1, le=10080, description="Interval in minutes (max 7 days)")
    align_to_hour: bool = Field(True, description="Align schedule to clock hours")


class ShiftSchedule(BaseModel):
    """Shift-based scheduling."""
    schedule_type: Literal[ScheduleType.SHIFT] = ScheduleType.SHIFT
    shift_count: int = Field(3, ge=1, le=4, description="Number of shifts per day")
    shift_times: list[str] = Field(
        default_factory=lambda: ["06:00", "14:00", "22:00"],
        description="Start time of each shift (HH:MM format)"
    )
    samples_per_shift: int = Field(1, ge=1, le=10, description="Number of samples per shift")


class CronSchedule(BaseModel):
    """Cron-based scheduling for complex patterns."""
    schedule_type: Literal[ScheduleType.CRON] = ScheduleType.CRON
    cron_expression: str = Field(..., description="Cron expression (minute hour day month weekday)")


class BatchStartSchedule(BaseModel):
    """Triggered on batch number change."""
    schedule_type: Literal[ScheduleType.BATCH_START] = ScheduleType.BATCH_START
    batch_tag_path: str = Field(..., description="MQTT topic for batch number changes")
    delay_minutes: int = Field(0, ge=0, le=60, description="Delay after batch start")


class NoSchedule(BaseModel):
    """No scheduled sampling - ad-hoc/on-demand measurements."""
    schedule_type: Literal[ScheduleType.NONE] = ScheduleType.NONE


# Union of all schedule types
Schedule = Annotated[
    Union[NoSchedule, IntervalSchedule, ShiftSchedule, CronSchedule, BatchStartSchedule],
    Field(discriminator="schedule_type")
]


# ============================================================
# TRIGGER DEFINITIONS (for TagConfig)
# ============================================================

class OnUpdateTrigger(BaseModel):
    """Throttled update trigger."""
    trigger_type: Literal[TriggerType.ON_UPDATE] = TriggerType.ON_UPDATE
    throttle_seconds: int = Field(60, ge=1, le=86400, description="Minimum seconds between samples")
    require_change: bool = Field(False, description="Only trigger if value changed")


class OnEventTrigger(BaseModel):
    """Boolean tag edge trigger."""
    trigger_type: Literal[TriggerType.ON_EVENT] = TriggerType.ON_EVENT
    trigger_tag_path: str = Field(..., description="Boolean tag that triggers sampling")
    edge: EdgeType = Field(EdgeType.RISING, description="Edge type to detect")
    debounce_ms: int = Field(100, ge=0, le=10000, description="Debounce period in milliseconds")


class OnValueChangeTrigger(BaseModel):
    """Deadband-based trigger."""
    trigger_type: Literal[TriggerType.ON_VALUE_CHANGE] = TriggerType.ON_VALUE_CHANGE
    deadband: Decimal = Field(..., ge=0, description="Minimum change to trigger")
    deadband_type: Literal["ABSOLUTE", "PERCENT"] = Field("ABSOLUTE")
    min_interval_seconds: int = Field(1, ge=1, description="Minimum seconds between triggers")


# Union of all trigger types
TriggerStrategy = Annotated[
    Union[OnUpdateTrigger, OnEventTrigger, OnValueChangeTrigger],
    Field(discriminator="trigger_type")
]


# ============================================================
# STRATEGY A: ManualConfig
# ============================================================

class ManualConfig(BaseModel):
    """Configuration for human operator data entry."""
    config_type: Literal[ConfigType.MANUAL] = ConfigType.MANUAL

    # UI Generation Fields
    instructions: str = Field(
        "",
        max_length=2000,
        description="Instructions displayed to operator during data entry"
    )

    # Scheduling
    schedule: Schedule = Field(..., description="When measurements are due")

    # Grace period for late entries
    grace_period_minutes: int = Field(
        30,
        ge=0,
        le=480,
        description="Minutes after due time before marking as overdue"
    )


# ============================================================
# STRATEGY B: TagConfig
# ============================================================

class TagConfig(BaseModel):
    """Configuration for automated MQTT/PLC data ingestion."""
    config_type: Literal[ConfigType.TAG] = ConfigType.TAG

    # Source Tag
    source_tag_path: str = Field(
        ...,
        description="MQTT topic path for value"
    )

    # Trigger Strategy
    trigger: TriggerStrategy = Field(..., description="When to capture a sample")

    # Optional context tags
    batch_tag_path: Optional[str] = Field(
        None,
        description="MQTT topic for batch number (auto-populated context)"
    )

    # Data validation
    min_valid_value: Optional[Decimal] = Field(None, description="Reject values below this")
    max_valid_value: Optional[Decimal] = Field(None, description="Reject values above this")


# ============================================================
# DISCRIMINATED UNION: CharacteristicConfig
# ============================================================

CharacteristicConfig = Annotated[
    Union[ManualConfig, TagConfig],
    Field(discriminator="config_type")
]


# ============================================================
# API REQUEST/RESPONSE MODELS
# ============================================================

class CharacteristicConfigResponse(BaseModel):
    """Response model for characteristic config."""
    characteristic_id: int
    config: CharacteristicConfig
    is_active: bool = True

    class Config:
        from_attributes = True


class CharacteristicConfigUpdate(BaseModel):
    """Request model for updating characteristic config."""
    config: CharacteristicConfig
