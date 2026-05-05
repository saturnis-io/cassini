"""Tests that compute_display_keys issues exactly one SQL statement.

Uses SQLAlchemy event listeners to count executed statements so the guard is
independent of the implementation mechanism (window function vs Python rank).
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from cassini.db.models import Base
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.sample import Measurement, Sample
from cassini.utils.display_keys import (
    _compute_via_python_rank,
    _compute_via_window_function,
    compute_display_keys,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _make_ts(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, 0, 0, tzinfo=timezone.utc)


async def _seed_char_and_samples(
    session: AsyncSession,
    timestamps: list[datetime],
) -> tuple[int, list[int]]:
    """Insert one hierarchy node, one characteristic, and samples at given times.

    Returns (char_id, [sample_id, ...]) in timestamp order.
    """
    hier = Hierarchy(name="Plant", type="Site", parent_id=None, plant_id=None)
    session.add(hier)
    await session.flush()

    char = Characteristic(
        name="dim_x",
        chart_type="xbar_r",
        hierarchy_id=hier.id,
        subgroup_size=1,
    )
    session.add(char)
    await session.flush()

    sample_ids: list[int] = []
    for ts in timestamps:
        s = Sample(char_id=char.id, timestamp=ts)
        session.add(s)
        await session.flush()
        sample_ids.append(s.id)

    await session.commit()
    return char.id, sample_ids


def _count_selects(engine) -> list[str]:
    """Return a mutable list that will be appended to on each cursor execute."""
    executed: list[str] = []

    @event.listens_for(engine, "before_cursor_execute")
    def _capture(conn, cursor, statement, parameters, context, executemany):
        executed.append(statement)

    return executed


# ---------------------------------------------------------------------------
# Fixture: dedicated in-memory engine so listener teardown is simple
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def counting_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def counting_session(counting_engine):
    factory = sessionmaker(counting_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session, counting_engine
        await session.rollback()


# ---------------------------------------------------------------------------
# C17 — window function path: exactly 1 SELECT
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_display_keys_single_query_window(counting_session):
    """compute_display_keys must fire exactly 1 SELECT regardless of date span.

    30 samples spanning 3 different calendar days — old code fired 3 queries.
    """
    session, engine = counting_session

    # 10 samples on day 1, 10 on day 2, 10 on day 3
    timestamps = (
        [_make_ts(2026, 1, 1, h) for h in range(10)]
        + [_make_ts(2026, 1, 2, h) for h in range(10)]
        + [_make_ts(2026, 1, 3, h) for h in range(10)]
    )

    char_id, sample_ids = await _seed_char_and_samples(session, timestamps)

    # Load ORM objects so we can pass them to compute_display_keys
    from sqlalchemy import select
    from cassini.db.models.sample import Sample as SampleModel
    result = await session.execute(
        select(SampleModel).where(SampleModel.char_id == char_id)
    )
    samples = list(result.scalars().all())

    # Attach the listener AFTER seeding so seed queries are not counted.
    executed: list[str] = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        executed.append(statement)

    keys = await compute_display_keys(samples, char_id, session)

    assert len(executed) == 1, (
        f"Expected 1 SQL statement, got {len(executed)}: {executed}"
    )
    assert len(keys) == 30
    # Each key must match YYMMDD-NNN format
    for key in keys.values():
        parts = key.split("-")
        assert len(parts) == 2
        assert len(parts[0]) == 6
        assert 1 <= int(parts[1]) <= 10


# ---------------------------------------------------------------------------
# C17 — Python-rank fallback path: exactly 1 SELECT
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_display_keys_python_rank_sqlite(counting_session):
    """_compute_via_python_rank also issues exactly 1 SELECT.

    This path is the explicit fallback for SQLite < 3.25.  Even though
    the test environment uses a modern SQLite (so compute_display_keys
    would normally take the window path), we call the fallback directly
    to verify its query count.
    """
    session, engine = counting_session

    timestamps = [_make_ts(2026, 3, 1, h) for h in range(5)] + \
                 [_make_ts(2026, 3, 2, h) for h in range(5)]

    char_id, sample_ids = await _seed_char_and_samples(session, timestamps)

    from sqlalchemy import select
    from cassini.db.models.sample import Sample as SampleModel
    result = await session.execute(
        select(SampleModel).where(SampleModel.char_id == char_id)
    )
    samples = list(result.scalars().all())

    min_ts = min(s.timestamp for s in samples)
    max_ts = max(s.timestamp for s in samples)
    id_to_yymmdd = {s.id: s.timestamp.strftime("%y%m%d") for s in samples}
    target_ids = set(id_to_yymmdd.keys())

    executed: list[str] = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        executed.append(statement)

    keys = await _compute_via_python_rank(
        session, char_id, min_ts, max_ts, id_to_yymmdd, target_ids
    )

    assert len(executed) == 1, (
        f"Python-rank fallback fired {len(executed)} queries: {executed}"
    )
    assert len(keys) == 10
    # Day 1 should have ranks 1-5, day 2 should have ranks 1-5
    day1_keys = [v for k, v in keys.items() if v.startswith("260301")]
    day2_keys = [v for k, v in keys.items() if v.startswith("260302")]
    assert sorted(day1_keys) == ["260301-001", "260301-002", "260301-003", "260301-004", "260301-005"]
    assert sorted(day2_keys) == ["260302-001", "260302-002", "260302-003", "260302-004", "260302-005"]


# ---------------------------------------------------------------------------
# Correctness: rank stability across days
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_compute_display_keys_rank_correctness(counting_session):
    """Ranks restart at 1 for each new calendar day."""
    session, engine = counting_session

    timestamps = [
        _make_ts(2026, 5, 1, 8),   # day 1, sample A (rank 1)
        _make_ts(2026, 5, 1, 9),   # day 1, sample B (rank 2)
        _make_ts(2026, 5, 2, 10),  # day 2, sample C (rank 1)
    ]
    char_id, sample_ids = await _seed_char_and_samples(session, timestamps)

    from sqlalchemy import select
    from cassini.db.models.sample import Sample as SampleModel
    result = await session.execute(
        select(SampleModel).where(SampleModel.char_id == char_id)
    )
    samples = list(result.scalars().all())

    keys = await compute_display_keys(samples, char_id, session)

    by_ts = sorted(
        ((s.timestamp, keys[s.id]) for s in samples),
        key=lambda x: x[0],
    )
    assert by_ts[0][1] == "260501-001"
    assert by_ts[1][1] == "260501-002"
    assert by_ts[2][1] == "260502-001"
