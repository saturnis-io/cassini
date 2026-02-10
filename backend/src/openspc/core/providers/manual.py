"""Manual data provider for operator-entered measurements.

This module provides the ManualProvider class, which handles validation
and submission of manually-entered measurement data through the REST API.
"""

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from openspc.core.providers.protocol import SampleCallback, SampleContext, SampleEvent

if TYPE_CHECKING:
    from openspc.db.repositories import CharacteristicRepository


class ManualProvider:
    """Provider for manual (operator-entered) sample data.

    This provider validates manual sample submissions and routes them
    to the SPC processing engine. It ensures that:
    - The characteristic exists
    - The characteristic is configured for manual entry (not TAG)
    - The measurement count matches the configured subgroup size

    Args:
        char_repo: Repository for characteristic queries

    Example:
        >>> from openspc.db.repositories import CharacteristicRepository
        >>>
        >>> async def process_sample(event: SampleEvent) -> None:
        ...     print(f"Processing {event.characteristic_id}")
        ...
        >>> provider = ManualProvider(char_repo)
        >>> provider.set_callback(process_sample)
        >>> await provider.start()
        >>>
        >>> # Submit a sample
        >>> await provider.submit_sample(
        ...     characteristic_id=1,
        ...     measurements=[10.1, 10.2, 10.0],
        ...     operator_id="OPR-001"
        ... )
    """

    provider_type = "MANUAL"

    def __init__(
        self,
        char_repo: "CharacteristicRepository",
    ):
        """Initialize the manual provider.

        Args:
            char_repo: Repository for characteristic lookups
        """
        self._char_repo = char_repo
        self._callback: SampleCallback | None = None

    async def start(self) -> None:
        """Start the provider.

        Manual provider doesn't require startup logic since it's
        driven by explicit API calls rather than subscriptions.
        """
        pass

    async def stop(self) -> None:
        """Stop the provider.

        Manual provider doesn't require cleanup logic since it
        doesn't maintain persistent connections.
        """
        pass

    def set_callback(self, callback: SampleCallback) -> None:
        """Set the callback for sample processing.

        Args:
            callback: Async function to invoke with SampleEvent
        """
        self._callback = callback

    async def submit_sample(
        self,
        characteristic_id: int,
        measurements: list[float],
        batch_number: str | None = None,
        operator_id: str | None = None,
    ) -> SampleEvent:
        """Submit a manual sample for processing.

        This method validates the sample data and invokes the registered
        callback to process it through the SPC engine.

        Args:
            characteristic_id: ID of the characteristic being measured
            measurements: List of measurement values
            batch_number: Optional batch/lot number for traceability
            operator_id: Optional operator identifier

        Returns:
            SampleEvent that was submitted for processing

        Raises:
            ValueError: If characteristic not found
            ValueError: If characteristic is TAG type (not manual)
            ValueError: If measurement count doesn't match subgroup_size
            RuntimeError: If no callback is set

        Example:
            >>> event = await provider.submit_sample(
            ...     characteristic_id=1,
            ...     measurements=[10.1, 10.2, 10.0],
            ...     batch_number="B123",
            ...     operator_id="OPR-001"
            ... )
            >>> print(f"Submitted sample for char {event.characteristic_id}")
        """
        # Step 1: Validate characteristic exists (with data_source eager-loaded)
        char = await self._char_repo.get_with_data_source(characteristic_id)
        if char is None:
            raise ValueError(f"Characteristic {characteristic_id} not found")

        # Step 2: Validate characteristic has no data source (manual entry only)
        if char.data_source is not None:
            raise ValueError(
                f"Characteristic {characteristic_id} has a data source "
                f"(type={char.data_source.type}). Use the appropriate provider."
            )

        # Step 3: Validate measurement count matches subgroup_size
        if len(measurements) != char.subgroup_size:
            raise ValueError(
                f"Expected {char.subgroup_size} measurements for characteristic "
                f"{characteristic_id}, got {len(measurements)}"
            )

        # Step 4: Create sample event
        event = SampleEvent(
            characteristic_id=characteristic_id,
            measurements=measurements,
            timestamp=datetime.now(timezone.utc),
            context=SampleContext(
                batch_number=batch_number,
                operator_id=operator_id,
                source="MANUAL",
            ),
        )

        # Step 5: Invoke callback if set
        if self._callback is None:
            raise RuntimeError(
                "No callback set - call set_callback() before submitting samples"
            )

        await self._callback(event)

        return event
