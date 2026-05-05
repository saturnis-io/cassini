"""Verify the cold-start guard for ``recalculate_limits``.

Audit C12: When the very first sample lands on a freshly-created
characteristic, ``_get_zone_boundaries_with_values`` falls into Path 3
(no stored limits, no cache) and calls ``recalculate_limits``.  The
underlying chart-specific helper (calculate_imr_limits, etc.) requires
at least 2 data points; on the very first sample, only one is in the
window, so it raises ``ValueError("Need at least 2 samples...")``.

Before the fix, that ValueError propagated up to the FastAPI layer as a
500, AND the in-flight transaction was rolled back -- the freshly
inserted sample disappeared from the caller's perspective even though
the response body suggested it had landed.

After the fix, the engine catches the cold-start ValueError, logs it,
and returns synthetic neutral boundaries so the sample insert commits
normally.  Limits are computed on the next sample once enough data
exists.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.rolling_window import RollingWindowManager
from cassini.core.engine.spc_engine import SPCEngine
from cassini.core.providers.protocol import SampleContext
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.repositories import (
    CharacteristicRepository,
    HierarchyRepository,
    SampleRepository,
    ViolationRepository,
)


@pytest_asyncio.fixture
async def hierarchy(async_session: AsyncSession) -> Hierarchy:
    repo = HierarchyRepository(async_session)
    h = await repo.create(name="ColdStart Site", type="Site", parent_id=None)
    await async_session.commit()
    return h


@pytest_asyncio.fixture
async def cold_char(async_session: AsyncSession, hierarchy: Hierarchy) -> Characteristic:
    """A characteristic with NO stored limits and NO history."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Cold Start Test",
        subgroup_size=1,
        target_value=100.0,
        # Deliberately no ucl/lcl/stored_sigma — forces the recalculate path
        ucl=None,
        lcl=None,
        stored_sigma=None,
        stored_center_line=None,
    )
    async_session.add(char)
    await async_session.flush()
    for rule_id in range(1, 9):
        async_session.add(
            CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        )
    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def spc_engine(async_session: AsyncSession) -> SPCEngine:
    sample_repo = SampleRepository(async_session)
    char_repo = CharacteristicRepository(async_session)
    violation_repo = ViolationRepository(async_session)
    window_manager = RollingWindowManager(
        sample_repo, max_cached_windows=10, window_size=25
    )
    rule_library = NelsonRuleLibrary()
    return SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=window_manager,
        rule_library=rule_library,
    )


class TestColdStartGuard:
    """The first sample must persist without raising even when limits cannot
    yet be computed."""

    @pytest.mark.asyncio
    async def test_first_sample_persists_with_no_history(
        self,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        cold_char: Characteristic,
    ) -> None:
        """First-ever sample on a brand-new characteristic returns success
        and persists, even though no historical data exists for limit
        calculation."""
        result = await spc_engine.process_sample(
            characteristic_id=cold_char.id,
            measurements=[100.5],
            context=SampleContext(batch_number="COLD-001"),
        )
        await async_session.commit()

        # Sample landed
        assert result.sample_id > 0
        assert result.characteristic_id == cold_char.id
        assert result.mean == 100.5

        # Verify persisted in DB
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.get_by_id(result.sample_id)
        assert sample is not None, (
            "First sample must persist; cold-start ValueError must NOT roll "
            "back the transaction."
        )
        assert sample.batch_number == "COLD-001"
        assert len(sample.measurements) == 1
        assert sample.measurements[0].value == 100.5

    @pytest.mark.asyncio
    async def test_limits_remain_unset_after_cold_start(
        self,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        cold_char: Characteristic,
    ) -> None:
        """The cold-start path must NOT cache fake limits.  The next call to
        recalculate must still recompute (or fail again gracefully) once
        enough data exists."""
        await spc_engine.process_sample(
            characteristic_id=cold_char.id,
            measurements=[100.5],
        )
        await async_session.commit()

        # Stored limits on the characteristic remain unset
        await async_session.refresh(cold_char)
        assert cold_char.ucl is None
        assert cold_char.lcl is None
        assert cold_char.stored_sigma is None

    @pytest.mark.asyncio
    async def test_second_sample_eventually_yields_limits(
        self,
        async_session: AsyncSession,
        spc_engine: SPCEngine,
        cold_char: Characteristic,
    ) -> None:
        """After enough samples to compute I-MR limits, recalculate
        succeeds and the sample is processed normally."""
        # First sample (cold start)
        await spc_engine.process_sample(
            characteristic_id=cold_char.id, measurements=[100.0]
        )
        await async_session.commit()

        # Second sample — recalculate should now succeed (n>=2 for I-MR)
        result = await spc_engine.process_sample(
            characteristic_id=cold_char.id, measurements=[101.0]
        )
        await async_session.commit()

        assert result.sample_id > 0
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.get_by_id(result.sample_id)
        assert sample is not None
