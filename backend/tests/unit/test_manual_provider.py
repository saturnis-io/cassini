"""Unit tests for ManualProvider.

Tests validation logic, callback invocation, and error handling for
manual sample submission.
"""

from datetime import datetime
from unittest.mock import AsyncMock, Mock

import pytest

from openspc.core.providers.manual import ManualProvider
from openspc.core.providers.protocol import SampleEvent
from openspc.db.models.characteristic import Characteristic


@pytest.fixture
def mock_char_repo():
    """Create a mock CharacteristicRepository."""
    return Mock()


@pytest.fixture
def manual_provider(mock_char_repo):
    """Create a ManualProvider instance with mock repository."""
    return ManualProvider(char_repo=mock_char_repo)


@pytest.fixture
def sample_characteristic():
    """Create a sample characteristic for testing."""
    char = Characteristic(
        id=1,
        hierarchy_id=1,
        name="Test Characteristic",
        description="Test description",
        subgroup_size=3,
        provider_type="MANUAL",
        target_value=10.0,
        usl=12.0,
        lsl=8.0,
    )
    return char


@pytest.mark.asyncio
class TestManualProviderBasics:
    """Test basic ManualProvider functionality."""

    async def test_provider_type(self, manual_provider):
        """Test that provider_type is MANUAL."""
        assert manual_provider.provider_type == "MANUAL"

    async def test_start_is_no_op(self, manual_provider):
        """Test that start() completes without error."""
        await manual_provider.start()
        # No assertions needed - just verify no exception

    async def test_stop_is_no_op(self, manual_provider):
        """Test that stop() completes without error."""
        await manual_provider.stop()
        # No assertions needed - just verify no exception

    async def test_set_callback(self, manual_provider):
        """Test setting a callback function."""
        callback = AsyncMock()
        manual_provider.set_callback(callback)
        # Callback is stored internally and will be tested in submit tests


@pytest.mark.asyncio
class TestManualProviderSubmitSample:
    """Test submit_sample() validation and processing."""

    async def test_successful_submission(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test successful sample submission with valid data."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute
        event = await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.1, 10.2, 10.0],
            batch_number="B123",
            operator_id="OPR-001",
        )

        # Verify repository was called
        mock_char_repo.get_by_id.assert_called_once_with(1)

        # Verify callback was invoked
        callback.assert_called_once()
        called_event = callback.call_args[0][0]
        assert isinstance(called_event, SampleEvent)
        assert called_event.characteristic_id == 1
        assert called_event.measurements == [10.1, 10.2, 10.0]
        assert called_event.context.batch_number == "B123"
        assert called_event.context.operator_id == "OPR-001"
        assert called_event.context.source == "MANUAL"

        # Verify returned event
        assert event == called_event
        assert isinstance(event.timestamp, datetime)

    async def test_submission_without_optional_context(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test submission with only required parameters."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute
        event = await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.1, 10.2, 10.0],
        )

        # Verify context has None values for optional fields
        assert event.context.batch_number is None
        assert event.context.operator_id is None
        assert event.context.source == "MANUAL"


@pytest.mark.asyncio
class TestManualProviderValidation:
    """Test validation error cases."""

    async def test_characteristic_not_found(self, manual_provider, mock_char_repo):
        """Test error when characteristic doesn't exist."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=None)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute and verify
        with pytest.raises(ValueError, match="Characteristic 999 not found"):
            await manual_provider.submit_sample(
                characteristic_id=999,
                measurements=[10.1, 10.2, 10.0],
            )

        # Verify callback was NOT invoked
        callback.assert_not_called()

    async def test_wrong_provider_type(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test error when characteristic is TAG type, not MANUAL."""
        # Setup - create TAG characteristic
        tag_char = Characteristic(
            id=2,
            hierarchy_id=1,
            name="Tag Characteristic",
            subgroup_size=1,
            provider_type="TAG",
            mqtt_topic="factory/line1/temp",
        )
        mock_char_repo.get_by_id = AsyncMock(return_value=tag_char)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute and verify
        with pytest.raises(
            ValueError,
            match="Characteristic 2 has provider_type=TAG, not MANUAL. "
            "Use the appropriate provider.",
        ):
            await manual_provider.submit_sample(
                characteristic_id=2,
                measurements=[25.5],
            )

        # Verify callback was NOT invoked
        callback.assert_not_called()

    async def test_wrong_measurement_count_too_few(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test error when too few measurements provided."""
        # Setup - characteristic expects 3 measurements
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute and verify
        with pytest.raises(
            ValueError,
            match="Expected 3 measurements for characteristic 1, got 2",
        ):
            await manual_provider.submit_sample(
                characteristic_id=1,
                measurements=[10.1, 10.2],  # Only 2 instead of 3
            )

        # Verify callback was NOT invoked
        callback.assert_not_called()

    async def test_wrong_measurement_count_too_many(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test error when too many measurements provided."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute and verify
        with pytest.raises(
            ValueError,
            match="Expected 3 measurements for characteristic 1, got 4",
        ):
            await manual_provider.submit_sample(
                characteristic_id=1,
                measurements=[10.1, 10.2, 10.0, 10.3],  # 4 instead of 3
            )

        # Verify callback was NOT invoked
        callback.assert_not_called()

    async def test_no_callback_set(self, manual_provider, mock_char_repo, sample_characteristic):
        """Test error when no callback is set."""
        # Setup - no callback set
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)

        # Execute and verify
        with pytest.raises(
            RuntimeError,
            match="No callback set - call set_callback\\(\\) before submitting samples",
        ):
            await manual_provider.submit_sample(
                characteristic_id=1,
                measurements=[10.1, 10.2, 10.0],
            )


@pytest.mark.asyncio
class TestManualProviderIntegration:
    """Test integration scenarios with realistic workflows."""

    async def test_multiple_samples_same_characteristic(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test submitting multiple samples for the same characteristic."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute - submit 3 samples
        event1 = await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.1, 10.2, 10.0],
            operator_id="OPR-001",
        )
        event2 = await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.0, 9.9, 10.1],
            operator_id="OPR-001",
        )
        event3 = await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.2, 10.3, 10.1],
            operator_id="OPR-002",
        )

        # Verify callback called 3 times
        assert callback.call_count == 3

        # Verify each event is unique
        assert event1.measurements != event2.measurements
        assert event2.measurements != event3.measurements
        # Timestamps should all be valid datetime objects
        assert isinstance(event1.timestamp, datetime)
        assert isinstance(event2.timestamp, datetime)
        assert isinstance(event3.timestamp, datetime)

    async def test_callback_receives_correct_event_data(
        self, manual_provider, mock_char_repo, sample_characteristic
    ):
        """Test that callback receives complete and accurate event data."""
        # Setup
        mock_char_repo.get_by_id = AsyncMock(return_value=sample_characteristic)
        received_events = []

        async def capture_callback(event: SampleEvent) -> None:
            """Callback that captures events for verification."""
            received_events.append(event)

        manual_provider.set_callback(capture_callback)

        # Execute
        await manual_provider.submit_sample(
            characteristic_id=1,
            measurements=[10.1, 10.2, 10.0],
            batch_number="BATCH-456",
            operator_id="OPR-003",
        )

        # Verify
        assert len(received_events) == 1
        event = received_events[0]

        assert event.characteristic_id == 1
        assert event.measurements == [10.1, 10.2, 10.0]
        assert event.context.batch_number == "BATCH-456"
        assert event.context.operator_id == "OPR-003"
        assert event.context.source == "MANUAL"
        assert isinstance(event.timestamp, datetime)

    async def test_subgroup_size_one(self, manual_provider, mock_char_repo):
        """Test with subgroup size of 1 (individuals chart)."""
        # Setup - create characteristic with subgroup_size=1
        char = Characteristic(
            id=3,
            hierarchy_id=1,
            name="Individual Characteristic",
            subgroup_size=1,
            provider_type="MANUAL",
        )
        mock_char_repo.get_by_id = AsyncMock(return_value=char)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute
        event = await manual_provider.submit_sample(
            characteristic_id=3,
            measurements=[15.7],  # Single measurement
        )

        # Verify
        assert len(event.measurements) == 1
        assert event.measurements[0] == 15.7
        callback.assert_called_once()

    async def test_large_subgroup_size(self, manual_provider, mock_char_repo):
        """Test with larger subgroup size."""
        # Setup - create characteristic with subgroup_size=10
        char = Characteristic(
            id=4,
            hierarchy_id=1,
            name="Large Subgroup Characteristic",
            subgroup_size=10,
            provider_type="MANUAL",
        )
        mock_char_repo.get_by_id = AsyncMock(return_value=char)
        callback = AsyncMock()
        manual_provider.set_callback(callback)

        # Execute
        measurements = [10.0 + i * 0.1 for i in range(10)]  # 10 measurements
        event = await manual_provider.submit_sample(
            characteristic_id=4,
            measurements=measurements,
        )

        # Verify
        assert len(event.measurements) == 10
        assert event.measurements == measurements
        callback.assert_called_once()
