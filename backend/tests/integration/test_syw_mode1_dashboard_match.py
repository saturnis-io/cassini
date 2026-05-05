"""Verify SYW Mode 1 explain query matches dashboard query exactly.

Audit C14: When the explain endpoint is called with ``limit`` only (no
date range), it used to call ``get_by_characteristic`` and trim the
result with ``[-limit:]``.  The dashboard's chart endpoint, in contrast,
calls ``get_rolling_window``/``get_rolling_window_data`` with
``window_size=limit, exclude_excluded=True``.  The two return the same
rows IFF no samples are excluded, but ANY excluded sample causes a
silent drift between the displayed Cpk and the explained Cpk.

The fix: explain Mode 1 (limit-only) now uses
``get_rolling_window_data(window_size=limit, exclude_excluded=True)`` —
the same query the dashboard uses.

This test seeds a small population including an excluded sample and
asserts both queries return identical row sets.
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
async def char_with_excluded(async_session: AsyncSession) -> tuple[Characteristic, list[float]]:
    """Seed 5 samples; one is excluded."""
    hierarchy = Hierarchy(name="SYW Site", type="Site", parent_id=None)
    async_session.add(hierarchy)
    await async_session.flush()

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="SYW Mode 1",
        subgroup_size=1,
        target_value=100.0,
        usl=110.0,
        lsl=90.0,
        stored_sigma=2.0,
        stored_center_line=100.0,
    )
    async_session.add(char)
    await async_session.flush()

    base = datetime(2025, 2, 1, 9, 0, 0, tzinfo=timezone.utc)
    raw = [99.0, 105.0, 100.0, 130.0, 101.0]  # 130.0 is the excluded outlier
    for i, value in enumerate(raw):
        is_excluded = (value == 130.0)
        sample = Sample(
            char_id=char.id,
            timestamp=base + timedelta(minutes=i),
            is_excluded=is_excluded,
        )
        async_session.add(sample)
        await async_session.flush()
        async_session.add(Measurement(sample_id=sample.id, value=value))

    await async_session.commit()
    # Returned values reflect non-excluded samples in chronological order
    return char, [99.0, 105.0, 100.0, 101.0]


class TestMode1DashboardMatch:
    """Mode 1 (limit-only) must use the same query as the dashboard."""

    @pytest.mark.asyncio
    async def test_get_rolling_window_data_excludes_excluded(
        self,
        async_session: AsyncSession,
        char_with_excluded: tuple[Characteristic, list[float]],
    ) -> None:
        """The repository query the dashboard uses correctly skips excluded
        samples — this is the foundation of the explain fix."""
        char, expected_values = char_with_excluded
        repo = SampleRepository(async_session)

        rows = await repo.get_rolling_window_data(
            char_id=char.id, window_size=10, exclude_excluded=True,
        )

        all_values: list[float] = []
        for r in rows:
            all_values.extend(r["values"])

        assert len(all_values) == len(expected_values)
        assert all_values == expected_values

    @pytest.mark.asyncio
    async def test_explain_mode1_query_matches_chart_query(
        self,
        async_session: AsyncSession,
        char_with_excluded: tuple[Characteristic, list[float]],
    ) -> None:
        """The Mode 1 explain query (now get_rolling_window_data with
        exclude_excluded=True) returns the same row set as the chart
        endpoint's get_rolling_window query."""
        char, _ = char_with_excluded
        repo = SampleRepository(async_session)

        # Mode 1 explain branch (post-fix)
        explain_rows = await repo.get_rolling_window_data(
            char_id=char.id, window_size=10, exclude_excluded=True,
        )
        explain_ids = {r["sample_id"] for r in explain_rows}

        # Dashboard chart endpoint
        chart_samples = await repo.get_rolling_window(
            char_id=char.id, window_size=10, exclude_excluded=True,
        )
        chart_ids = {s.id for s in chart_samples}

        assert explain_ids == chart_ids, (
            "Mode 1 explain must query the same rows as the dashboard chart "
            "endpoint to keep displayed and explained Cpk in sync."
        )

    @pytest.mark.asyncio
    async def test_old_buggy_query_would_have_diverged(
        self,
        async_session: AsyncSession,
        char_with_excluded: tuple[Characteristic, list[float]],
    ) -> None:
        """Sanity: the old query path (get_by_characteristic + trim) would
        have included the excluded sample, proving the bug existed."""
        char, _ = char_with_excluded
        repo = SampleRepository(async_session)

        # Old behavior: get_by_characteristic does NOT filter is_excluded
        all_samples = await repo.get_by_characteristic(char_id=char.id)
        any_excluded = any(s.is_excluded for s in all_samples)

        assert any_excluded, (
            "Old explain path used get_by_characteristic which returns "
            "excluded samples; this test exists to fail loudly if the "
            "repository ever changes its filter behavior."
        )
