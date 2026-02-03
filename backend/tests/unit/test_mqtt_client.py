"""Unit tests for MQTT client wrapper."""

import asyncio
import contextlib
from unittest.mock import AsyncMock, Mock, patch

import pytest
from aiomqtt import MqttError

from openspc.mqtt.client import MQTTClient, MQTTConfig


class TestMQTTConfig:
    """Tests for MQTTConfig dataclass."""

    def test_default_config(self) -> None:
        """Test default configuration values."""
        config = MQTTConfig()

        assert config.host == "localhost"
        assert config.port == 1883
        assert config.username is None
        assert config.password is None
        assert config.client_id == "openspc-server"
        assert config.keepalive == 60
        assert config.max_reconnect_delay == 30

    def test_custom_config(self) -> None:
        """Test custom configuration values."""
        config = MQTTConfig(
            host="mqtt.example.com",
            port=8883,
            username="user",
            password="pass",
            client_id="test-client",
            keepalive=120,
            max_reconnect_delay=60,
        )

        assert config.host == "mqtt.example.com"
        assert config.port == 8883
        assert config.username == "user"
        assert config.password == "pass"
        assert config.client_id == "test-client"
        assert config.keepalive == 120
        assert config.max_reconnect_delay == 60


class TestMQTTClientInitialization:
    """Tests for MQTTClient initialization."""

    def test_initialization(self) -> None:
        """Test client initializes with correct defaults."""
        config = MQTTConfig()
        client = MQTTClient(config)

        assert client._config == config
        assert client._client is None
        assert client.is_connected is False
        assert len(client._subscriptions) == 0

    def test_is_connected_property(self) -> None:
        """Test is_connected property reflects internal state."""
        config = MQTTConfig()
        client = MQTTClient(config)

        assert client.is_connected is False

        # Simulate connection
        client._connected = True
        assert client.is_connected is True


class TestMQTTClientConnection:
    """Tests for connection management."""

    @pytest.mark.asyncio
    async def test_connect_success(self) -> None:
        """Test successful connection to broker."""
        config = MQTTConfig(host="test.broker", port=1883)
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            assert client.is_connected is True
            assert client._client is not None
            assert client._message_task is not None

        # Cleanup
        await client.disconnect()

    @pytest.mark.asyncio
    async def test_connect_with_authentication(self) -> None:
        """Test connection with username and password."""
        config = MQTTConfig(
            host="test.broker",
            username="testuser",
            password="testpass",
        )
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client") as mock_client_class:
            mock_client_class.return_value = mock_mqtt_client

            await client.connect()

            # Verify Client was called with auth parameters
            mock_client_class.assert_called_once()
            call_kwargs = mock_client_class.call_args[1]
            assert call_kwargs["username"] == "testuser"
            assert call_kwargs["password"] == "testpass"

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_connect_with_retry_on_failure(self) -> None:
        """Test connection retries with exponential backoff on failure."""
        config = MQTTConfig(host="test.broker", max_reconnect_delay=4)
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        attempt = 0

        def failing_client(*args, **kwargs):
            nonlocal attempt
            attempt += 1
            if attempt < 3:
                # Fail first 2 attempts
                mock = AsyncMock()
                mock.__aenter__ = AsyncMock(side_effect=MqttError("Connection failed"))
                return mock
            else:
                # Succeed on 3rd attempt
                return mock_mqtt_client

        with (
            patch("openspc.mqtt.client.Client", side_effect=failing_client),
            patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep,
        ):
                await client.connect()

                # Should have retried
                assert attempt == 3
                assert client.is_connected is True

                # Verify exponential backoff (1s, 2s)
                assert mock_sleep.call_count >= 2
                delays = [call[0][0] for call in mock_sleep.call_args_list]
                assert delays[0] == 1
                assert delays[1] == 2

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect_cleans_up_resources(self) -> None:
        """Test disconnect properly cleans up all resources."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            assert client.is_connected is True

            await client.disconnect()

            assert client.is_connected is False
            assert client._shutdown_event.is_set()
            mock_mqtt_client.__aexit__.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_multiple_times_safe(self) -> None:
        """Test that calling disconnect multiple times is safe."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            # Disconnect multiple times
            await client.disconnect()
            await client.disconnect()
            await client.disconnect()

            # Should not raise error
            assert client.is_connected is False


class TestMQTTClientSubscription:
    """Tests for topic subscription management."""

    @pytest.mark.asyncio
    async def test_subscribe_when_connected(self) -> None:
        """Test subscribing to topic when already connected."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        callback = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.subscribe("test/topic", callback)

            # Verify subscription was made
            mock_mqtt_client.subscribe.assert_called_once_with("test/topic")
            assert "test/topic" in client._subscriptions
            assert client._subscriptions["test/topic"] == callback

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_subscribe_when_not_connected(self) -> None:
        """Test subscribing to topic when not connected stores subscription."""
        config = MQTTConfig()
        client = MQTTClient(config)
        callback = AsyncMock()

        await client.subscribe("test/topic", callback)

        # Subscription should be stored but not sent to broker
        assert "test/topic" in client._subscriptions
        assert client._subscriptions["test/topic"] == callback

    @pytest.mark.asyncio
    async def test_subscriptions_restored_after_reconnection(self) -> None:
        """Test subscriptions are restored after reconnection."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        callback = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            # Subscribe before connecting
            await client.subscribe("test/topic", callback)
            await client.subscribe("another/topic", callback)

            # Connect
            await client.connect()

            # Verify both subscriptions were made
            assert mock_mqtt_client.subscribe.call_count == 2
            mock_mqtt_client.subscribe.assert_any_call("test/topic")
            mock_mqtt_client.subscribe.assert_any_call("another/topic")

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_unsubscribe_when_connected(self) -> None:
        """Test unsubscribing from topic when connected."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()
        mock_mqtt_client.unsubscribe = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        callback = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.subscribe("test/topic", callback)
            await client.unsubscribe("test/topic")

            # Verify unsubscription
            mock_mqtt_client.unsubscribe.assert_called_once_with("test/topic")
            assert "test/topic" not in client._subscriptions

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_unsubscribe_when_not_connected(self) -> None:
        """Test unsubscribing when not connected removes from internal dict."""
        config = MQTTConfig()
        client = MQTTClient(config)
        callback = AsyncMock()

        await client.subscribe("test/topic", callback)
        assert "test/topic" in client._subscriptions

        await client.unsubscribe("test/topic")
        assert "test/topic" not in client._subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_topic(self) -> None:
        """Test unsubscribing from non-existent topic does nothing."""
        config = MQTTConfig()
        client = MQTTClient(config)

        # Should not raise error
        await client.unsubscribe("nonexistent/topic")


class TestMQTTClientPublishing:
    """Tests for message publishing."""

    @pytest.mark.asyncio
    async def test_publish_when_connected(self) -> None:
        """Test publishing message when connected."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.publish = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.publish("test/topic", b"test payload", qos=1)

            # Verify publish was called
            mock_mqtt_client.publish.assert_called_once_with(
                "test/topic", b"test payload", qos=1
            )

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_publish_with_different_qos(self) -> None:
        """Test publishing with different QoS levels."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.publish = AsyncMock()
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            await client.publish("test/topic", b"payload", qos=0)
            await client.publish("test/topic", b"payload", qos=2)

            # Verify QoS was passed correctly
            calls = mock_mqtt_client.publish.call_args_list
            assert calls[0][1]["qos"] == 0
            assert calls[1][1]["qos"] == 2

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_publish_when_not_connected_raises_error(self) -> None:
        """Test publishing when not connected raises RuntimeError."""
        config = MQTTConfig()
        client = MQTTClient(config)

        with pytest.raises(RuntimeError, match="not connected"):
            await client.publish("test/topic", b"payload")

    @pytest.mark.asyncio
    async def test_publish_mqtt_error_propagates(self) -> None:
        """Test MQTT errors during publish are propagated."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.publish = AsyncMock(side_effect=MqttError("Publish failed"))
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            with pytest.raises(MqttError, match="Publish failed"):
                await client.publish("test/topic", b"payload")

        await client.disconnect()


class TestMQTTClientMessageHandling:
    """Tests for incoming message handling."""

    @pytest.mark.asyncio
    async def test_message_callback_invoked(self) -> None:
        """Test callback is invoked when message arrives."""
        config = MQTTConfig()
        client = MQTTClient(config)

        callback_called = asyncio.Event()
        received_topic = None
        received_payload = None

        async def callback(topic: str, payload: bytes) -> None:
            nonlocal received_topic, received_payload
            received_topic = topic
            received_payload = payload
            callback_called.set()

        # Mock message
        mock_message = Mock()
        mock_message.topic = "test/topic"
        mock_message.payload = b"test payload"

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()

        # Create async generator for messages
        async def message_generator():
            yield mock_message
            # Keep loop alive briefly
            await asyncio.sleep(0.1)

        mock_mqtt_client.messages = message_generator()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.subscribe("test/topic", callback)

            # Wait for callback to be invoked
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(callback_called.wait(), timeout=1.0)

        await client.disconnect()

        # Verify callback was invoked with correct parameters
        assert received_topic == "test/topic"
        assert received_payload == b"test payload"

    @pytest.mark.asyncio
    async def test_callback_error_does_not_stop_processing(self) -> None:
        """Test that callback errors don't stop message processing."""
        config = MQTTConfig()
        client = MQTTClient(config)

        callback_called = asyncio.Event()
        error_raised = False

        async def failing_callback(topic: str, payload: bytes) -> None:
            nonlocal error_raised
            error_raised = True
            callback_called.set()
            raise ValueError("Callback error")

        # Mock messages - send two messages
        mock_message1 = Mock()
        mock_message1.topic = "test/topic"
        mock_message1.payload = b"test payload 1"

        mock_message2 = Mock()
        mock_message2.topic = "test/topic"
        mock_message2.payload = b"test payload 2"

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()

        messages_processed = []

        async def tracking_callback(topic: str, payload: bytes) -> None:
            messages_processed.append(payload)
            if len(messages_processed) == 1:
                raise ValueError("First message error")
            callback_called.set()

        async def message_generator():
            yield mock_message1
            await asyncio.sleep(0.05)
            yield mock_message2
            await asyncio.sleep(0.1)

        mock_mqtt_client.messages = message_generator()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.subscribe("test/topic", tracking_callback)

            # Wait for both messages to be processed
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(callback_called.wait(), timeout=1.0)

        await client.disconnect()

        # Both messages should have been processed despite first callback error
        assert len(messages_processed) == 2
        assert messages_processed[0] == b"test payload 1"
        assert messages_processed[1] == b"test payload 2"


class TestMQTTClientTopicMatching:
    """Tests for MQTT topic wildcard matching."""

    def test_exact_match(self) -> None:
        """Test exact topic matching."""
        assert MQTTClient._topic_matches("sensors/temp", "sensors/temp")
        assert not MQTTClient._topic_matches("sensors/temp", "sensors/humidity")

    def test_single_level_wildcard(self) -> None:
        """Test single level wildcard (+) matching."""
        # + matches exactly one level
        assert MQTTClient._topic_matches("sensors/+/temp", "sensors/device1/temp")
        assert MQTTClient._topic_matches("sensors/+/temp", "sensors/device2/temp")
        assert not MQTTClient._topic_matches("sensors/+/temp", "sensors/temp")
        assert not MQTTClient._topic_matches(
            "sensors/+/temp", "sensors/device1/device2/temp"
        )

    def test_multi_level_wildcard(self) -> None:
        """Test multi level wildcard (#) matching."""
        # # matches zero or more levels
        assert MQTTClient._topic_matches("sensors/#", "sensors/temp")
        assert MQTTClient._topic_matches("sensors/#", "sensors/device1/temp")
        assert MQTTClient._topic_matches("sensors/#", "sensors/device1/device2/temp")
        assert not MQTTClient._topic_matches("sensors/#", "devices/temp")

    def test_multi_level_wildcard_at_end_only(self) -> None:
        """Test that # wildcard only works at the end."""
        # # must be at the end
        assert MQTTClient._topic_matches("sensors/#", "sensors/temp/value")
        assert not MQTTClient._topic_matches("sensors/#/temp", "sensors/device1/temp")

    def test_combined_wildcards(self) -> None:
        """Test combination of + and # wildcards."""
        # sensors/+/# means: sensors/<one-level>/<zero-or-more-levels>
        assert MQTTClient._topic_matches("sensors/+/#", "sensors/device1/temp")
        assert MQTTClient._topic_matches("sensors/+/#", "sensors/device1/temp/value")
        # This actually SHOULD match: sensors/+/# where + matches "temp" and # matches nothing
        assert MQTTClient._topic_matches("sensors/+/#", "sensors/temp")
        # This should NOT match - not enough levels
        assert not MQTTClient._topic_matches("sensors/+/#", "sensors")

    def test_root_level_wildcard(self) -> None:
        """Test wildcards at root level."""
        assert MQTTClient._topic_matches("#", "sensors/temp")
        assert MQTTClient._topic_matches("#", "devices")
        assert MQTTClient._topic_matches("+/temp", "sensors/temp")
        assert not MQTTClient._topic_matches("+/temp", "sensors/device1/temp")

    def test_empty_topic_levels(self) -> None:
        """Test handling of empty topic levels."""
        # Empty levels are valid in MQTT
        assert MQTTClient._topic_matches("sensors//temp", "sensors//temp")
        assert MQTTClient._topic_matches("sensors/+/temp", "sensors//temp")


class TestMQTTClientReconnection:
    """Tests for automatic reconnection behavior."""

    @pytest.mark.asyncio
    async def test_reconnection_after_error_connects_again(self) -> None:
        """Test that _connect_with_retry will retry on connection failure."""
        config = MQTTConfig(max_reconnect_delay=4)
        client = MQTTClient(config)

        # Track connection attempts
        attempts = [0]

        def mock_client_factory(*args, **kwargs):
            attempts[0] += 1
            mock_mqtt_client = AsyncMock()

            if attempts[0] == 1:
                # First attempt fails
                mock_mqtt_client.__aenter__ = AsyncMock(
                    side_effect=MqttError("Connection failed")
                )
            else:
                # Second attempt succeeds
                mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
                mock_mqtt_client.__aexit__ = AsyncMock()
                mock_mqtt_client.subscribe = AsyncMock()

            return mock_mqtt_client

        with (
            patch("openspc.mqtt.client.Client", side_effect=mock_client_factory),
            patch("asyncio.sleep", new_callable=AsyncMock),
        ):
                # This should retry and eventually succeed
                await client._connect_with_retry()

                # Should have tried at least twice
                assert attempts[0] >= 2
                assert client.is_connected is True

    @pytest.mark.asyncio
    async def test_exponential_backoff_respects_max_delay(self) -> None:
        """Test exponential backoff caps at max_reconnect_delay."""
        config = MQTTConfig(max_reconnect_delay=8)
        client = MQTTClient(config)

        delays = []

        async def mock_sleep(delay: float) -> None:
            delays.append(delay)
            if len(delays) >= 5:
                # Stop after collecting enough delays
                client._shutdown_event.set()

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(
            side_effect=MqttError("Connection failed")
        )

        with (
            patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client),
            patch("asyncio.sleep", side_effect=mock_sleep),
            contextlib.suppress(Exception),
        ):
            await client._connect_with_retry()

        # Verify exponential backoff: 1, 2, 4, 8, 8 (capped)
        assert delays[0] == 1
        assert delays[1] == 2
        assert delays[2] == 4
        assert delays[3] == 8
        assert delays[4] == 8  # Should stay at max


class TestMQTTClientEdgeCases:
    """Tests for edge cases and error conditions."""

    @pytest.mark.asyncio
    async def test_subscribe_error_propagates(self) -> None:
        """Test subscription errors are propagated."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock(
            side_effect=MqttError("Subscribe failed")
        )
        mock_mqtt_client.messages = AsyncMock()

        callback = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            with pytest.raises(MqttError, match="Subscribe failed"):
                await client.subscribe("test/topic", callback)

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_unsubscribe_error_propagates(self) -> None:
        """Test unsubscription errors are propagated."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock()
        mock_mqtt_client.subscribe = AsyncMock()
        mock_mqtt_client.unsubscribe = AsyncMock(
            side_effect=MqttError("Unsubscribe failed")
        )
        mock_mqtt_client.messages = AsyncMock()

        callback = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()
            await client.subscribe("test/topic", callback)

            with pytest.raises(MqttError, match="Unsubscribe failed"):
                await client.unsubscribe("test/topic")

        await client.disconnect()

    @pytest.mark.asyncio
    async def test_disconnect_with_client_error(self) -> None:
        """Test disconnect handles client errors gracefully."""
        config = MQTTConfig()
        client = MQTTClient(config)

        mock_mqtt_client = AsyncMock()
        mock_mqtt_client.__aenter__ = AsyncMock(return_value=mock_mqtt_client)
        mock_mqtt_client.__aexit__ = AsyncMock(
            side_effect=Exception("Disconnect error")
        )
        mock_mqtt_client.messages = AsyncMock()

        with patch("openspc.mqtt.client.Client", return_value=mock_mqtt_client):
            await client.connect()

            # Should not raise error
            await client.disconnect()
            assert client.is_connected is False

    def test_multiple_callbacks_for_same_topic(self) -> None:
        """Test that subscribing to same topic overwrites previous callback."""
        config = MQTTConfig()
        client = MQTTClient(config)

        callback1 = AsyncMock()
        callback2 = AsyncMock()

        # Subscribe twice to same topic
        asyncio.run(client.subscribe("test/topic", callback1))
        asyncio.run(client.subscribe("test/topic", callback2))

        # Only the second callback should be registered
        assert client._subscriptions["test/topic"] == callback2
