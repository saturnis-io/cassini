"""Pydantic schemas for Characteristic operations.

Schemas for SPC characteristic configuration and chart data.
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class SubgroupModeEnum(str, Enum):
    """Subgroup size handling modes for API schemas."""

    STANDARDIZED = "STANDARDIZED"
    VARIABLE_LIMITS = "VARIABLE_LIMITS"
    NOMINAL_TOLERANCE = "NOMINAL_TOLERANCE"


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

    # Subgroup mode configuration
    subgroup_mode: SubgroupModeEnum = Field(
        default=SubgroupModeEnum.NOMINAL_TOLERANCE,
        description="How to handle variable subgroup sizes",
    )
    min_measurements: int = Field(
        default=1, ge=1, description="Minimum measurements required per sample"
    )
    warn_below_count: int | None = Field(
        default=None, description="Warn when sample has fewer than this many measurements"
    )
    decimal_precision: int = Field(
        default=3, ge=0, le=10, description="Decimal places for display formatting"
    )

    @model_validator(mode="after")
    def validate_tag_config(self) -> Self:
        """Validate that TAG provider has required mqtt_topic."""
        if self.provider_type == "TAG" and not self.mqtt_topic:
            raise ValueError("mqtt_topic is required when provider_type is TAG")
        return self

    @model_validator(mode="after")
    def validate_subgroup_config(self) -> Self:
        """Validate subgroup mode configuration."""
        if self.min_measurements > self.subgroup_size:
            raise ValueError("min_measurements cannot exceed subgroup_size")
        if self.warn_below_count is not None:
            if self.warn_below_count < self.min_measurements:
                raise ValueError("warn_below_count must be >= min_measurements")
            if self.warn_below_count > self.subgroup_size:
                raise ValueError("warn_below_count cannot exceed subgroup_size")
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
        subgroup_mode: How to handle variable subgroup sizes
        min_measurements: Minimum measurements required per sample
        warn_below_count: Warn when sample has fewer than this many measurements
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None
    ucl: float | None = None
    lcl: float | None = None
    subgroup_mode: SubgroupModeEnum | None = None
    min_measurements: int | None = Field(None, ge=1)
    warn_below_count: int | None = None
    decimal_precision: int | None = Field(None, ge=0, le=10)


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
        subgroup_mode: How to handle variable subgroup sizes
        min_measurements: Minimum measurements required per sample
        warn_below_count: Warn when sample has fewer than this many measurements
        stored_sigma: Stored sigma for Mode A/B (set by recalculate-limits)
        stored_center_line: Stored center line for Mode A/B (set by recalculate-limits)
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
    subgroup_mode: str
    min_measurements: int
    warn_below_count: int | None
    stored_sigma: float | None
    stored_center_line: float | None
    decimal_precision: int

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
        center_line: Process mean (X-bar), None if not yet calculated
        ucl: Upper Control Limit, None if not yet calculated
        lcl: Lower Control Limit, None if not yet calculated
    """

    center_line: float | None = None
    ucl: float | None = None
    lcl: float | None = None


class ZoneBoundaries(BaseModel):
    """Schema for Nelson Rules zone boundaries.

    Zones are defined by standard deviations from the center line.
    Used for visualization and Nelson Rules detection.
    All values are None if control limits have not been calculated.

    Attributes:
        plus_1_sigma: +1 standard deviation boundary
        plus_2_sigma: +2 standard deviation boundary
        plus_3_sigma: +3 standard deviation boundary (UCL)
        minus_1_sigma: -1 standard deviation boundary
        minus_2_sigma: -2 standard deviation boundary
        minus_3_sigma: -3 standard deviation boundary (LCL)
    """

    plus_1_sigma: float | None = None
    plus_2_sigma: float | None = None
    plus_3_sigma: float | None = None
    minus_1_sigma: float | None = None
    minus_2_sigma: float | None = None
    minus_3_sigma: float | None = None


class ChartSample(BaseModel):
    """Schema for a single sample point on a control chart.

    Attributes:
        sample_id: Unique identifier of the sample
        timestamp: When the sample was taken
        mean: Subgroup mean (plotted value for X-bar chart)
        range: Subgroup range value for R chart (max - min)
        excluded: Whether this sample is excluded from calculations
        violation_ids: List of violation IDs for this sample
        zone: Which control zone the point falls in
        actual_n: Actual number of measurements in this sample
        is_undersized: Whether sample has fewer measurements than expected
        effective_ucl: Per-point UCL for Mode B (variable limits)
        effective_lcl: Per-point LCL for Mode B (variable limits)
        z_score: Z-score for Mode A (standardized)
        display_value: Value to plot (z_score for Mode A, mean for others)
    """

    sample_id: int
    timestamp: str  # ISO format datetime string
    mean: float
    range: float | None
    excluded: bool = False
    violation_ids: list[int] = []
    zone: str
    actual_n: int = 1
    is_undersized: bool = False
    effective_ucl: float | None = None
    effective_lcl: float | None = None
    z_score: float | None = None
    display_value: float | None = None


class SpecLimits(BaseModel):
    """Schema for specification limits (Voice of Customer).

    Attributes:
        usl: Upper Specification Limit
        lsl: Lower Specification Limit
        target: Target/nominal value
    """

    usl: float | None = None
    lsl: float | None = None
    target: float | None = None


class ChartDataResponse(BaseModel):
    """Schema for complete control chart data.

    Contains all information needed to render a control chart.

    Attributes:
        characteristic_id: ID of the characteristic
        characteristic_name: Display name of the characteristic
        data_points: List of sample points for chart rendering
        control_limits: UCL, CL, LCL values
        spec_limits: USL, LSL, target values
        zone_boundaries: Zone boundaries for visualization
        subgroup_mode: Subgroup handling mode for this characteristic
        nominal_subgroup_size: Expected/nominal subgroup size
        decimal_precision: Number of decimal places for display formatting
    """

    characteristic_id: int
    characteristic_name: str
    data_points: list[ChartSample]
    control_limits: ControlLimits
    spec_limits: SpecLimits
    zone_boundaries: ZoneBoundaries
    subgroup_mode: str = "NOMINAL_TOLERANCE"
    nominal_subgroup_size: int = 1
    decimal_precision: int = 3


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


class ChangeModeRequest(BaseModel):
    """Schema for changing subgroup mode with historical sample migration.

    Attributes:
        new_mode: The new subgroup handling mode
    """

    new_mode: SubgroupModeEnum = Field(..., description="New subgroup handling mode")


class ChangeModeResponse(BaseModel):
    """Schema for mode change response.

    Attributes:
        previous_mode: Mode before the change
        new_mode: Mode after the change
        samples_migrated: Number of samples recalculated
        characteristic: Updated characteristic
    """

    previous_mode: str
    new_mode: str
    samples_migrated: int
    characteristic: CharacteristicResponse
