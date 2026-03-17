"""Test role system wiring — broker creation, role gating, CLI integration."""
import pytest


class TestBrokerCreation:
    """Verify create_broker returns correct backend based on URL."""

    def test_empty_url_gives_local_backend(self):
        from cassini.core.broker import create_broker

        broker = create_broker(broker_url="")
        assert broker.backend == "local"

    def test_local_broker_components_not_none(self):
        from cassini.core.broker import create_broker

        broker = create_broker(broker_url="")
        assert broker.task_queue is not None
        assert broker.event_bus is not None
        assert broker.broadcast is not None

    def test_unsupported_scheme_raises(self):
        from cassini.core.broker import create_broker

        with pytest.raises(ValueError, match="Unsupported broker scheme"):
            create_broker(broker_url="amqp://localhost:5672")


class TestTypedEventBusAdapter:
    """Verify the adapter bridges typed events to string topics."""

    @pytest.mark.asyncio
    async def test_subscribe_and_publish_roundtrip(self):
        import asyncio
        from dataclasses import dataclass
        from cassini.core.broker.local import LocalEventBus
        from cassini.core.broker.event_adapter import TypedEventBusAdapter

        @dataclass
        class TestEvent:
            value: int

        inner = LocalEventBus()
        adapter = TypedEventBusAdapter(inner)
        adapter.register_event_type(TestEvent, "test.event")

        received = []

        async def handler(event):
            received.append(event)

        adapter.subscribe(TestEvent, handler)
        await asyncio.sleep(0.05)  # Let scheduled subscribe run

        await adapter.publish(TestEvent(value=42))
        await asyncio.sleep(0.05)

        assert len(received) == 1
        assert received[0].value == 42

    @pytest.mark.asyncio
    async def test_unregistered_event_type_warns(self, caplog):
        import logging
        from dataclasses import dataclass
        from cassini.core.broker.local import LocalEventBus
        from cassini.core.broker.event_adapter import TypedEventBusAdapter

        @dataclass
        class UnregisteredEvent:
            value: int

        inner = LocalEventBus()
        adapter = TypedEventBusAdapter(inner)

        with caplog.at_level(logging.WARNING):
            await adapter.publish(UnregisteredEvent(value=1))

        assert "No topic registered" in caplog.text


class TestRoleGating:
    """Verify settings.has_role() works for role gating decisions."""

    def test_all_role_enables_everything(self):
        from cassini.core.config import Settings

        s = Settings(_env_file=None, roles="all")
        assert s.has_role("api")
        assert s.has_role("spc")
        assert s.has_role("ingestion")
        assert s.has_role("reports")
        assert s.has_role("erp")
        assert s.has_role("purge")

    def test_specific_roles_restrict(self):
        from cassini.core.config import Settings

        s = Settings(_env_file=None, roles="api,spc")
        assert s.has_role("api")
        assert s.has_role("spc")
        assert not s.has_role("ingestion")
        assert not s.has_role("reports")
        assert not s.has_role("erp")
        assert not s.has_role("purge")

    def test_single_role(self):
        from cassini.core.config import Settings

        s = Settings(_env_file=None, roles="spc")
        assert s.has_role("spc")
        assert not s.has_role("api")

    def test_whitespace_in_roles_handled(self):
        from cassini.core.config import Settings

        s = Settings(_env_file=None, roles="api , spc , ingestion")
        assert s.has_role("api")
        assert s.has_role("spc")
        assert s.has_role("ingestion")
        assert not s.has_role("reports")


class TestCLIRolesOption:
    """Verify the CLI serve command accepts --roles."""

    def test_serve_command_has_roles_param(self):
        from cassini.cli.main import serve

        param_names = [p.name for p in serve.params]
        assert "roles" in param_names

    def test_roles_param_is_optional(self):
        from cassini.cli.main import serve

        roles_param = next(p for p in serve.params if p.name == "roles")
        assert roles_param.default is None
