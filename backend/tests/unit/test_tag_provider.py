"""Unit tests for TagProvider.

Tests subscription management, buffer accumulation, trigger strategies,
timeout handling, and callback invocation for tag-based sample processing.
"""

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, Mock, PropertyMock

import pytest

from cassini.core.providers.buffer import SubgroupBuffer, TagConfig
from cassini.core.providers.protocol import SampleEvent
from cassini.core.providers.tag import TagProvider
from cassini.db.models.data_source import TriggerStrategy


def _make_mqtt_source(
    *,
    id: int = 1,
    char_id: int = 1,
    char_name: str = "Test",
    hierarchy_id: int = 1,
    subgroup_size: int = 5,
    topic: str = "test/topic",
    trigger_strategy: str = TriggerStrategy.ON_CHANGE.value,
    trigger_tag: str | None = None,
    metric_name: str | None = None,
    json_path: str | None = None,
    is_active: bool = True,
    product_code: str | None = None,
    product_json_path: str | None = None,
) -> Mock:
    """Create a mock MQTTDataSource with an attached mock Characteristic."""
    char = Mock()
    char.id = char_id
    char.hierarchy_id = hierarchy_id
    char.name = char_name
    char.subgroup_size = subgroup_size
    char.custom_fields_schema = None

    src = Mock()
    src.id = id
    src.topic = topic
    src.trigger_strategy = trigger_strategy
    src.trigger_tag = trigger_tag
    src.metric_name = metric_name
    src.json_path = json_path
    src.is_active = is_active
    src.characteristic = char
    src.product_code = product_code
    src.product_json_path = product_json_path
    src.metadata_json_paths = None
    return src


@pytest.fixture
def mock_mqtt_client():
    """Create a mock MQTTClient."""
    client = Mock()
    client.subscribe = AsyncMock()
    client.unsubscribe = AsyncMock()
    return client


@pytest.fixture
def mock_ds_repo():
    """Create a mock DataSourceRepository."""
    return Mock()


@pytest.fixture
def tag_provider(mock_mqtt_client, mock_ds_repo):
    """Create a TagProvider instance with mock dependencies."""
    return TagProvider(mqtt_client=mock_mqtt_client, ds_repo=mock_ds_repo)


@pytest.fixture
def sample_mqtt_source():
    """Create a sample MQTT data source for testing."""
    return _make_mqtt_source(
        id=1,
        char_id=1,
        char_name="Temperature Sensor",
        subgroup_size=5,
        topic="factory/line1/temp",
    )


@pytest.fixture
def triggered_mqtt_source():
    """Create an MQTT data source with trigger tag."""
    return _make_mqtt_source(
        id=2,
        char_id=2,
        char_name="Part Dimension",
        subgroup_size=3,
        topic="factory/line1/width",
        trigger_strategy=TriggerStrategy.ON_TRIGGER.value,
        trigger_tag="factory/line1/trigger",
    )


@pytest.mark.asyncio
class TestTagProviderBasics:
    """Test basic TagProvider functionality."""

    async def test_provider_type(self, tag_provider):
        """Test that provider_type is TAG."""
        assert tag_provider.provider_type == "TAG"

    async def test_set_callback(self, tag_provider):
        """Test setting a callback function."""
        callback = AsyncMock()
        tag_provider.set_callback(callback)
        # Callback is stored internally

    async def test_start_empty_characteristics(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test start with no MQTT data sources."""
        # Setup - no active MQTT sources
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[])

        # Execute
        await tag_provider.start()

        # Verify
        mock_ds_repo.get_active_mqtt_sources.assert_called_once()
        mock_mqtt_client.subscribe.assert_not_called()

        await tag_provider.stop()

    async def test_start_with_characteristics(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, sample_mqtt_source
    ):
        """Test start with MQTT data sources."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[sample_mqtt_source]
        )

        # Execute
        await tag_provider.start()
        await asyncio.sleep(0.1)  # Allow async tasks to run

        # Verify
        mock_ds_repo.get_active_mqtt_sources.assert_called_once()
        mock_mqtt_client.subscribe.assert_called_once_with(
            "factory/line1/temp", tag_provider._on_message
        )

        await tag_provider.stop()

    async def test_stop(self, tag_provider, mock_mqtt_client, mock_ds_repo):
        """Test stop unsubscribes and cleans up."""
        # Setup
        src = _make_mqtt_source(
            char_id=1,
            char_name="Test",
            subgroup_size=1,
            topic="test/topic",
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        # Start provider
        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Stop provider
        await tag_provider.stop()

        # Verify unsubscribe was called
        mock_mqtt_client.unsubscribe.assert_called_once_with("test/topic")

        # Verify state cleared
        assert len(tag_provider._configs) == 0
        assert len(tag_provider._buffers) == 0
        assert len(tag_provider._topic_to_chars) == 0


class TestSubgroupBuffer:
    """Test SubgroupBuffer functionality."""

    def test_buffer_initialization(self):
        """Test buffer starts empty."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
        )
        buffer = SubgroupBuffer(config)

        assert buffer.values == []
        assert buffer.first_reading_time is None

    def test_buffer_add_single_value(self):
        """Test adding a single value."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
        )
        buffer = SubgroupBuffer(config)

        is_full = buffer.add(10.5)

        assert not is_full
        assert len(buffer.values) == 1
        assert buffer.values[0] == 10.5
        assert buffer.first_reading_time is not None

    def test_buffer_add_until_full(self):
        """Test adding values until buffer is full."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
        )
        buffer = SubgroupBuffer(config)

        # Add 2 values - not full
        assert not buffer.add(10.0)
        assert not buffer.add(10.1)
        assert len(buffer.values) == 2

        # Add 3rd value - now full
        is_full = buffer.add(10.2)
        assert is_full
        assert len(buffer.values) == 3

    def test_buffer_is_ready(self):
        """Test is_ready() returns correct status."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=2,
        )
        buffer = SubgroupBuffer(config)

        assert not buffer.is_ready()

        buffer.add(10.0)
        assert not buffer.is_ready()

        buffer.add(10.1)
        assert buffer.is_ready()

    def test_buffer_flush(self):
        """Test flush returns values and clears buffer."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
        )
        buffer = SubgroupBuffer(config)

        buffer.add(10.0)
        buffer.add(10.1)
        buffer.add(10.2)

        values, product_code, metadata = buffer.flush()

        assert values == [10.0, 10.1, 10.2]
        assert product_code is None
        assert metadata is None
        assert buffer.values == []
        assert buffer.first_reading_time is None

    def test_buffer_timeout_not_timed_out(self):
        """Test buffer does not time out when within threshold."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
            buffer_timeout_seconds=60.0,
        )
        buffer = SubgroupBuffer(config)

        buffer.add(10.0)

        # Immediately check - should not be timed out
        assert not buffer.is_timed_out(60.0)

    def test_buffer_timeout_empty_buffer(self):
        """Test empty buffer never times out."""
        config = TagConfig(
            characteristic_id=1,
            mqtt_topic="test/topic",
            subgroup_size=3,
            buffer_timeout_seconds=0.0,  # Zero timeout
        )
        buffer = SubgroupBuffer(config)

        # Empty buffer should not time out
        assert not buffer.is_timed_out(0.0)


@pytest.mark.asyncio
class TestTagProviderMessageHandling:
    """Test MQTT message handling and buffer accumulation."""

    async def test_on_message_valid_payload(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, sample_mqtt_source
    ):
        """Test handling valid MQTT message."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[sample_mqtt_source]
        )
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Simulate MQTT message
        await tag_provider._on_message("factory/line1/temp", b"75.5")

        # Verify buffer has value
        buffer = tag_provider._buffers[1]
        assert len(buffer.values) == 1
        assert buffer.values[0] == 75.5

        # Callback not invoked yet (buffer not full)
        callback.assert_not_called()

        await tag_provider.stop()

    async def test_on_message_invalid_payload(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, sample_mqtt_source
    ):
        """Test handling invalid MQTT payload."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[sample_mqtt_source]
        )
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Simulate MQTT message with invalid payload
        await tag_provider._on_message("factory/line1/temp", b"not_a_number")

        # Verify buffer is empty (invalid payload rejected)
        buffer = tag_provider._buffers[1]
        assert len(buffer.values) == 0

        await tag_provider.stop()

    async def test_on_message_buffer_full_on_change(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test buffer flush when full with ON_CHANGE strategy."""
        # Setup - small subgroup_size for quick filling
        src = _make_mqtt_source(
            char_id=1,
            char_name="Test",
            subgroup_size=2,
            topic="test/topic",
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send messages to fill buffer
        await tag_provider._on_message("test/topic", b"10.0")
        await tag_provider._on_message("test/topic", b"10.1")

        # Wait for async callback
        await asyncio.sleep(0.1)

        # Verify callback invoked
        callback.assert_called_once()
        event = callback.call_args[0][0]
        assert isinstance(event, SampleEvent)
        assert event.characteristic_id == 1
        assert event.measurements == [10.0, 10.1]
        assert event.context.source == "TAG"

        # Verify buffer cleared
        buffer = tag_provider._buffers[1]
        assert len(buffer.values) == 0

        await tag_provider.stop()

    async def test_on_message_unmapped_topic(self, tag_provider):
        """Test handling message on unmapped topic."""
        # No characteristics loaded
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        # Send message on unmapped topic
        await tag_provider._on_message("unknown/topic", b"10.0")

        # Callback should not be invoked
        callback.assert_not_called()


@pytest.mark.asyncio
class TestTriggerStrategies:
    """Test different trigger strategies."""

    async def test_on_change_strategy(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test ON_CHANGE strategy flushes immediately when full."""
        # Setup
        src = _make_mqtt_source(
            char_id=1,
            char_name="Test",
            subgroup_size=1,  # Single reading
            topic="test/topic",
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send single message
        await tag_provider._on_message("test/topic", b"10.0")
        await asyncio.sleep(0.1)

        # Should flush immediately
        callback.assert_called_once()

        await tag_provider.stop()

    async def test_on_trigger_strategy_accumulation(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, triggered_mqtt_source
    ):
        """Test ON_TRIGGER strategy accumulates without flushing."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[triggered_mqtt_source]
        )
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send data messages (should accumulate but not flush)
        await tag_provider._on_message("factory/line1/width", b"10.0")
        await tag_provider._on_message("factory/line1/width", b"10.1")
        await tag_provider._on_message("factory/line1/width", b"10.2")
        await asyncio.sleep(0.1)

        # Should not flush yet
        callback.assert_not_called()

        # Verify buffer has values
        buffer = tag_provider._buffers[2]
        assert len(buffer.values) == 3

        await tag_provider.stop()

    async def test_on_trigger_strategy_flush(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, triggered_mqtt_source
    ):
        """Test ON_TRIGGER strategy flushes on trigger message."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[triggered_mqtt_source]
        )
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send data messages
        await tag_provider._on_message("factory/line1/width", b"10.0")
        await tag_provider._on_message("factory/line1/width", b"10.1")

        # Send trigger message
        await tag_provider._on_trigger_message("factory/line1/trigger", b"1")
        await asyncio.sleep(0.1)

        # Should flush on trigger
        callback.assert_called_once()
        event = callback.call_args[0][0]
        assert event.characteristic_id == 2
        assert event.measurements == [10.0, 10.1]

        await tag_provider.stop()

    async def test_trigger_with_empty_buffer(
        self, tag_provider, mock_mqtt_client, mock_ds_repo, triggered_mqtt_source
    ):
        """Test trigger message with empty buffer does nothing."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(
            return_value=[triggered_mqtt_source]
        )
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send trigger without any data
        await tag_provider._on_trigger_message("factory/line1/trigger", b"1")
        await asyncio.sleep(0.1)

        # Should not invoke callback
        callback.assert_not_called()

        await tag_provider.stop()


@pytest.mark.asyncio
class TestBufferTimeout:
    """Test buffer timeout handling."""

    async def test_timeout_flushes_partial_buffer(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test that timeout flushes partial buffer."""
        # Setup with large subgroup that won't be reached
        src = _make_mqtt_source(
            char_id=1,
            char_name="Test",
            subgroup_size=10,
            topic="test/topic",
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.2)

        # Override timeout for testing (must be done after start)
        tag_provider._configs[1].buffer_timeout_seconds = 0.3

        # Add some values but don't fill buffer
        await tag_provider._on_message("test/topic", b"10.0")
        await tag_provider._on_message("test/topic", b"10.1")

        # Wait for timeout to expire
        await asyncio.sleep(0.4)

        # Manually check for timeout (simulating what the timeout loop does)
        buffer = tag_provider._buffers[1]
        config = tag_provider._configs[1]
        if buffer.values and buffer.is_timed_out(config.buffer_timeout_seconds):
            await tag_provider._flush_buffer(1)

        # Should have flushed due to timeout
        callback.assert_called_once()
        event = callback.call_args[0][0]
        assert event.characteristic_id == 1
        assert event.measurements == [10.0, 10.1]  # Partial buffer

        await tag_provider.stop()

    async def test_timeout_loop_runs(self, tag_provider, mock_ds_repo):
        """Test that timeout loop starts and stops correctly."""
        # Setup
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[])

        # Start provider
        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Verify timeout task is running
        assert tag_provider._timeout_task is not None
        assert not tag_provider._timeout_task.done()

        # Stop provider
        await tag_provider.stop()

        # Verify timeout task is cancelled
        assert tag_provider._timeout_task.done()


@pytest.mark.asyncio
class TestMultipleCharacteristics:
    """Test handling multiple characteristics simultaneously."""

    async def test_multiple_characteristics_independent_buffers(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test multiple characteristics maintain independent buffers."""
        # Setup - 2 data sources
        src1 = _make_mqtt_source(
            id=1,
            char_id=1,
            char_name="Temp",
            subgroup_size=2,
            topic="factory/temp",
        )
        src2 = _make_mqtt_source(
            id=2,
            char_id=2,
            char_name="Pressure",
            subgroup_size=3,
            topic="factory/pressure",
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src1, src2])
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send messages to char1
        await tag_provider._on_message("factory/temp", b"75.0")
        await tag_provider._on_message("factory/temp", b"75.5")
        await asyncio.sleep(0.1)

        # char1 should flush (size 2)
        assert callback.call_count == 1
        event1 = callback.call_args[0][0]
        assert event1.characteristic_id == 1
        assert event1.measurements == [75.0, 75.5]

        # Send messages to char2
        await tag_provider._on_message("factory/pressure", b"30.0")
        await tag_provider._on_message("factory/pressure", b"30.1")
        await asyncio.sleep(0.1)

        # char2 should not flush yet (size 3, only 2 values)
        assert callback.call_count == 1

        # Send 3rd value to char2
        await tag_provider._on_message("factory/pressure", b"30.2")
        await asyncio.sleep(0.1)

        # char2 should now flush
        assert callback.call_count == 2
        event2 = callback.call_args[0][0]
        assert event2.characteristic_id == 2
        assert event2.measurements == [30.0, 30.1, 30.2]

        await tag_provider.stop()

    async def test_topic_routing(self, tag_provider, mock_mqtt_client, mock_ds_repo):
        """Test messages are routed to correct characteristic."""
        # Setup
        src1 = _make_mqtt_source(
            id=1, char_id=1, char_name="A", subgroup_size=1, topic="topic/a"
        )
        src2 = _make_mqtt_source(
            id=2, char_id=2, char_name="B", subgroup_size=1, topic="topic/b"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src1, src2])
        callback = AsyncMock()
        tag_provider.set_callback(callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send to topic A
        await tag_provider._on_message("topic/a", b"100")
        await asyncio.sleep(0.1)

        # Verify correct characteristic
        event_a = callback.call_args[0][0]
        assert event_a.characteristic_id == 1
        assert event_a.measurements == [100.0]

        # Send to topic B
        await tag_provider._on_message("topic/b", b"200")
        await asyncio.sleep(0.1)

        # Verify correct characteristic
        event_b = callback.call_args[0][0]
        assert event_b.characteristic_id == 2
        assert event_b.measurements == [200.0]

        await tag_provider.stop()


@pytest.mark.asyncio
class TestErrorHandling:
    """Test error handling scenarios."""

    async def test_callback_exception_does_not_crash(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test that callback exception doesn't crash provider."""
        # Setup
        src = _make_mqtt_source(
            char_id=1, char_name="Test", subgroup_size=1, topic="test/topic"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        # Callback that raises exception
        async def bad_callback(event: SampleEvent) -> None:
            raise ValueError("Callback error")

        tag_provider.set_callback(bad_callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send message (should trigger callback exception)
        await tag_provider._on_message("test/topic", b"10.0")
        await asyncio.sleep(0.1)

        # Provider should still be running
        assert tag_provider._running

        await tag_provider.stop()

    async def test_no_callback_set_warning(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test warning when no callback is set."""
        # Setup
        src = _make_mqtt_source(
            char_id=1, char_name="Test", subgroup_size=1, topic="test/topic"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        # No callback set
        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send message (should not crash, just log warning)
        await tag_provider._on_message("test/topic", b"10.0")
        await asyncio.sleep(0.1)

        await tag_provider.stop()

    async def test_characteristic_without_mqtt_topic(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test data source with no characteristic is skipped."""
        # Setup - data source with no characteristic
        src = Mock()
        src.id = 1
        src.topic = "test/topic"
        src.trigger_strategy = TriggerStrategy.ON_CHANGE.value
        src.trigger_tag = None
        src.metric_name = None
        src.json_path = None
        src.is_active = True
        src.characteristic = None  # No characteristic attached
        src.product_code = None
        src.product_json_path = None

        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        # Start provider
        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Verify no subscriptions made
        mock_mqtt_client.subscribe.assert_not_called()

        # Verify no configs created
        assert len(tag_provider._configs) == 0

        await tag_provider.stop()

    async def test_subscription_failure_cleanup(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test cleanup when subscription fails."""
        # Setup
        src = _make_mqtt_source(
            char_id=1, char_name="Test", subgroup_size=1, topic="test/topic"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        # Mock subscribe to raise error
        mock_mqtt_client.subscribe.side_effect = Exception("Connection error")

        # Start provider
        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Verify cleanup happened (no configs created)
        assert len(tag_provider._configs) == 0
        assert len(tag_provider._buffers) == 0
        assert len(tag_provider._topic_to_chars) == 0

        await tag_provider.stop()


@pytest.mark.asyncio
class TestSampleEventCreation:
    """Test SampleEvent creation details."""

    async def test_event_has_correct_structure(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test that created events have all required fields."""
        # Setup
        src = _make_mqtt_source(
            char_id=1, char_name="Test", subgroup_size=1, topic="test/topic"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        received_events = []

        async def capture_callback(event: SampleEvent) -> None:
            received_events.append(event)

        tag_provider.set_callback(capture_callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send message
        await tag_provider._on_message("test/topic", b"42.5")
        await asyncio.sleep(0.1)

        # Verify event structure
        assert len(received_events) == 1
        event = received_events[0]

        assert isinstance(event, SampleEvent)
        assert event.characteristic_id == 1
        assert event.measurements == [42.5]
        assert isinstance(event.timestamp, datetime)
        assert event.context.source == "TAG"
        assert event.context.batch_number is None  # TAG samples don't have batch
        assert event.context.operator_id is None  # TAG samples don't have operator

        await tag_provider.stop()

    async def test_event_timestamp_unique(
        self, tag_provider, mock_mqtt_client, mock_ds_repo
    ):
        """Test that each event gets a timestamp."""
        # Setup
        src = _make_mqtt_source(
            char_id=1, char_name="Test", subgroup_size=1, topic="test/topic"
        )
        mock_ds_repo.get_active_mqtt_sources = AsyncMock(return_value=[src])

        received_events = []

        async def capture_callback(event: SampleEvent) -> None:
            received_events.append(event)

        tag_provider.set_callback(capture_callback)

        await tag_provider.start()
        await asyncio.sleep(0.1)

        # Send 3 messages
        await tag_provider._on_message("test/topic", b"10.0")
        await asyncio.sleep(0.1)
        await tag_provider._on_message("test/topic", b"10.1")
        await asyncio.sleep(0.1)
        await tag_provider._on_message("test/topic", b"10.2")
        await asyncio.sleep(0.1)

        # Verify all have timestamps
        assert len(received_events) == 3
        for event in received_events:
            assert isinstance(event.timestamp, datetime)

        await tag_provider.stop()
