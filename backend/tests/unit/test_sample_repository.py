"""Unit tests for SampleRepository.create_with_measurements batch optimization."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.sample import Measurement, Sample
from cassini.db.repositories import SampleRepository


class TestCreateWithMeasurements:
    """Tests for SampleRepository.create_with_measurements."""

    @pytest.mark.asyncio
    async def test_create_with_measurements_preserves_order(
        self, async_session: AsyncSession
    ) -> None:
        """Values come back in insertion order."""
        from cassini.db.repositories import CharacteristicRepository, HierarchyRepository

        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Order Test",
            subgroup_size=5,
        )

        values = [1.1, 2.2, 3.3, 4.4, 5.5]
        sample = await s_repo.create_with_measurements(
            char_id=char.id, values=values
        )

        # The set_committed_value-attached measurements should preserve order
        measurement_values = [m.value for m in sample.measurements]
        assert measurement_values == values

    @pytest.mark.asyncio
    async def test_create_with_measurements_empty_list(
        self, async_session: AsyncSession
    ) -> None:
        """Empty list creates sample with no measurements."""
        from cassini.db.repositories import CharacteristicRepository, HierarchyRepository

        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Empty Test",
            subgroup_size=1,
        )

        sample = await s_repo.create_with_measurements(
            char_id=char.id, values=[]
        )

        assert sample.id is not None
        assert sample.measurements == []

        # Verify no measurements in DB
        from sqlalchemy import select as sql_select

        stmt = sql_select(Measurement).where(Measurement.sample_id == sample.id)
        result = await async_session.execute(stmt)
        assert list(result.scalars().all()) == []

    @pytest.mark.asyncio
    async def test_create_with_measurements_uses_add_all(self) -> None:
        """Verify session.add_all is called instead of individual session.add per measurement."""
        mock_session = AsyncMock(spec=AsyncSession)

        # Make flush assign an id to the sample object
        flush_call_count = 0

        async def fake_flush() -> None:
            nonlocal flush_call_count
            flush_call_count += 1
            # On first flush, assign sample ID (simulating DB autoincrement)
            if flush_call_count == 1:
                # The sample was added via session.add() — find it
                add_call = mock_session.add.call_args
                if add_call:
                    sample_obj = add_call[0][0]
                    if isinstance(sample_obj, Sample):
                        sample_obj.id = 42

        mock_session.flush = AsyncMock(side_effect=fake_flush)

        repo = SampleRepository(mock_session)
        sample = await repo.create_with_measurements(
            char_id=1, values=[10.0, 20.0, 30.0]
        )

        # session.add should be called exactly once (for the Sample)
        sample_add_calls = [
            c for c in mock_session.add.call_args_list
            if isinstance(c[0][0], Sample)
        ]
        assert len(sample_add_calls) == 1

        # session.add should NOT be called for individual Measurements
        measurement_add_calls = [
            c for c in mock_session.add.call_args_list
            if isinstance(c[0][0], Measurement)
        ]
        assert len(measurement_add_calls) == 0

        # session.add_all should be called once with a list of 3 Measurements
        mock_session.add_all.assert_called_once()
        added_measurements = mock_session.add_all.call_args[0][0]
        assert len(added_measurements) == 3
        assert all(isinstance(m, Measurement) for m in added_measurements)
        assert [m.value for m in added_measurements] == [10.0, 20.0, 30.0]

    @pytest.mark.asyncio
    async def test_create_with_measurements_single_value(
        self, async_session: AsyncSession
    ) -> None:
        """Single measurement works correctly."""
        from cassini.db.repositories import CharacteristicRepository, HierarchyRepository

        h_repo = HierarchyRepository(async_session)
        c_repo = CharacteristicRepository(async_session)
        s_repo = SampleRepository(async_session)

        site = await h_repo.create(name="Site A", type="Site", parent_id=None)
        char = await c_repo.create(
            hierarchy_id=site.id,
            name="Single Test",
            subgroup_size=1,
        )

        sample = await s_repo.create_with_measurements(
            char_id=char.id, values=[42.0]
        )

        assert sample.id is not None
        assert len(sample.measurements) == 1
        assert sample.measurements[0].value == 42.0
        assert sample.measurements[0].sample_id == sample.id
