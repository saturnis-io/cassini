"""Pydantic schemas for Characteristic operations.

Schemas for SPC characteristic configuration and chart data.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class CharacteristicCreate(BaseModel):
    """Schema for creating a new characteristic.

    Attributes:
        hierarchy_id: ID of the hierarchy node this belongs to
        name: Display name of the characteristic
        description: Optional detailed description
        subgroup_size: Number of measurements per sample (1-25)
        target_value: Target/nominal value for the process
        usl: Upper Specification Limit
        lsl: Lower Specification Limit
        provider_type: Data source type (MANUAL or TAG)
        mqtt_topic: MQTT topic for TAG provider (required if TAG)
        trigger_tag: Optional MQTT tag that triggers sample collection
    """

    hierarchy_id: int
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    subgroup_size: int = Field(default=1, ge=1, le=25)
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None
    provider_type: Literal["MANUAL", "TAG"]
    mqtt_topic: str | None = None
    trigger_tag: str | None = None

    @model_validator(mode="after")
    def validate_tag_config(self) -> Self:
        """Validate that TAG provider has required mqtt_topic."""
        if self.provider_type == "TAG" and not self.mqtt_topic:
            raise ValueError("mqtt_topic is required when provider_type is TAG")
        return self


class CharacteristicUpdate(BaseModel):
    """Schema for updating an existing characteristic.

    All fields are optional to support partial updates.
    Control limits (UCL/LCL) can be updated after initial control limit calculation.

    Attributes:
        name: New display name
        description: New description
        target_value: New target value
        usl: New Upper Specification Limit
        lsl: New Lower Specification Limit
        ucl: New Upper Control Limit (calculated from data)
        lcl: New Lower Control Limit (calculated from data)
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None
    ucl: float | None = None
    lcl: float | None = None


class CharacteristicResponse(BaseModel):
    """Schema for characteristic response.

    Attributes:
        id: Unique identifier
        hierarchy_id: Parent hierarchy node ID
        name: Display name
        description: Detailed description
        subgroup_size: Number of measurements per sample
        target_value: Target/nominal value
        usl: Upper Specification Limit
        lsl: Lower Specification Limit
        ucl: Upper Control Limit
        lcl: Lower Control Limit
        provider_type: Data source type
        mqtt_topic: MQTT topic for TAG provider
        trigger_tag: MQTT trigger tag
    """

    id: int
    hierarchy_id: int
    name: str
    description: str | None
    subgroup_size: int
    target_value: float | None
    usl: float | None
    lsl: float | None
    ucl: float | None
    lcl: float | None
    provider_type: str
    mqtt_topic: str | None
    trigger_tag: str | None

    model_config = ConfigDict(from_attributes=True)


class CharacteristicSummary(BaseModel):
    """Schema for characteristic summary in list views.

    Lightweight version with status indicators.

    Attributes:
        id: Unique identifier
        name: Display name
        provider_type: Data source type
        in_control: Whether the process is currently in control
        unacknowledged_violations: Count of unacknowledged violations
    """

    id: int
    name: str
    provider_type: str
    in_control: bool = True
    unacknowledged_violations: int = 0


class ControlLimits(BaseModel):
    """Schema for control chart limits.

    Attributes:
        center_line: Process mean (X-bar)
        ucl: Upper Control Limit
        lcl: Lower Control Limit
    """

    center_line: float
    ucl: float
    lcl: float


class ZoneBoundaries(BaseModel):
    """Schema for Nelson Rules zone boundaries.

    Zones are defined by standard deviations from the center line.
    Used for visualization and Nelson Rules detection.

    Attributes:
        plus_1_sigma: +1 standard deviation boundary
        plus_2_sigma: +2 standard deviation boundary
        plus_3_sigma: +3 standard deviation boundary (UCL)
        minus_1_sigma: -1 standard deviation boundary
        minus_2_sigma: -2 standard deviation boundary
        minus_3_sigma: -3 standard deviation boundary (LCL)
    """

    plus_1_sigma: float
    plus_2_sigma: float
    plus_3_sigma: float
    minus_1_sigma: float
    minus_2_sigma: float
    minus_3_sigma: float


class ChartSample(BaseModel):
    """Schema for a single sample point on a control chart.

    Attributes:
        sample_id: Unique identifier of the sample
        timestamp: When the sample was taken
        value: Plotted value (mean for X-bar chart)
        range_value: Range value for R chart (max - min)
        zone: Which control zone the point falls in (A, B, C, or Center)
        has_violation: Whether this sample triggered any Nelson Rules
        violation_rule_ids: List of triggered Nelson Rule IDs
    """

    sample_id: int
    timestamp: str  # ISO format datetime string
    value: float
    range_value: float | None
    zone: str
    has_violation: bool = False
    violation_rule_ids: list[int] = []


class ChartDataResponse(BaseModel):
    """Schema for complete control chart data.

    Contains all information needed to render a control chart.

    Attributes:
        characteristic_id: ID of the characteristic
        samples: List of sample points
        control_limits: UCL, CL, LCL values
        zones: Zone boundaries for visualization
    """

    characteristic_id: int
    samples: list[ChartSample]
    control_limits: ControlLimits
    zones: ZoneBoundaries


class NelsonRuleConfig(BaseModel):
    """Schema for configuring Nelson Rules per characteristic.

    Attributes:
        rule_id: Nelson Rule number (1-8)
        is_enabled: Whether this rule is active
    """

    rule_id: int = Field(..., ge=1, le=8, description="Nelson Rule ID (1-8)")
    is_enabled: bool = True


class ControlLimitsResponse(BaseModel):
    """Schema for control limit recalculation response.

    Contains before/after values and calculation metadata.

    Attributes:
        before: Control limits before recalculation
        after: Control limits after recalculation
        calculation: Metadata about the calculation process
    """

    before: dict
    after: dict
    calculation: dict
