"""Test that the TypedEventBusAdapter bridges typed events to string topics."""
import asyncio
from dataclasses import dataclass

import pytest


@dataclass
class FakeSampleProcessedEvent:
    characteristic_id: int
    sample_id: int


@dataclass
class FakeViolationCreatedEvent:
    characteristic_id: int
    rule: str


@pytest.mark.asyncio
async def test_adapter_publish_typed_event():
    """Publishing a typed event should route to the string-topic bus."""
    from cassini.core.broker.local import LocalEventBus
    from cassini.core.broker.event_adapter import TypedEventBusAdapter

    inner = LocalEventBus()
    adapter = TypedEventBusAdapter(inner)

    adapter.register_event_type(FakeSampleProcessedEvent, "sample.processed")

    received: list[dict] = []

    async def handler(payload: dict) -> None:
        received.append(payload)

    await inner.subscribe("sample.processed", handler)
    await adapter.publish(
        FakeSampleProcessedEvent(characteristic_id=1, sample_id=10)
    )

    await asyncio.sleep(0.05)
    assert len(received) == 1
    assert received[0]["characteristic_id"] == 1


@pytest.mark.asyncio
async def test_adapter_subscribe_typed():
    """Subscribing with a typed class should receive events on the matching topic."""
    from cassini.core.broker.local import LocalEventBus
    from cassini.core.broker.event_adapter import TypedEventBusAdapter

    inner = LocalEventBus()
    adapter = TypedEventBusAdapter(inner)

    adapter.register_event_type(FakeSampleProcessedEvent, "sample.processed")

    received: list[FakeSampleProcessedEvent] = []

    async def handler(event: FakeSampleProcessedEvent) -> None:
        received.append(event)

    await adapter.subscribe(FakeSampleProcessedEvent, handler)
    await adapter.publish(
        FakeSampleProcessedEvent(characteristic_id=5, sample_id=20)
    )

    await asyncio.sleep(0.05)
    assert len(received) == 1
    assert isinstance(received[0], FakeSampleProcessedEvent)
    assert received[0].characteristic_id == 5


@pytest.mark.asyncio
async def test_adapter_backwards_compatible_with_existing_api():
    """The adapter must support the same subscribe(Type, handler) API as the old EventBus."""
    from cassini.core.broker.local import LocalEventBus
    from cassini.core.broker.event_adapter import TypedEventBusAdapter

    inner = LocalEventBus()
    adapter = TypedEventBusAdapter(inner)
    adapter.register_event_type(FakeSampleProcessedEvent, "sample.processed")
    adapter.register_event_type(FakeViolationCreatedEvent, "violation.created")

    sample_events: list[FakeSampleProcessedEvent] = []
    violation_events: list[FakeViolationCreatedEvent] = []

    async def on_sample(event: FakeSampleProcessedEvent) -> None:
        sample_events.append(event)

    async def on_violation(event: FakeViolationCreatedEvent) -> None:
        violation_events.append(event)

    await adapter.subscribe(FakeSampleProcessedEvent, on_sample)
    await adapter.subscribe(FakeViolationCreatedEvent, on_violation)

    await adapter.publish(
        FakeSampleProcessedEvent(characteristic_id=1, sample_id=1)
    )
    await adapter.publish(
        FakeViolationCreatedEvent(characteristic_id=1, rule="rule1")
    )

    await asyncio.sleep(0.05)
    assert len(sample_events) == 1
    assert len(violation_events) == 1
