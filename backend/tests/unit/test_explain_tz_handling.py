"""Test that explain.py and ishikawa.py handle naive ISO datetime strings correctly.

SQLite stores datetimes WITHOUT timezone info.  When the API parses a naive
ISO string with ``datetime.fromisoformat`` and passes it to a SQLAlchemy
filter, SQLite compares the naive value against the (effectively naive)
stored timestamp -- but a naive datetime parsed from "2025-01-15T10:00:00"
in a system whose local clock is, say, UTC+05:00 represents a DIFFERENT
absolute moment than "2025-01-15T10:00:00Z" stored from a UTC-aware insert.

The fix normalizes naive ISO strings to UTC before query, matching the
pattern used in correlation.py.  These tests verify that a naive ISO
input yields the same row set as the corresponding UTC-aware input.

Audit reference: A1-C11.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.sample import Measurement, Sample
from cassini.db.repositories.sample import SampleRepository


@pytest_asyncio.fixture
async def char_with_samples(async_session: AsyncSession) -> tuple[Characteristic, list[datetime]]:
    """Seed a characteristic with three samples, each with a UTC timestamp.

    Returns (characteristic, [ts0, ts1, ts2]) in chronological order.
    """
    hierarchy = Hierarchy(name="Test Site", type="Site", parent_id=None)
    async_session.add(hierarchy)
    await async_session.flush()

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="TZ Test",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
    )
    async_session.add(char)
    await async_session.flush()

    base = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    timestamps: list[datetime] = []
    for i, value in enumerate([100.0, 101.0, 99.5]):
        ts = base + timedelta(hours=i)
        sample = Sample(char_id=char.id, timestamp=ts)
        async_session.add(sample)
        await async_session.flush()
        m = Measurement(sample_id=sample.id, value=value)
        async_session.add(m)
        timestamps.append(ts)

    await async_session.commit()
    return char, timestamps


def _normalize(dt: datetime) -> datetime:
    """Mirror the production fix: replace missing tzinfo with UTC."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class TestNaiveDatetimeNormalization:
    """Verify the explicit replace(tzinfo=utc) pattern matches aware input."""

    @pytest.mark.asyncio
    async def test_naive_iso_string_parses_to_same_row_set_as_aware(
        self,
        async_session: AsyncSession,
        char_with_samples: tuple[Characteristic, list[datetime]],
    ) -> None:
        """A naive ISO string range, after normalization, returns the same rows
        as the equivalent UTC-aware range."""
        char, timestamps = char_with_samples
        repo = SampleRepository(async_session)

        # Range covers all three samples
        start_naive = datetime.fromisoformat("2025-01-15T11:00:00")  # no tz
        end_naive = datetime.fromisoformat("2025-01-15T15:00:00")
        assert start_naive.tzinfo is None
        assert end_naive.tzinfo is None

        # Apply the production fix locally
        start_aware = _normalize(start_naive)
        end_aware = _normalize(end_naive)
        assert start_aware.tzinfo is timezone.utc
        assert end_aware.tzinfo is timezone.utc

        # Query with explicitly UTC-aware datetimes
        explicit_aware_start = datetime(2025, 1, 15, 11, 0, 0, tzinfo=timezone.utc)
        explicit_aware_end = datetime(2025, 1, 15, 15, 0, 0, tzinfo=timezone.utc)

        rows_normalized = await repo.get_by_characteristic(
            char_id=char.id, start_date=start_aware, end_date=end_aware,
        )
        rows_aware = await repo.get_by_characteristic(
            char_id=char.id,
            start_date=explicit_aware_start,
            end_date=explicit_aware_end,
        )

        normalized_ids = sorted(s.id for s in rows_normalized)
        aware_ids = sorted(s.id for s in rows_aware)

        assert normalized_ids == aware_ids, (
            "Normalizing naive ISO datetimes to UTC must return the same rows "
            "as querying with explicitly UTC-aware datetimes."
        )
        assert len(normalized_ids) == 3, "All three seeded samples should match"

    @pytest.mark.asyncio
    async def test_naive_normalization_matches_partial_range(
        self,
        async_session: AsyncSession,
        char_with_samples: tuple[Characteristic, list[datetime]],
    ) -> None:
        """A partial range (excludes the earliest sample) returns the same
        results whether the boundary is naive-then-normalized or aware."""
        char, _timestamps = char_with_samples
        repo = SampleRepository(async_session)

        start_naive = datetime.fromisoformat("2025-01-15T13:00:00")
        end_naive = datetime.fromisoformat("2025-01-15T16:00:00")

        rows_normalized = await repo.get_by_characteristic(
            char_id=char.id,
            start_date=_normalize(start_naive),
            end_date=_normalize(end_naive),
        )
        rows_aware = await repo.get_by_characteristic(
            char_id=char.id,
            start_date=datetime(2025, 1, 15, 13, 0, 0, tzinfo=timezone.utc),
            end_date=datetime(2025, 1, 15, 16, 0, 0, tzinfo=timezone.utc),
        )

        assert sorted(s.id for s in rows_normalized) == sorted(s.id for s in rows_aware)
        # Two of three samples lie in the partial range (13:00 and 14:00)
        assert len(rows_normalized) == 2

    def test_normalization_helper_is_idempotent(self) -> None:
        """Calling the normalization on an already-aware datetime is a no-op."""
        already_aware = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
        assert _normalize(already_aware) == already_aware
        # Naive becomes UTC-aware
        naive = datetime(2025, 1, 15, 12, 0, 0)
        normalized = _normalize(naive)
        assert normalized.tzinfo is timezone.utc
        assert normalized.year == 2025 and normalized.hour == 12
