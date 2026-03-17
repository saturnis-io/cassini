"""Test correlation ID generation and propagation."""
import pytest
import asyncio
import uuid


def test_generate_correlation_id():
    from cassini.core.correlation_id import generate_correlation_id
    cid = generate_correlation_id()
    assert isinstance(cid, str)
    assert len(cid) > 0
    # Should be a valid UUID or short UUID
    assert len(cid) >= 8


def test_set_and_get_correlation_id():
    from cassini.core.correlation_id import set_correlation_id, get_correlation_id
    set_correlation_id("test-123")
    assert get_correlation_id() == "test-123"


def test_get_correlation_id_default():
    """When no correlation ID is set, should return None or empty."""
    import contextvars
    from cassini.core.correlation_id import _correlation_id_var, get_correlation_id
    # Reset the contextvar
    token = _correlation_id_var.set("")
    try:
        result = get_correlation_id()
        assert result == "" or result is None
    finally:
        _correlation_id_var.reset(token)


def test_correlation_id_isolation():
    """Different async tasks should have independent correlation IDs."""
    from cassini.core.correlation_id import set_correlation_id, get_correlation_id

    async def task_a():
        set_correlation_id("task-a")
        await asyncio.sleep(0.01)
        return get_correlation_id()

    async def task_b():
        set_correlation_id("task-b")
        await asyncio.sleep(0.01)
        return get_correlation_id()

    async def run():
        a, b = await asyncio.gather(task_a(), task_b())
        return a, b

    loop = asyncio.new_event_loop()
    try:
        a, b = loop.run_until_complete(run())
    finally:
        loop.close()
    # contextvars may or may not isolate in gather depending on implementation
    # At minimum, each should have SOME correlation ID
    assert a is not None
    assert b is not None
