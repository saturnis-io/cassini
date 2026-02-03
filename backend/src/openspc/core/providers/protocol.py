"""Data Provider protocol and supporting types.

This module defines the DataProvider protocol that all data providers
(Manual, Tag, etc.) must implement, along with the SampleEvent and
SampleContext data structures used for sample submission.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class SampleContext:
    """Context information for a sample.

    Attributes:
        batch_number: Optional batch/lot number for traceability
        operator_id: Optional operator identifier
        source: Data source type (MANUAL or TAG)
    """

    batch_number: str | None = None
    operator_id: str | None = None
    source: str = "MANUAL"  # "MANUAL" or "TAG"


@dataclass
class SampleEvent:
    """Event representing a new sample to process.

    This is the primary data structure passed from providers to the SPC engine.

    Attributes:
        characteristic_id: ID of the characteristic being measured
        measurements: List of measurement values (length must match subgroup_size)
        timestamp: When the sample was taken
        context: Additional context information
    """

    characteristic_id: int
    measurements: list[float]
    timestamp: datetime
    context: SampleContext


# Type alias for the callback function invoked when samples are ready
SampleCallback = Callable[[SampleEvent], Awaitable[None]]


class DataProvider(Protocol):
    """Protocol for data providers (Manual, Tag, etc.).

    All data providers must implement this protocol to integrate with
    the SPC processing pipeline.

    Example:
        >>> async def process_sample(event: SampleEvent) -> None:
        ...     print(f"Processing sample for char {event.characteristic_id}")
        ...
        >>> provider = ManualProvider(char_repo)
        >>> provider.set_callback(process_sample)
        >>> await provider.start()
    """

    @property
    def provider_type(self) -> str:
        """Return the provider type identifier.

        Returns:
            Provider type string (e.g., 'MANUAL', 'TAG')
        """
        ...

    async def start(self) -> None:
        """Start the provider.

        This method is called to initialize the provider and begin
        listening for data. For tag-based providers, this might involve
        subscribing to MQTT topics. For manual providers, this is typically
        a no-op.

        Raises:
            RuntimeError: If provider fails to start
        """
        ...

    async def stop(self) -> None:
        """Stop the provider.

        This method is called to gracefully shut down the provider and
        clean up resources (close connections, unsubscribe, etc.).
        """
        ...

    def set_callback(self, callback: SampleCallback) -> None:
        """Set the callback to invoke when samples are ready.

        The callback will be invoked asynchronously when new samples are
        available for processing.

        Args:
            callback: Async function to call with SampleEvent
        """
        ...
