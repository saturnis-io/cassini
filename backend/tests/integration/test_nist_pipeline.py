"""Integration tests: NIST reference data through the full SPC pipeline.

Push certified reference datasets through SPCEngine -> DB -> query back,
then verify persisted values and recalculated control limits match
published/certified results.
"""

from __future__ import annotations

import numpy as np
import pytest
import pytest_asyncio

from cassini.core.engine.control_limits import ControlLimitService
from cassini.core.engine.nelson_rules import NelsonRuleLibrary
from cassini.core.engine.rolling_window import RollingWindowManager
from cassini.core.engine.spc_engine import SPCEngine
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.repositories import (
    CharacteristicRepository,
    HierarchyRepository,
    SampleRepository,
    ViolationRepository,
)
from cassini.reference.datasets import HANDBOOK_FLOWRATE, MONTGOMERY_PISTON_RINGS
from tests.reference.conftest import flatten_subgroups, subgroups_to_means_ranges

pytestmark = [pytest.mark.nist, pytest.mark.validation, pytest.mark.asyncio]


# ---------------------------------------------------------------------------
# Shared fixtures (mirror test_spc_integration.py patterns exactly)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def hierarchy(async_session):
    """Create test hierarchy."""
    repo = HierarchyRepository(async_session)
    hierarchy = await repo.create(
        name="NIST Reference Factory", type="Site", parent_id=None
    )
    await async_session.commit()
    return hierarchy


@pytest_asyncio.fixture
async def spc_engine(async_session):
    """Create SPC engine with real repositories."""
    sample_repo = SampleRepository(async_session)
    char_repo = CharacteristicRepository(async_session)
    violation_repo = ViolationRepository(async_session)
    window_manager = RollingWindowManager(sample_repo, max_cached_windows=100, window_size=25)
    rule_library = NelsonRuleLibrary()

    return SPCEngine(
        sample_repo=sample_repo,
        char_repo=char_repo,
        violation_repo=violation_repo,
        window_manager=window_manager,
        rule_library=rule_library,
    )


@pytest_asyncio.fixture
async def control_limit_service(async_session):
    """Create ControlLimitService with real repositories."""
    sample_repo = SampleRepository(async_session)
    char_repo = CharacteristicRepository(async_session)
    window_manager = RollingWindowManager(sample_repo, max_cached_windows=100, window_size=25)
    return ControlLimitService(sample_repo, char_repo, window_manager)


# ---------------------------------------------------------------------------
# TestIMRPipeline — HANDBOOK_FLOWRATE (10 individual observations)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def imr_characteristic(async_session, hierarchy):
    """Create characteristic for I-MR chart (subgroup_size=1).

    Pre-sets certified control limits so the engine can classify zones
    from the very first sample (avoids recalculate_limits failure with <2 samples).
    """
    certified = HANDBOOK_FLOWRATE.certified_i_chart
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="NIST Flowrate IMR",
        description="NIST e-Handbook Section 6.3.2.2 flowrate data",
        subgroup_size=1,
        target_value=HANDBOOK_FLOWRATE.certified_mean,
        ucl=certified.ucl,
        lcl=certified.lcl,
    )
    async_session.add(char)
    await async_session.flush()

    # Enable Nelson Rules 1-8 (mirrors test_spc_integration.py)
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


class TestIMRPipeline:
    """HANDBOOK_FLOWRATE dataset (10 observations) through the full pipeline."""

    async def test_persisted_samples_match_input(
        self, async_session, spc_engine, imr_characteristic
    ):
        """Submit each value via process_sample, query back, assert means match."""
        ds = HANDBOOK_FLOWRATE

        # Push all observations through the engine
        for value in ds.values:
            result = await spc_engine.process_sample(
                characteristic_id=imr_characteristic.id,
                measurements=[value],
            )
            await async_session.commit()

            # ProcessingResult.mean should equal the input (n=1)
            assert result.mean == pytest.approx(value, rel=1e-9), (
                f"ProcessingResult mean {result.mean} != input {value}"
            )

        # Query back all persisted samples
        sample_repo = SampleRepository(async_session)
        samples = await sample_repo.get_by_characteristic(imr_characteristic.id)
        assert len(samples) == len(ds.values), (
            f"Expected {len(ds.values)} samples, got {len(samples)}"
        )

        # Verify each persisted measurement value matches the input
        # Samples are returned in timestamp order; we submitted in order.
        persisted_values = []
        for sample in samples:
            assert len(sample.measurements) == 1
            persisted_values.append(sample.measurements[0].value)

        for i, (persisted, expected) in enumerate(zip(persisted_values, ds.values)):
            assert persisted == pytest.approx(expected, rel=1e-9), (
                f"Sample {i}: persisted value {persisted} != expected {expected}"
            )

    async def test_control_limits_match_certified(
        self, async_session, spc_engine, control_limit_service, imr_characteristic
    ):
        """After processing all samples, recalculate limits and compare to certified."""
        ds = HANDBOOK_FLOWRATE

        # Push all observations through the engine
        for value in ds.values:
            await spc_engine.process_sample(
                characteristic_id=imr_characteristic.id,
                measurements=[value],
            )
            await async_session.commit()

        # Recalculate limits via ControlLimitService
        calc_result = await control_limit_service.calculate_limits(
            characteristic_id=imr_characteristic.id,
            min_samples=len(ds.values),
        )

        certified = ds.certified_i_chart
        assert certified is not None, "HANDBOOK_FLOWRATE must have certified_i_chart"

        assert calc_result.center_line == pytest.approx(
            certified.center_line, rel=1e-4
        ), (
            f"Center line: {calc_result.center_line} != certified {certified.center_line}"
        )
        assert calc_result.ucl == pytest.approx(certified.ucl, rel=1e-4), (
            f"UCL: {calc_result.ucl} != certified {certified.ucl}"
        )
        assert calc_result.lcl == pytest.approx(certified.lcl, rel=1e-4), (
            f"LCL: {calc_result.lcl} != certified {certified.lcl}"
        )


# ---------------------------------------------------------------------------
# TestSubgroupPipeline — MONTGOMERY_PISTON_RINGS Phase I (25 subgroups x 5)
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def subgroup_characteristic(async_session, hierarchy):
    """Create characteristic for X-bar/R chart (subgroup_size=5).

    Pre-sets certified control limits so the engine can classify zones
    from the very first subgroup.
    """
    certified = MONTGOMERY_PISTON_RINGS.certified_xbar_chart
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Montgomery Piston Rings",
        description="Montgomery ISQC piston ring diameter, Phase I",
        subgroup_size=MONTGOMERY_PISTON_RINGS.subgroup_size,
        target_value=74.000,
        ucl=certified.ucl,
        lcl=certified.lcl,
    )
    async_session.add(char)
    await async_session.flush()

    # Enable Nelson Rules 1-8
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


class TestSubgroupPipeline:
    """MONTGOMERY_PISTON_RINGS Phase I (25 subgroups of 5) through the pipeline."""

    async def test_subgroup_means_persisted(
        self, async_session, spc_engine, subgroup_characteristic
    ):
        """Submit Phase I subgroups, verify persisted sample means match expected."""
        ds = MONTGOMERY_PISTON_RINGS
        phase1 = ds.phase1_subgroups

        # Compute expected means from raw subgroup data
        expected_means, _ = subgroups_to_means_ranges(phase1)

        # Push each subgroup through the engine
        for sg in phase1:
            result = await spc_engine.process_sample(
                characteristic_id=subgroup_characteristic.id,
                measurements=list(sg),
            )
            await async_session.commit()

        # Query back all persisted samples
        sample_repo = SampleRepository(async_session)
        samples = await sample_repo.get_by_characteristic(subgroup_characteristic.id)
        assert len(samples) == len(phase1), (
            f"Expected {len(phase1)} samples, got {len(samples)}"
        )

        # Each ProcessingResult.mean should match np.mean(subgroup)
        # Verify via the persisted measurement values (re-derive mean)
        for i, sample in enumerate(samples):
            measurement_values = [m.value for m in sample.measurements]
            persisted_mean = float(np.mean(measurement_values))
            assert persisted_mean == pytest.approx(expected_means[i], rel=1e-9), (
                f"Subgroup {i}: persisted mean {persisted_mean} != "
                f"expected {expected_means[i]}"
            )
