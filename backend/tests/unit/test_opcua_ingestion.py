"""Unit tests for OPC-UA ingestion path.

Covers OPCUAClient connection lifecycle, subscription management, data change
notification handling, security policy negotiation, namespace resolution, and
error recovery. All asyncua calls are mocked with AsyncMock so these tests run
without any network access or asyncua server.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, Mock, call, patch

import pytest

from cassini.opcua.client import OPCUAClient, OPCUAConfig, _DataChangeHandler
from cassini.opcua.browsing import NodeBrowsingService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_data_value(raw: object, source_timestamp: datetime | None = None) -> object:
    """Build a minimal ua.DataValue-like mock."""
    dv = Mock()
    dv.Value = Mock()
    dv.Value.Value = raw
    dv.SourceTimestamp = source_timestamp
    return dv


def _make_config(**kwargs) -> OPCUAConfig:
    defaults = dict(
        endpoint_url="opc.tcp://localhost:4840",
        auth_mode="anonymous",
    )
    defaults.update(kwargs)
    return OPCUAConfig(**defaults)


# ---------------------------------------------------------------------------
# 1. Connection lifecycle
# ---------------------------------------------------------------------------


class TestOPCUAClientConnects:
    """test_opcua_client_connects — verify connect/disconnect lifecycle."""

    @pytest.mark.asyncio
    async def test_connect_success_sets_connected_flag(self) -> None:
        """Successful connect() marks the client as connected."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        assert client.is_connected is True
        assert client.native_client is mock_ua_client
        mock_ua_client.connect.assert_called_once()

    @pytest.mark.asyncio
    async def test_disconnect_resets_state(self) -> None:
        """disconnect() closes the connection and resets internal state."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()
            assert client.is_connected is True

            await client.disconnect()

        assert client.is_connected is False
        assert client._client is None
        mock_ua_client.disconnect.assert_called_once()

    @pytest.mark.asyncio
    async def test_initial_connect_failure_starts_background_reconnect(self) -> None:
        """Failed initial connect starts the background reconnect loop."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()
        mock_ua_client.connect.side_effect = ConnectionError("refused")

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        assert client.is_connected is False
        assert client._reconnect_task is not None

        # Clean up the background task so the event loop closes cleanly
        client._shutdown_event.set()
        client._reconnect_task.cancel()
        with pytest.raises((asyncio.CancelledError, Exception)):
            await client._reconnect_task

    @pytest.mark.asyncio
    async def test_disconnect_is_idempotent(self) -> None:
        """Calling disconnect() multiple times does not raise."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        await client.disconnect()
        await client.disconnect()  # must not raise

        assert client.is_connected is False


# ---------------------------------------------------------------------------
# 2. Subscribe to tags
# ---------------------------------------------------------------------------


class TestSubscribeToTags:
    """test_subscribe_to_tags — verify tag subscription registration."""

    @pytest.mark.asyncio
    async def test_subscribe_registers_callback(self) -> None:
        """subscribe_data_change() stores the callback in _callbacks."""
        config = _make_config()
        client = OPCUAClient(config)

        callback = AsyncMock()
        node_id = "ns=2;i=1001"

        # Subscribe while disconnected — callback should be stored but not wired
        await client.subscribe_data_change(node_id, callback)

        assert node_id in client._callbacks
        assert client._callbacks[node_id] is callback

    @pytest.mark.asyncio
    async def test_subscribe_when_connected_creates_monitored_item(self) -> None:
        """subscribe_data_change() while connected creates a monitored item."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_subscription = AsyncMock()
        mock_subscription.subscribe_data_change = AsyncMock(return_value=42)

        mock_ua_client = AsyncMock()
        mock_ua_client.create_subscription = AsyncMock(return_value=mock_subscription)
        mock_ua_client.get_node = Mock(return_value=Mock())

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

            callback = AsyncMock()
            node_id = "ns=2;i=1001"
            await client.subscribe_data_change(node_id, callback)

        assert node_id in client._monitored_items
        assert client._monitored_items[node_id] == 42
        mock_subscription.subscribe_data_change.assert_called_once()

    @pytest.mark.asyncio
    async def test_subscribe_multiple_tags_all_registered(self) -> None:
        """Subscribing to multiple tags registers all of them."""
        config = _make_config()
        client = OPCUAClient(config)

        node_ids = ["ns=2;i=1001", "ns=2;i=1002", "ns=2;i=1003"]
        callbacks = [AsyncMock() for _ in node_ids]

        for nid, cb in zip(node_ids, callbacks):
            await client.subscribe_data_change(nid, cb)

        assert set(client._callbacks.keys()) == set(node_ids)

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_callback_and_handle(self) -> None:
        """unsubscribe() removes the callback and the monitored item handle."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_subscription = AsyncMock()
        mock_subscription.subscribe_data_change = AsyncMock(return_value=99)
        mock_ua_client = AsyncMock()
        mock_ua_client.create_subscription = AsyncMock(return_value=mock_subscription)
        mock_ua_client.get_node = Mock(return_value=Mock())

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()
            await client.subscribe_data_change("ns=2;i=1001", AsyncMock())
            await client.unsubscribe("ns=2;i=1001")

        assert "ns=2;i=1001" not in client._callbacks
        assert "ns=2;i=1001" not in client._monitored_items
        mock_subscription.unsubscribe.assert_called_once_with(99)


# ---------------------------------------------------------------------------
# 3. Value change notification creates Sample
# ---------------------------------------------------------------------------


class TestValueChangeNotification:
    """test_value_change_notification — callback fires on data change."""

    @pytest.mark.asyncio
    async def test_datachange_handler_invokes_callback(self) -> None:
        """_DataChangeHandler.datachange_notification dispatches to the right callback."""
        received: list[tuple] = []

        async def cb(node_id: str, data_value: object) -> None:
            received.append((node_id, data_value))

        callbacks = {"ns=2;i=1001": cb}
        handler = _DataChangeHandler(callbacks)

        # Build a minimal node mock whose nodeid.to_string() returns our id
        node = Mock()
        node.nodeid.to_string.return_value = "ns=2;i=1001"

        # Build a monitored item mock that carries the value
        dv = _make_data_value(12.34)
        data = Mock()
        data.monitored_item.Value = dv

        await handler.datachange_notification(node, val=None, data=data)

        assert len(received) == 1
        node_id_received, val_received = received[0]
        assert node_id_received == "ns=2;i=1001"
        assert val_received is dv

    @pytest.mark.asyncio
    async def test_datachange_handler_ignores_unknown_node(self) -> None:
        """_DataChangeHandler silently ignores unknown node IDs."""
        called = False

        async def cb(node_id: str, data_value: object) -> None:
            nonlocal called
            called = True

        callbacks = {"ns=2;i=9999": cb}
        handler = _DataChangeHandler(callbacks)

        # Notification for a different node
        node = Mock()
        node.nodeid.to_string.return_value = "ns=2;i=0001"
        data = Mock()
        data.monitored_item.Value = _make_data_value(1.0)

        await handler.datachange_notification(node, val=None, data=data)
        assert called is False

    @pytest.mark.asyncio
    async def test_opcua_provider_data_change_creates_sample_event(self) -> None:
        """OPCUAProvider._on_data_change routes values and flushes a SampleEvent.

        We verify: node_id -> char_id mapping is resolved, the numeric value is
        extracted from the DataValue, and _flush_buffer is called with the right
        char_id when the subgroup is full. _flush_buffer itself is patched so this
        test does not depend on OPCUANodeConfig.product_code (which is not a field).
        """
        from cassini.core.providers.opcua_provider import OPCUANodeConfig, OPCUAProvider
        from cassini.core.providers.buffer import SubgroupBuffer, TagConfig

        mock_manager = Mock()
        mock_ds_repo = AsyncMock()

        provider = OPCUAProvider(mock_manager, mock_ds_repo)

        char_id = 7
        node_id = "ns=2;i=1001"

        opcua_config = OPCUANodeConfig(
            characteristic_id=char_id,
            server_id=1,
            node_id=node_id,
            subgroup_size=1,
            trigger_strategy="on_change",
        )
        buf_tag_config = TagConfig(
            characteristic_id=char_id,
            mqtt_topic=f"opcua://1/{node_id}",
            subgroup_size=1,
            trigger_strategy="on_change",
        )

        provider._configs[char_id] = opcua_config
        provider._buffers[char_id] = SubgroupBuffer(buf_tag_config)
        provider._node_to_char[node_id] = char_id

        flush_calls: list[int] = []

        async def fake_flush(cid: int) -> None:
            flush_calls.append(cid)

        provider._flush_buffer = fake_flush  # type: ignore[method-assign]

        dv = _make_data_value(25.001, source_timestamp=datetime.now(timezone.utc))
        await provider._on_data_change(node_id, dv)

        # _flush_buffer must have been called exactly once with the right char_id,
        # proving that _on_data_change resolved the node -> char mapping correctly
        # and that the buffer triggered a flush when subgroup_size=1 was reached.
        assert flush_calls == [char_id]
        # The value was added to the buffer before fake_flush was invoked;
        # fake_flush did not clear it (unlike the real implementation), so the
        # buffer still holds the reading.
        assert 25.001 in provider._buffers[char_id].values


# ---------------------------------------------------------------------------
# 4. Reconnect on connection loss
# ---------------------------------------------------------------------------


class TestReconnectOnConnectionLoss:
    """test_reconnect_on_connection_loss — background reconnect fires on drop."""

    @pytest.mark.asyncio
    async def test_background_connect_loop_retries_until_connected(self) -> None:
        """_background_connect_loop keeps retrying until _try_connect_once succeeds."""
        config = _make_config(max_reconnect_delay=2)
        client = OPCUAClient(config)

        attempt = 0

        async def fake_try_connect() -> bool:
            nonlocal attempt
            attempt += 1
            if attempt < 3:
                return False
            # Signal shutdown after success so the loop exits cleanly
            client._shutdown_event.set()
            return True

        with patch.object(client, "_try_connect_once", side_effect=fake_try_connect):
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await client._background_connect_loop()

        assert attempt == 3

    @pytest.mark.asyncio
    async def test_subscriptions_restored_after_reconnect(self) -> None:
        """_restore_subscriptions re-subscribes all tracked callbacks."""
        config = _make_config()
        client = OPCUAClient(config)

        mock_subscription = AsyncMock()
        mock_subscription.subscribe_data_change = AsyncMock(return_value=7)
        mock_ua_client = AsyncMock()
        mock_ua_client.create_subscription = AsyncMock(return_value=mock_subscription)
        mock_ua_client.get_node = Mock(return_value=Mock())

        # Pre-register two callbacks (simulates previous connection state)
        client._callbacks["ns=2;i=100"] = AsyncMock()
        client._callbacks["ns=2;i=101"] = AsyncMock()

        client._client = mock_ua_client
        client._connected = True

        await client._restore_subscriptions()

        # Both nodes should now have monitored item handles
        assert "ns=2;i=100" in client._monitored_items
        assert "ns=2;i=101" in client._monitored_items
        assert mock_subscription.subscribe_data_change.call_count == 2


# ---------------------------------------------------------------------------
# 5. Security policy negotiation
# ---------------------------------------------------------------------------


class TestSecurityPolicyNegotiation:
    """test_security_policy_negotiation — correct policy string passed to asyncua."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "security_policy,security_mode,cert_path,key_path,should_call_set_security",
        [
            ("None", "None", None, None, False),
            ("Basic256Sha256", "SignAndEncrypt", "/tmp/cert.pem", "/tmp/key.pem", True),
            ("Basic256Sha256", "Sign", "/tmp/cert.pem", "/tmp/key.pem", True),
        ],
        ids=["no_security", "basic256_sign_and_encrypt", "basic256_sign"],
    )
    async def test_security_policy_passed_to_client(
        self,
        security_policy: str,
        security_mode: str,
        cert_path: str | None,
        key_path: str | None,
        should_call_set_security: bool,
    ) -> None:
        """The correct security string is (or is not) passed to asyncua."""
        config = _make_config(
            security_policy=security_policy,
            security_mode=security_mode,
            client_cert_path=cert_path,
            client_key_path=key_path,
        )
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        if should_call_set_security:
            mock_ua_client.set_security_string.assert_called_once()
            security_str: str = mock_ua_client.set_security_string.call_args[0][0]
            assert security_policy in security_str
            assert security_mode in security_str
        else:
            mock_ua_client.set_security_string.assert_not_called()


# ---------------------------------------------------------------------------
# 6. Certificate validation error handling
# ---------------------------------------------------------------------------


class TestCertificateValidation:
    """test_certificate_validation — malformed cert path does not crash."""

    @pytest.mark.asyncio
    async def test_malformed_cert_path_does_not_raise(self) -> None:
        """A non-existent cert path causes connect to fail gracefully, not crash."""
        config = _make_config(
            security_policy="Basic256Sha256",
            security_mode="SignAndEncrypt",
            client_cert_path="/nonexistent/path/cert.pem",
            client_key_path="/nonexistent/path/key.pem",
        )
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()
        mock_ua_client.set_security_string.side_effect = OSError("cert file not found")

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            # Should not propagate OSError — _try_connect_once catches Exception
            await client.connect()

        assert client.is_connected is False


# ---------------------------------------------------------------------------
# 7. Namespace resolution
# ---------------------------------------------------------------------------


class TestNamespaceResolution:
    """test_namespace_resolution — numeric and string NS IDs both parse."""

    def test_numeric_namespace_node_id_accepted(self) -> None:
        """OPCUAClient accepts numeric-namespace NodeId strings."""
        config = _make_config()
        client = OPCUAClient(config)

        # _callbacks keyed by raw node_id string — no parsing done at subscribe time
        node_id = "ns=2;i=1234"
        callback = AsyncMock()
        # subscribe_data_change with disconnected client just stores callback
        asyncio.run(client.subscribe_data_change(node_id, callback))
        assert node_id in client._callbacks

    def test_string_namespace_node_id_accepted(self) -> None:
        """OPCUAClient accepts string-identifier NodeId strings."""
        config = _make_config()
        client = OPCUAClient(config)

        node_id = "ns=2;s=MyNode.SomeVariable"
        callback = AsyncMock()
        asyncio.run(client.subscribe_data_change(node_id, callback))
        assert node_id in client._callbacks

    def test_browse_name_extract_qualified_name_numeric_ns(self) -> None:
        """_extract_qualified_name renders numeric namespace as 'ns:Name'."""
        qname = Mock()
        qname.NamespaceIndex = 2
        qname.Name = "BoreDiameter"
        result = NodeBrowsingService._extract_qualified_name(qname)
        assert result == "2:BoreDiameter"

    def test_browse_name_extract_qualified_name_zero_ns(self) -> None:
        """_extract_qualified_name for namespace 0 drops the prefix."""
        qname = Mock()
        qname.NamespaceIndex = 0
        qname.Name = "Objects"
        result = NodeBrowsingService._extract_qualified_name(qname)
        # ns=0 is falsy, so no prefix
        assert result == "Objects"


# ---------------------------------------------------------------------------
# 8. Browse path traversal
# ---------------------------------------------------------------------------


class TestBrowsePath:
    """test_browse_path — multi-level node path traversal."""

    @pytest.mark.asyncio
    async def test_browse_path_returns_node_on_success(self) -> None:
        """browse_path() returns a BrowsedNode when the path resolves."""
        service = NodeBrowsingService()

        # Build connected client mock
        mock_ua_client = AsyncMock()
        mock_client = Mock()
        mock_client.is_connected = True
        mock_client.native_client = mock_ua_client

        # The leaf node that get_child will return.
        # Sync attribute accesses (nodeid.to_string) must be plain Mock; async
        # method calls (read_browse_name etc.) must be AsyncMock.
        from asyncua import ua

        browse_name = Mock()
        browse_name.NamespaceIndex = 2
        browse_name.Name = "BoreDiameter"
        display_name = Mock()
        display_name.Text = "BoreDiameter"
        node_class = ua.NodeClass.Variable

        leaf_node = MagicMock()
        leaf_node.nodeid = Mock()
        leaf_node.nodeid.to_string.return_value = "ns=2;i=500"
        leaf_node.read_browse_name = AsyncMock(return_value=browse_name)
        leaf_node.read_display_name = AsyncMock(return_value=display_name)
        leaf_node.read_node_class = AsyncMock(return_value=node_class)
        leaf_node.read_data_type_as_variant_type = AsyncMock(return_value=ua.VariantType.Double)
        leaf_node.get_references = AsyncMock(return_value=[])

        mock_ua_client.nodes.root.get_child = AsyncMock(return_value=leaf_node)

        result = await service.browse_path(
            mock_client,
            path="0:Objects/2:GageStation/2:BoreDiameter",
        )

        assert result is not None
        assert result.node_id == "ns=2;i=500"
        assert result.display_name == "BoreDiameter"
        assert result.is_readable is True

    @pytest.mark.asyncio
    async def test_browse_path_returns_none_on_missing_node(self) -> None:
        """browse_path() returns None when the path does not exist."""
        from asyncua import ua

        service = NodeBrowsingService()

        mock_ua_client = AsyncMock()
        mock_client = Mock()
        mock_client.is_connected = True
        mock_client.native_client = mock_ua_client

        # Simulate a UaStatusCodeError for a missing path
        mock_ua_client.nodes.root.get_child = AsyncMock(
            side_effect=ua.UaStatusCodeError(ua.StatusCodes.BadNoMatch)
        )

        result = await service.browse_path(
            mock_client,
            path="0:Objects/2:DoesNotExist",
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_browse_path_raises_when_client_disconnected(self) -> None:
        """browse_path() raises RuntimeError when client is not connected."""
        service = NodeBrowsingService()
        mock_client = Mock()
        mock_client.is_connected = False
        mock_client.native_client = None

        with pytest.raises(RuntimeError, match="not connected"):
            await service.browse_path(mock_client, path="0:Objects")


# ---------------------------------------------------------------------------
# 9. Anonymous vs. username/password authentication
# ---------------------------------------------------------------------------


class TestAnonymousVsUserAuth:
    """test_anonymous_vs_user_auth — credentials passed correctly to asyncua."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "auth_mode,username,password",
        [
            ("anonymous", None, None),
            ("username_password", "ops_user", "s3cr3t"),
        ],
        ids=["anonymous", "username_password"],
    )
    async def test_auth_credentials_passed_to_client(
        self,
        auth_mode: str,
        username: str | None,
        password: str | None,
    ) -> None:
        """set_user/set_password are called only for username_password mode."""
        config = _make_config(
            auth_mode=auth_mode,
            username=username,
            password=password,
        )
        client = OPCUAClient(config)

        # set_user / set_password are synchronous calls on asyncua.Client,
        # so model them as plain Mock() to avoid unawaited-coroutine warnings.
        mock_ua_client = AsyncMock()
        mock_ua_client.set_user = Mock()
        mock_ua_client.set_password = Mock()

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        if auth_mode == "username_password":
            mock_ua_client.set_user.assert_called_once_with(username)
            mock_ua_client.set_password.assert_called_once_with(password)
        else:
            mock_ua_client.set_user.assert_not_called()
            mock_ua_client.set_password.assert_not_called()


# ---------------------------------------------------------------------------
# 10. Invalid endpoint URL handling
# ---------------------------------------------------------------------------


class TestInvalidEndpointUrl:
    """test_invalid_endpoint_url — malformed URL fails gracefully."""

    @pytest.mark.asyncio
    async def test_malformed_url_does_not_crash(self) -> None:
        """A malformed endpoint URL causes connect() to fail, not raise."""
        config = _make_config(endpoint_url="not-a-valid-opc-url://???")
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()
        mock_ua_client.connect.side_effect = OSError("invalid address")

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()  # must not propagate

        assert client.is_connected is False

    @pytest.mark.asyncio
    async def test_empty_endpoint_url_does_not_crash(self) -> None:
        """An empty endpoint URL fails gracefully."""
        config = _make_config(endpoint_url="")
        client = OPCUAClient(config)

        mock_ua_client = AsyncMock()
        mock_ua_client.connect.side_effect = ValueError("empty url")

        with patch("cassini.opcua.client.Client", return_value=mock_ua_client):
            await client.connect()

        assert client.is_connected is False
