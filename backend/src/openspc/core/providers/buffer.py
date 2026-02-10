"""Shared subgroup buffer for accumulating readings into samples.

This module provides the SubgroupBuffer and TagConfig classes, which are
shared across data providers (TagProvider, OPCUAProvider) for buffering
individual measurements into subgroups before sample submission.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class TagConfig:
    """Configuration for a tag subscription.

    Attributes:
        characteristic_id: ID of the characteristic this tag measures
        mqtt_topic: MQTT topic to subscribe to
        subgroup_size: Number of readings to accumulate per subgroup
        trigger_strategy: How to trigger sample submission
        trigger_tag: MQTT topic for trigger signal (used with ON_TRIGGER)
        buffer_timeout_seconds: Timeout for flushing partial buffers
    """

    characteristic_id: int
    mqtt_topic: str
    subgroup_size: int
    trigger_strategy: str = "on_change"
    trigger_tag: str | None = None
    metric_name: str | None = None
    buffer_timeout_seconds: float = 60.0


@dataclass
class SubgroupBuffer:
    """Buffer for accumulating readings into a subgroup.

    This buffer collects individual measurements until the subgroup size
    is reached or a timeout occurs, at which point the buffered values
    are flushed and submitted as a sample.

    Attributes:
        config: Configuration for this buffer
        values: Accumulated measurement values
        first_reading_time: Timestamp of first reading in current buffer
    """

    config: TagConfig
    values: list[float] = field(default_factory=list)
    first_reading_time: datetime | None = None

    def add(self, value: float) -> bool:
        """Add a value to the buffer.

        Args:
            value: Measurement value to add

        Returns:
            True if buffer is now full (reached subgroup_size)
        """
        if not self.values:
            self.first_reading_time = datetime.now(timezone.utc)
        self.values.append(value)
        return len(self.values) >= self.config.subgroup_size

    def is_ready(self) -> bool:
        """Check if buffer has enough readings to flush.

        Returns:
            True if buffer has reached subgroup_size
        """
        return len(self.values) >= self.config.subgroup_size

    def is_timed_out(self, timeout_seconds: float) -> bool:
        """Check if buffer has timed out.

        A buffer times out if it has pending values and the elapsed time
        since the first reading exceeds the timeout threshold.

        Args:
            timeout_seconds: Timeout threshold in seconds

        Returns:
            True if buffer has timed out
        """
        if not self.first_reading_time or not self.values:
            return False
        elapsed = (datetime.now(timezone.utc) - self.first_reading_time).total_seconds()
        return elapsed >= timeout_seconds

    def flush(self) -> list[float]:
        """Get all values and clear the buffer.

        Returns:
            List of buffered values (may be less than subgroup_size)
        """
        values = self.values.copy()
        self.values.clear()
        self.first_reading_time = None
        return values
