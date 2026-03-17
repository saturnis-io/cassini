"""Test distributed leader election."""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_leader_acquire_success():
    from cassini.core.broker.leader import LeaderElection

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=True)

    election = LeaderElection(
        mock_redis,
        role="reports",
        namespace="inst-abc",
        ttl=60,
        renew_interval=15,
    )
    acquired = await election.try_acquire()
    assert acquired is True

    # Verify key includes namespace
    call_args = mock_redis.set.call_args
    assert "inst-abc" in call_args[0][0]
    assert "reports" in call_args[0][0]


@pytest.mark.asyncio
async def test_leader_acquire_failure():
    from cassini.core.broker.leader import LeaderElection

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=False)

    election = LeaderElection(mock_redis, role="reports", namespace="inst-abc")
    acquired = await election.try_acquire()
    assert acquired is False


@pytest.mark.asyncio
async def test_leader_release():
    """Release uses atomic Lua script via Redis server-side EVAL (not Python eval)."""
    from cassini.core.broker.leader import LeaderElection

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=True)
    # Redis EVAL runs a Lua script server-side for atomic compare-and-delete
    mock_redis.eval = AsyncMock(return_value=1)  # noqa: S307

    election = LeaderElection(mock_redis, role="reports", namespace="inst-abc")
    await election.try_acquire()
    await election.release()

    assert not election.is_leader


@pytest.mark.asyncio
async def test_leader_callback_on_lost():
    """When the lock cannot be renewed, the on_lost callback fires."""
    from cassini.core.broker.leader import LeaderElection

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(side_effect=[True, False])

    lost = asyncio.Event()

    async def on_lost():
        lost.set()

    election = LeaderElection(
        mock_redis, role="reports", namespace="inst-abc",
        ttl=1, renew_interval=0.1, on_lost=on_lost,
    )
    await election.try_acquire()
    election.start_renewal()

    await asyncio.wait_for(lost.wait(), timeout=2.0)
    assert lost.is_set()
    election.stop_renewal()


@pytest.mark.asyncio
async def test_two_instances_different_namespaces():
    """Two installations on the same Valkey should not conflict."""
    from cassini.core.broker.leader import LeaderElection

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=True)

    e1 = LeaderElection(mock_redis, role="reports", namespace="inst-AAA")
    e2 = LeaderElection(mock_redis, role="reports", namespace="inst-BBB")

    await e1.try_acquire()
    await e2.try_acquire()

    calls = mock_redis.set.call_args_list
    key1 = calls[0][0][0]
    key2 = calls[1][0][0]
    assert key1 != key2
    assert "inst-AAA" in key1
    assert "inst-BBB" in key2


@pytest.mark.asyncio
async def test_leader_node_id_contains_hostname_pid():
    from cassini.core.broker.leader import LeaderElection
    import os, socket

    mock_redis = AsyncMock()
    election = LeaderElection(mock_redis, role="reports", namespace="inst-abc")

    assert socket.gethostname() in election._node_id
    assert str(os.getpid()) in election._node_id
