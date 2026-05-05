"""Real Valkey integration tests via testcontainers.

All tests require a running Docker daemon and are opt-in:

    pytest apps/cassini/backend/tests/containerized -m containerized

None of these tests use mocks — they exercise real Valkey over TCP.
The ``valkey_broker`` session fixture (defined in conftest.py) spins a
valkey/valkey:8-alpine container and yields a ``redis://host:port/0`` URL.

Bug regression markers:
  A4-H7  — subscribe-before-connect drops handler (ValkeyEventBus)
  A4-M10 — renewal failure leaves stale _renewal_task ref (LeaderElection)
  A4-M11 — TypedEventBusAdapter typed unsubscribe silently no-ops
"""

from __future__ import annotations

import asyncio
import dataclasses
import time
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import structlog

log = structlog.get_logger(__name__)

pytestmark = pytest.mark.containerized


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_queue(url: str, namespace: str = "test_tq"):
    """Return a started ValkeyTaskQueue."""
    from cassini.core.broker.valkey import ValkeyTaskQueue

    q = ValkeyTaskQueue(url, namespace=namespace)
    await q.start()
    return q


async def _make_bus(url: str, namespace: str = "test_eb") -> Any:
    """Return a ValkeyEventBus instance (not yet started — caller decides)."""
    from cassini.core.broker.valkey import ValkeyEventBus

    return ValkeyEventBus(url, namespace=namespace)


async def _make_broadcast(url: str, namespace: str = "test_bc") -> Any:
    """Return a started ValkeyBroadcast."""
    from cassini.core.broker.valkey import ValkeyBroadcast

    bc = ValkeyBroadcast(url, namespace=namespace)
    await bc.start()
    return bc


def _make_redis_client(url: str) -> Any:
    """Return a raw redis-py async client for inspection."""
    import redis.asyncio as aioredis

    return aioredis.from_url(url, decode_responses=True)


# ---------------------------------------------------------------------------
# Test 1 — TaskQueue round-trip
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_task_queue_round_trip(valkey_broker: str) -> None:
    """Enqueue 100 tasks, drain via BRPOP, assert all 100 received in order."""
    q = await _make_queue(valkey_broker, namespace="rt")
    try:
        items = [{"seq": i, "char_id": i * 10} for i in range(100)]

        for item in items:
            await q.enqueue(item)

        received: list[dict] = []
        for _ in range(100):
            result = await q.dequeue(timeout=2.0)
            assert result is not None, "Unexpected timeout draining task queue"
            received.append(result)

        # LPUSH + BRPOP gives LIFO order — reverse to compare
        assert received == list(reversed(items))

        stats = await q.stats()
        assert stats.enqueued_total == 100
        assert stats.dequeued_total == 100
        assert stats.pending == 0
    finally:
        await q.shutdown()


# ---------------------------------------------------------------------------
# Test 2 — Streams + consumer groups
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_streams_consumer_groups(valkey_broker: str) -> None:
    """Two consumer groups each receive all 50 events with no intra-group duplicates."""
    from cassini.core.broker.valkey import ValkeyEventBus

    publisher = ValkeyEventBus(valkey_broker, namespace="cg")
    group_a = ValkeyEventBus(valkey_broker, namespace="cg")
    group_b = ValkeyEventBus(valkey_broker, namespace="cg")

    # Override group names so they act as independent consumer groups
    group_a._group_name = "group_alpha"
    group_b._group_name = "group_beta"

    received_a: list[dict] = []
    received_b: list[dict] = []

    async def handler_a(payload: dict) -> None:
        received_a.append(payload)

    async def handler_b(payload: dict) -> None:
        received_b.append(payload)

    try:
        await group_a.subscribe("cg.event", handler_a)
        await group_b.subscribe("cg.event", handler_b)

        # Brief pause to let consumer tasks start their first xreadgroup call
        await asyncio.sleep(0.1)

        for i in range(50):
            await publisher.publish("cg.event", {"seq": i})

        # Wait up to 5 s for both groups to drain all 50 messages
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if len(received_a) >= 50 and len(received_b) >= 50:
                break
            await asyncio.sleep(0.1)

        assert len(received_a) == 50, f"group_alpha got {len(received_a)}/50"
        assert len(received_b) == 50, f"group_beta got {len(received_b)}/50"

        # No intra-group duplicates
        seqs_a = [m["seq"] for m in received_a]
        seqs_b = [m["seq"] for m in received_b]
        assert len(seqs_a) == len(set(seqs_a)), "Duplicates in group_alpha"
        assert len(seqs_b) == len(set(seqs_b)), "Duplicates in group_beta"

        # No losses
        assert set(seqs_a) == set(range(50))
        assert set(seqs_b) == set(range(50))
    finally:
        await publisher.shutdown()
        await group_a.shutdown()
        await group_b.shutdown()


# ---------------------------------------------------------------------------
# Test 3 — Pub/Sub broadcast
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pubsub_broadcast_three_listeners(valkey_broker: str) -> None:
    """3 listeners all receive the same broadcast within 1 s."""
    from cassini.core.broker.valkey import ValkeyBroadcast

    publisher = ValkeyBroadcast(valkey_broker, namespace="bc3")
    listeners = [ValkeyBroadcast(valkey_broker, namespace="bc3") for _ in range(3)]

    calls: list[list[dict]] = [[] for _ in range(3)]

    async def make_handler(idx: int):
        async def _h(payload: dict) -> None:
            calls[idx].append(payload)

        return _h

    try:
        for i, listener in enumerate(listeners):
            handler = await make_handler(i)
            await listener.subscribe("updates", handler)

        # Allow subscribe tasks to propagate before publishing
        await asyncio.sleep(0.15)

        message = {"type": "violation", "char_id": 99}
        await publisher.broadcast("updates", message)

        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline:
            if all(len(c) >= 1 for c in calls):
                break
            await asyncio.sleep(0.05)

        for i, c in enumerate(calls):
            assert len(c) == 1, f"Listener {i} received {len(c)} messages, expected 1"
            assert c[0] == message
    finally:
        await publisher.shutdown()
        for listener in listeners:
            await listener.shutdown()


# ---------------------------------------------------------------------------
# Test 4 — Subscribe-before-connect regression (A4-H7)
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason=(
        "A4-H7: ValkeyEventBus.subscribe() called before start() stores the "
        "handler in _handlers but never creates a consumer task because _client "
        "is None at subscribe time. start() only pings — it does not replay "
        "pending subscriptions. Handler is silently dropped."
    ),
    strict=True,
)
@pytest.mark.asyncio
async def test_subscribe_before_connect_regression(valkey_broker: str) -> None:
    """Handler registered before start() must receive events after start().

    Regression test for A4-H7. The bug: ValkeyEventBus.subscribe() returns
    early when _client is None without scheduling a consumer task. Calling
    start() afterwards only pings the server; it does not replay the pending
    _handlers entries and create the missing consumer tasks.
    """
    from cassini.core.broker.valkey import ValkeyEventBus

    # Build bus WITHOUT connecting (connect=False mirrors the pre-connect state)
    bus = ValkeyEventBus(valkey_broker, namespace="sub_before", connect=False)

    received: list[dict] = []

    async def handler(payload: dict) -> None:
        received.append(payload)

    # Subscribe BEFORE connecting — this is the bug trigger
    await bus.subscribe("early.topic", handler)

    # Now wire up the real client and start (as app startup would do)
    import redis.asyncio as aioredis

    bus._client = aioredis.from_url(valkey_broker, decode_responses=True)
    await bus.start()

    # Give the (hypothetical) consumer task time to initialise
    await asyncio.sleep(0.1)

    # Publish — if the bug is present, handler never fires
    publisher = ValkeyEventBus(valkey_broker, namespace="sub_before")
    try:
        await publisher.publish("early.topic", {"seq": 1})

        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if received:
                break
            await asyncio.sleep(0.05)

        assert len(received) == 1, f"Expected 1 event, got {len(received)}"
        assert received[0]["seq"] == 1
    finally:
        await publisher.shutdown()
        await bus.shutdown()


# ---------------------------------------------------------------------------
# Test 5 — LeaderElection acquires + renews
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_leader_election_acquire_and_renew(valkey_broker: str) -> None:
    """Only 1 of 3 candidates wins. Winner renews; others cannot re-acquire while it holds."""
    import redis.asyncio as aioredis

    from cassini.core.broker.leader import LeaderElection

    clients = [aioredis.from_url(valkey_broker, decode_responses=True) for _ in range(3)]
    candidates = [
        LeaderElection(
            clients[i],
            role="test_role_acq",
            namespace=f"le_test_{i}",
            ttl=5,
            renew_interval=1.0,
        )
        for i in range(3)
    ]
    # Use the same lock key for all — override namespace to match
    lock_ns = "le_shared"
    for c in candidates:
        c._lock_key = f"cassini:{lock_ns}:leader:test_role_acq"

    try:
        results = [await c.try_acquire() for c in candidates]
        winners = [c for c in candidates if c.is_leader]
        assert len(winners) == 1, f"Expected exactly 1 winner, got {len(winners)}"

        winner = winners[0]
        winner.start_renewal()

        # Sleep past half TTL — winner should still hold after renewal fires
        await asyncio.sleep(1.5)

        assert winner.is_leader, "Winner lost leadership before TTL expired"

        # No other candidate should be able to acquire while winner holds
        for c in candidates:
            if c is not winner:
                re_acquired = await c.try_acquire()
                assert not re_acquired, "Non-winner acquired lock held by winner"
    finally:
        for c in candidates:
            c.stop_renewal()
            await c.release()
        for cl in clients:
            await cl.aclose()


# ---------------------------------------------------------------------------
# Test 6 — LeaderElection Lua atomic release
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_leader_election_lua_atomic_release(valkey_broker: str) -> None:
    """Winner releases with Lua script; impostor cannot release the same key."""
    import redis.asyncio as aioredis

    from cassini.core.broker.leader import LeaderElection, _RELEASE_SCRIPT

    winner_client = aioredis.from_url(valkey_broker, decode_responses=True)
    impostor_client = aioredis.from_url(valkey_broker, decode_responses=True)

    lock_ns = "le_lua"
    winner = LeaderElection(
        winner_client, role="lua_role", namespace=lock_ns, ttl=30
    )
    impostor = LeaderElection(
        impostor_client, role="lua_role", namespace=lock_ns, ttl=30
    )
    # Same lock key
    impostor._lock_key = winner._lock_key

    try:
        acquired = await winner.try_acquire()
        assert acquired, "Winner failed to acquire lock"

        # Impostor attempts Lua release with its own node_id — should return 0
        impostor_result = await impostor_client.eval(
            _RELEASE_SCRIPT, 1, winner._lock_key, impostor._node_id
        )
        assert impostor_result == 0, "Impostor was able to release winner's lock"

        # Key still exists
        val = await winner_client.get(winner._lock_key)
        assert val == winner._node_id, "Lock key missing after failed impostor release"

        # Winner releases correctly
        await winner.release()
        assert not winner.is_leader

        val_after = await winner_client.get(winner._lock_key)
        assert val_after is None, "Lock key still set after winner release"
    finally:
        await winner_client.aclose()
        await impostor_client.aclose()


# ---------------------------------------------------------------------------
# Test 7 — LeaderElection renewal-failure recovery (A4-M10)
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason=(
        "A4-M10: When _renew_loop exits due to an exception it does not clear "
        "_renewal_task. start_renewal() guards with 'if self._renewal_task is not None: "
        "return', so after a failure the stale done-task ref permanently blocks "
        "re-registration. Fix: clear _renewal_task before returning from _renew_loop."
    ),
    strict=True,
)
@pytest.mark.asyncio
async def test_leader_renewal_failure_recovery(valkey_broker: str) -> None:
    """After renewal Redis call fails, start_renewal() works again on reconnect.

    Regression for A4-M10. The bug: _renew_loop does not clear _renewal_task
    before returning on exception, so start_renewal() short-circuits forever.
    """
    import redis.asyncio as aioredis

    from cassini.core.broker.leader import LeaderElection

    client = aioredis.from_url(valkey_broker, decode_responses=True)
    lost_events: list[None] = []

    async def on_lost() -> None:
        lost_events.append(None)

    election = LeaderElection(
        client,
        role="recovery_role",
        namespace="le_recover",
        ttl=10,
        renew_interval=0.1,
        on_lost=on_lost,
    )

    try:
        acquired = await election.try_acquire()
        assert acquired

        election.start_renewal()

        # Simulate broker disappearing by closing the client under the task
        await client.aclose()

        # Wait for renewal loop to fire and fail
        deadline = time.monotonic() + 2.0
        while time.monotonic() < deadline:
            if lost_events:
                break
            await asyncio.sleep(0.05)

        assert lost_events, "on_lost was never called after simulated broker failure"
        assert not election.is_leader

        # BUG: _renewal_task is still set to the completed (failed) task
        # After fix: _renewal_task should be None here
        assert election._renewal_task is None, (
            "A4-M10: _renewal_task not cleared after _renew_loop exception exit"
        )

        # Reconnect and verify start_renewal works again
        election._client = aioredis.from_url(valkey_broker, decode_responses=True)
        election._is_leader = True  # Re-simulate being leader after re-acquisition

        # This must not silently no-op due to stale task ref
        election.start_renewal()
        assert election._renewal_task is not None, (
            "start_renewal() did not create new task after reconnect"
        )
        assert not election._renewal_task.done()
    finally:
        election.stop_renewal()
        try:
            await client.aclose()
        except Exception:
            pass
        if election._client and election._client is not client:
            await election._client.aclose()


# ---------------------------------------------------------------------------
# Test 8 — TypedEventBusAdapter unsubscribe (A4-M11)
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason=(
        "A4-M11: TypedEventBusAdapter.subscribe() wraps the caller's handler in "
        "a typed_handler closure before passing it to the inner bus. "
        "unsubscribe() passes the *original* handler, which is not found in "
        "_handlers (the closure is stored, not the original). Result: typed "
        "unsubscribes silently no-op and handler continues to be called."
    ),
    strict=True,
)
@pytest.mark.asyncio
async def test_typed_event_bus_adapter_unsubscribe(valkey_broker: str) -> None:
    """After typed unsubscribe, handler must not receive further events.

    Regression for A4-M11. Current behavior: typed unsubscribe is a no-op
    because the closure stored in _handlers differs from the original handler
    passed to unsubscribe().
    """
    from cassini.core.broker.event_adapter import TypedEventBusAdapter
    from cassini.core.broker.valkey import ValkeyEventBus

    @dataclasses.dataclass
    class SampleEvent:
        char_id: int
        value: float

    inner = ValkeyEventBus(valkey_broker, namespace="adapter_unsub")
    adapter = TypedEventBusAdapter(inner)
    adapter.register_event_type(SampleEvent, "sample.processed")

    calls: list[Any] = []

    async def handler(event: SampleEvent) -> None:
        calls.append(event)

    adapter.subscribe(SampleEvent, handler)
    # Allow the scheduled subscribe coroutine to run
    await asyncio.sleep(0.15)

    # Confirm subscription works
    await adapter.publish(SampleEvent(char_id=1, value=1.0))
    await asyncio.sleep(0.3)
    assert len(calls) == 1, f"Initial publish: expected 1, got {len(calls)}"

    # Now unsubscribe
    adapter.unsubscribe(SampleEvent, handler)
    await asyncio.sleep(0.15)

    # Publish again — handler must NOT be called after unsubscribe
    pre_count = len(calls)
    await adapter.publish(SampleEvent(char_id=2, value=2.0))
    await asyncio.sleep(0.3)

    assert len(calls) == pre_count, (
        f"A4-M11: handler received {len(calls) - pre_count} event(s) after unsubscribe"
    )

    await adapter.shutdown()


# ---------------------------------------------------------------------------
# Test 9 — ValkeyBroadcast listener crash recovery
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason=(
        "A4-medium: ValkeyBroadcast._listen loop catches generic Exception and "
        "sleeps 1 s before retrying, so it does recover from transient errors. "
        "However if _pubsub itself becomes permanently broken (e.g. connection "
        "dropped without reconnect), the loop will spin on the exception forever "
        "and never deliver further messages to handlers until explicit shutdown "
        "and reconnect. This test documents that state; fix requires reconnect "
        "logic inside _listen."
    ),
    strict=True,
)
@pytest.mark.asyncio
async def test_broadcast_listener_crash_recovery(valkey_broker: str) -> None:
    """After _pubsub crashes permanently, new messages are not delivered.

    Documents A4-medium: _listen catches Exception and retries, but uses
    the same broken _pubsub object — no reconnect. This test confirms that
    new messages after a pubsub crash do NOT reach handlers (current broken
    state). If the fix is applied (auto-reconnect in _listen), flip this to
    assert recovery succeeds without explicit reconnect.
    """
    from cassini.core.broker.valkey import ValkeyBroadcast

    bc = ValkeyBroadcast(valkey_broker, namespace="bc_crash")
    publisher = ValkeyBroadcast(valkey_broker, namespace="bc_crash")

    calls: list[dict] = []

    async def handler(payload: dict) -> None:
        calls.append(payload)

    try:
        await bc.subscribe("crash_ch", handler)
        await asyncio.sleep(0.15)

        # Confirm baseline works
        await publisher.broadcast("crash_ch", {"seq": 0})
        deadline = time.monotonic() + 1.0
        while time.monotonic() < deadline and not calls:
            await asyncio.sleep(0.05)
        assert calls, "Baseline: handler did not receive pre-crash message"

        # Simulate pubsub crash by closing the underlying connection
        if bc._pubsub:
            await bc._pubsub.aclose()
            # Corrupt the pubsub object so get_message raises on next call
            bc._pubsub = None

        await asyncio.sleep(0.2)

        # Publish after crash — with the bug, this should NOT be delivered
        pre_count = len(calls)
        await publisher.broadcast("crash_ch", {"seq": 1})
        await asyncio.sleep(0.5)

        # Current (broken) behavior: message is NOT delivered; assert that
        assert len(calls) == pre_count, (
            "If this fails, the auto-recovery fix is in place — remove xfail"
        )
    finally:
        await bc.shutdown()
        await publisher.shutdown()


# ---------------------------------------------------------------------------
# Test 10 — Cluster failover smoke
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cluster_failover_smoke(valkey_broker: str) -> None:
    """Second client can connect independently; first container remains reachable.

    This proves the test infrastructure can handle multiple independent clients
    (simulating cluster nodes) against the same Valkey container. True cluster
    failover requires an actual Redis Cluster or Sentinel topology outside the
    scope of this single-container fixture.
    """
    import redis.asyncio as aioredis

    from testcontainers.redis import RedisContainer  # type: ignore[import-untyped]

    # Spin a second independent Valkey container
    second_container = RedisContainer(image="valkey/valkey:8-alpine")
    second_container.start()

    second_host = second_container.get_container_host_ip()
    second_port = int(second_container.get_exposed_port(6379))
    second_url = f"redis://{second_host}:{second_port}/0"

    client_a = aioredis.from_url(valkey_broker, decode_responses=True)
    client_b = aioredis.from_url(second_url, decode_responses=True)

    try:
        # Write to first container
        await client_a.set("smoke:key", "from_a")
        val_a = await client_a.get("smoke:key")
        assert val_a == "from_a"

        # Second container is an independent node — key not replicated
        val_b_before = await client_b.get("smoke:key")
        assert val_b_before is None, "Second container should not have first container's key"

        # Write independently to second container
        await client_b.set("smoke:key", "from_b")
        val_b = await client_b.get("smoke:key")
        assert val_b == "from_b"

        # First container unaffected
        val_a_after = await client_a.get("smoke:key")
        assert val_a_after == "from_a"
    finally:
        await client_a.aclose()
        await client_b.aclose()
        second_container.stop()
