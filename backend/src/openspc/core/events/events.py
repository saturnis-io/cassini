"""Event definitions for OpenSPC event bus.

This module defines all domain events that can be published through the event bus.
Events follow the dataclass pattern with immutable timestamps for audit trails.
"""

from abc import ABC
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


class Event(ABC):
    """Base class for all events.

    All events include a UTC timestamp for ordering and audit purposes.
    Subclasses should be immutable dataclasses.

    Attributes:
        timestamp: UTC timestamp when event was created
    """

    timestamp: datetime


@dataclass
class SampleProcessedEvent(Event):
    """Emitted when a sample is processed by the SPC engine.

    This event is published after a sample has been analyzed, control charts
    have been updated, and zone classification is complete.

    Attributes:
        sample_id: Database ID of the processed sample
        characteristic_id: ID of the characteristic being monitored
        mean: Calculated mean value (or individual value for n=1)
        range_value: Range value for subgroup (None for n=1)
        zone: Zone classification (e.g., "zone_c_upper", "zone_a_lower")
        in_control: True if sample is within control limits
        timestamp: When the sample was processed
    """

    sample_id: int
    characteristic_id: int
    mean: float
    range_value: float | None
    zone: str
    in_control: bool
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ViolationCreatedEvent(Event):
    """Emitted when a new violation is detected.

    Published when a Nelson rule violation is detected and persisted
    to the database. Multiple violations may be created for a single sample
    if multiple rules are triggered.

    Attributes:
        violation_id: Database ID of the violation
        sample_id: ID of the sample that triggered the violation
        characteristic_id: ID of the characteristic being monitored
        rule_id: Nelson Rule number (1-8)
        rule_name: Human-readable rule name (e.g., "Outlier")
        severity: Severity level ("WARNING" or "CRITICAL")
        timestamp: When the violation was detected
    """

    violation_id: int
    sample_id: int
    characteristic_id: int
    rule_id: int
    rule_name: str
    severity: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ViolationAcknowledgedEvent(Event):
    """Emitted when a violation is acknowledged by a user.

    Published when a user acknowledges a violation, providing traceability
    for quality management workflows.

    Attributes:
        violation_id: Database ID of the violation
        user: Username of person who acknowledged the violation
        reason: Reason code or description for acknowledgment
        timestamp: When the acknowledgment occurred
    """

    violation_id: int
    user: str
    reason: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ControlLimitsUpdatedEvent(Event):
    """Emitted when control limits are recalculated.

    Published when control limits are updated, either through manual
    recalculation or automatic updates based on new data.

    Attributes:
        characteristic_id: ID of the characteristic
        center_line: New center line value
        ucl: Upper control limit
        lcl: Lower control limit
        method: Calculation method used (e.g., "moving_range", "subgroup_range")
        sample_count: Number of samples used in calculation
        timestamp: When limits were updated
    """

    characteristic_id: int
    center_line: float
    ucl: float
    lcl: float
    method: str = "moving_range"
    sample_count: int = 0
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CharacteristicUpdatedEvent(Event):
    """Emitted when characteristic configuration changes.

    Published when any characteristic configuration is modified,
    such as subgroup size, control limits, or provider settings.

    Attributes:
        characteristic_id: ID of the characteristic
        changes: Dictionary of changed fields and their new values
        timestamp: When the update occurred
    """

    characteristic_id: int
    changes: dict[str, Any]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CharacteristicCreatedEvent(Event):
    """Emitted when a new characteristic is created.

    Published when a characteristic is first created in the system.

    Attributes:
        characteristic_id: Database ID of the new characteristic
        name: Characteristic name
        hierarchy_id: ID of parent hierarchy node
        chart_type: Type of control chart (e.g., "xbar_r", "i_mr")
        timestamp: When the characteristic was created
    """

    characteristic_id: int
    name: str
    hierarchy_id: int
    chart_type: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class CharacteristicDeletedEvent(Event):
    """Emitted when a characteristic is deleted.

    Published when a characteristic is removed from the system.
    Subscribers can use this to clean up related resources.

    Attributes:
        characteristic_id: ID of the deleted characteristic
        name: Name of the deleted characteristic (for logging)
        timestamp: When the characteristic was deleted
    """

    characteristic_id: int
    name: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class AlertThresholdExceededEvent(Event):
    """Emitted when alert thresholds are exceeded.

    Published when violation counts or other metrics exceed
    configured alert thresholds.

    Attributes:
        characteristic_id: ID of the characteristic
        threshold_type: Type of threshold exceeded (e.g., "unacknowledged_count")
        threshold_value: The threshold that was exceeded
        current_value: Current value that exceeded threshold
        timestamp: When threshold was exceeded
    """

    characteristic_id: int
    threshold_type: str
    threshold_value: float
    current_value: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
