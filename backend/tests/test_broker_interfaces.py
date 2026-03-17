"""Test that broker interfaces are importable and factory selects by config."""
import pytest


def test_interfaces_are_protocols():
    """All broker interfaces should be runtime-checkable Protocols."""
    from cassini.core.broker.interfaces import (
        TaskQueue,
        EventBusInterface,
        BroadcastChannel,
    )

    assert TaskQueue is not None
    assert EventBusInterface is not None
    assert BroadcastChannel is not None


def test_factory_rejects_unknown_scheme():
    """Unknown broker URL schemes should raise ValueError."""
    from cassini.core.broker.factory import create_broker

    with pytest.raises(ValueError, match="Unsupported broker"):
        create_broker(broker_url="kafka://localhost:9092")


def test_factory_creates_local_broker():
    """Empty broker URL should create local (in-process) broker."""
    from cassini.core.broker.factory import create_broker

    broker = create_broker(broker_url="")
    assert broker.backend == "local"
    assert broker.task_queue is not None
    assert broker.event_bus is not None
    assert broker.broadcast is not None


def test_local_classes_satisfy_protocols():
    """Local implementations should satisfy their Protocol interfaces."""
    from cassini.core.broker.interfaces import (
        TaskQueue,
        EventBusInterface,
        BroadcastChannel,
    )
    from cassini.core.broker.local import (
        LocalTaskQueue,
        LocalEventBus,
        LocalBroadcast,
    )

    assert isinstance(LocalTaskQueue(), TaskQueue)
    assert isinstance(LocalEventBus(), EventBusInterface)
    assert isinstance(LocalBroadcast(), BroadcastChannel)


def test_queue_stats_dataclass():
    """QueueStats should be a frozen dataclass."""
    from cassini.core.broker.interfaces import QueueStats

    stats = QueueStats(
        pending=5,
        enqueued_total=100,
        dequeued_total=95,
        errors_total=2,
        healthy=True,
    )
    assert stats.pending == 5
    assert stats.healthy is True

    with pytest.raises(AttributeError):
        stats.pending = 10  # type: ignore[misc]
