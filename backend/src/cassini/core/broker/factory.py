"""Factory for creating broker instances based on configuration."""
from __future__ import annotations

from dataclasses import dataclass

from cassini.core.broker.interfaces import TaskQueue, EventBusInterface, BroadcastChannel


@dataclass
class Broker:
    """Container for all broker components."""

    backend: str  # "local" or "valkey"
    task_queue: TaskQueue
    event_bus: EventBusInterface
    broadcast: BroadcastChannel


def create_broker(broker_url: str = "", connect: bool = True) -> Broker:
    """Create broker components based on URL scheme.

    Args:
        broker_url: Empty string for local, "valkey://..." for Valkey.
        connect: If False, configure but don't connect (for testing).

    IMPORTANT: Valkey imports are lazy (inside the branch). Non-cluster
    installations do not have redis installed.
    """
    if not broker_url:
        from cassini.core.broker.local import (
            LocalTaskQueue,
            LocalEventBus,
            LocalBroadcast,
        )

        return Broker(
            backend="local",
            task_queue=LocalTaskQueue(),
            event_bus=LocalEventBus(),
            broadcast=LocalBroadcast(),
        )

    scheme = broker_url.split("://")[0].lower() if "://" in broker_url else ""

    if scheme in ("valkey", "redis", "rediss"):
        # Lazy import — redis package only required for cluster mode
        from cassini.core.broker.valkey import (
            ValkeyTaskQueue,
            ValkeyEventBus,
            ValkeyBroadcast,
        )

        return Broker(
            backend="valkey",
            task_queue=ValkeyTaskQueue(broker_url, connect=connect),
            event_bus=ValkeyEventBus(broker_url, connect=connect),
            broadcast=ValkeyBroadcast(broker_url, connect=connect),
        )

    raise ValueError(
        f"Unsupported broker scheme: {scheme!r}. Use valkey:// or redis://"
    )
