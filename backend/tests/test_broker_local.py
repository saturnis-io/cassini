"""Test local (in-process) broker implementation."""
import pytest
import asyncio
from cassini.core.broker.local import LocalTaskQueue, LocalEventBus, LocalBroadcast


@pytest.mark.asyncio
async def test_local_task_queue_enqueue_dequeue():
    queue = LocalTaskQueue(maxsize=10)
    await queue.start()
    await queue.enqueue({"char_id": 1, "sample_ids": [10]})
    item = await queue.dequeue(timeout=1.0)
    assert item == {"char_id": 1, "sample_ids": [10]}
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_task_queue_dequeue_timeout():
    queue = LocalTaskQueue(maxsize=10)
    await queue.start()
    item = await queue.dequeue(timeout=0.1)
    assert item is None
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_task_queue_stats():
    queue = LocalTaskQueue(maxsize=10)
    await queue.start()
    await queue.enqueue({"x": 1})
    stats = await queue.stats()
    assert stats.pending == 1
    assert stats.enqueued_total == 1
    assert stats.healthy is True
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_task_queue_stats_after_dequeue():
    queue = LocalTaskQueue(maxsize=10)
    await queue.start()
    await queue.enqueue({"x": 1})
    await queue.dequeue(timeout=1.0)
    stats = await queue.stats()
    assert stats.pending == 0
    assert stats.enqueued_total == 1
    assert stats.dequeued_total == 1
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_task_queue_full_raises():
    queue = LocalTaskQueue(maxsize=1)
    await queue.start()
    await queue.enqueue({"x": 1})
    with pytest.raises(asyncio.QueueFull):
        await queue.enqueue({"x": 2})
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_task_queue_fifo_order():
    queue = LocalTaskQueue(maxsize=10)
    await queue.start()
    await queue.enqueue({"order": 1})
    await queue.enqueue({"order": 2})
    await queue.enqueue({"order": 3})
    assert (await queue.dequeue(timeout=1.0))["order"] == 1
    assert (await queue.dequeue(timeout=1.0))["order"] == 2
    assert (await queue.dequeue(timeout=1.0))["order"] == 3
    await queue.shutdown()


@pytest.mark.asyncio
async def test_local_event_bus_publish_subscribe():
    bus = LocalEventBus()
    received = []

    async def handler(payload):
        received.append(payload)

    await bus.subscribe("sample.processed", handler)
    await bus.publish("sample.processed", {"char_id": 1})
    assert len(received) == 1
    assert received[0] == {"char_id": 1}
    await bus.shutdown()


@pytest.mark.asyncio
async def test_local_event_bus_multiple_handlers():
    bus = LocalEventBus()
    received_a = []
    received_b = []

    async def handler_a(payload):
        received_a.append(payload)

    async def handler_b(payload):
        received_b.append(payload)

    await bus.subscribe("test.event", handler_a)
    await bus.subscribe("test.event", handler_b)
    await bus.publish("test.event", {"x": 1})
    assert len(received_a) == 1
    assert len(received_b) == 1
    await bus.shutdown()


@pytest.mark.asyncio
async def test_local_event_bus_unsubscribe():
    bus = LocalEventBus()
    received = []

    async def handler(payload):
        received.append(payload)

    await bus.subscribe("test.event", handler)
    await bus.unsubscribe("test.event", handler)
    await bus.publish("test.event", {"x": 1})
    assert len(received) == 0
    await bus.shutdown()


@pytest.mark.asyncio
async def test_local_event_bus_topic_isolation():
    bus = LocalEventBus()
    received = []

    async def handler(payload):
        received.append(payload)

    await bus.subscribe("topic.a", handler)
    await bus.publish("topic.b", {"x": 1})
    assert len(received) == 0
    await bus.shutdown()


@pytest.mark.asyncio
async def test_local_event_bus_handler_exception_doesnt_crash():
    bus = LocalEventBus()
    received = []

    async def bad_handler(payload):
        raise ValueError("boom")

    async def good_handler(payload):
        received.append(payload)

    await bus.subscribe("test.event", bad_handler)
    await bus.subscribe("test.event", good_handler)
    await bus.publish("test.event", {"x": 1})
    assert len(received) == 1  # good_handler still called
    await bus.shutdown()


@pytest.mark.asyncio
async def test_local_broadcast_subscribe_receive():
    bc = LocalBroadcast()
    received = []

    async def handler(message):
        received.append(message)

    await bc.subscribe("char:5", handler)
    await bc.broadcast("char:5", {"type": "violation", "char_id": 5})
    assert len(received) == 1
    await bc.shutdown()


@pytest.mark.asyncio
async def test_local_broadcast_channel_isolation():
    bc = LocalBroadcast()
    received = []

    async def handler(message):
        received.append(message)

    await bc.subscribe("char:5", handler)
    await bc.broadcast("char:99", {"type": "violation"})
    assert len(received) == 0
    await bc.shutdown()


@pytest.mark.asyncio
async def test_local_broadcast_unsubscribe():
    bc = LocalBroadcast()
    received = []

    async def handler(message):
        received.append(message)

    await bc.subscribe("char:5", handler)
    await bc.unsubscribe("char:5")
    await bc.broadcast("char:5", {"x": 1})
    assert len(received) == 0
    await bc.shutdown()


@pytest.mark.asyncio
async def test_local_broadcast_multiple_subscribers():
    bc = LocalBroadcast()
    received_a = []
    received_b = []

    async def handler_a(msg):
        received_a.append(msg)

    async def handler_b(msg):
        received_b.append(msg)

    await bc.subscribe("chan:1", handler_a)
    await bc.subscribe("chan:1", handler_b)
    await bc.broadcast("chan:1", {"x": 1})
    assert len(received_a) == 1
    assert len(received_b) == 1
    await bc.shutdown()
