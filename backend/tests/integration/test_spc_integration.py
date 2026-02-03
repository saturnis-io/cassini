"""Integration tests for complete SPC pipeline.

These tests verify the end-to-end workflow of the SPC engine with
real database operations and all components integrated.
"""

import pytest
import pytest_asyncio
from datetime import datetime

from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.protocol import SampleContext
from openspc.db.models.characteristic import Characteristic, CharacteristicRule, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.repositories import (
    CharacteristicRepository,
    HierarchyRepository,
    SampleRepository,
    ViolationRepository,
)


@pytest_asyncio.fixture
async def hierarchy(async_session):
    """Create test hierarchy."""
    repo = HierarchyRepository(async_session)
    hierarchy = await repo.create(
        name="Test Factory", description="Integration test factory", parent_id=None
    )
    await async_session.commit()
    return hierarchy


@pytest_asyncio.fixture
async def characteristic_n1(async_session, hierarchy):
    """Create characteristic with subgroup_size=1."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Temperature",
        description="Process temperature",
        subgroup_size=1,
        target_value=100.0,
        ucl=106.0,
        lcl=94.0,
        provider_type=ProviderType.MANUAL,
    )
    async_session.add(char)

    # Enable all Nelson Rules
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


@pytest_asyncio.fixture
async def characteristic_n3(async_session, hierarchy):
    """Create characteristic with subgroup_size=3."""
    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Pressure",
        description="Process pressure",
        subgroup_size=3,
        target_value=50.0,
        ucl=55.0,
        lcl=45.0,
        provider_type=ProviderType.MANUAL,
    )
    async_session.add(char)

    # Enable all Nelson Rules
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        async_session.add(rule)

    await async_session.commit()
    await async_session.refresh(char)
    return char


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


class TestIndividualsChart:
    """Test SPC engine with individuals chart (n=1)."""

    @pytest.mark.asyncio
    async def test_process_single_measurement_in_control(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test processing a single measurement that is in control."""
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id,
            measurements=[100.5],
            context=SampleContext(batch_number="BATCH-001", operator_id="OPR-123"),
        )
        await async_session.commit()

        # Verify result
        assert result.sample_id > 0
        assert result.characteristic_id == characteristic_n1.id
        assert result.mean == 100.5
        assert result.range_value is None  # No range for n=1
        assert result.in_control is True
        assert len(result.violations) == 0
        assert result.processing_time_ms > 0

        # Verify sample was persisted
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.get_by_id(result.sample_id)
        assert sample is not None
        assert sample.char_id == characteristic_n1.id
        assert sample.batch_number == "BATCH-001"
        assert sample.operator_id == "OPR-123"
        assert len(sample.measurements) == 1
        assert sample.measurements[0].value == 100.5

    @pytest.mark.asyncio
    async def test_process_multiple_samples_in_control(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test processing multiple in-control samples."""
        values = [100.5, 99.5, 100.2, 99.8, 100.1]

        for i, value in enumerate(values):
            result = await spc_engine.process_sample(
                characteristic_id=characteristic_n1.id,
                measurements=[value],
                context=SampleContext(batch_number=f"BATCH-{i:03d}"),
            )
            await async_session.commit()

            assert result.in_control is True
            assert len(result.violations) == 0

        # Verify all samples were persisted
        sample_repo = SampleRepository(async_session)
        samples = await sample_repo.get_by_characteristic(characteristic_n1.id)
        assert len(samples) == 5

    @pytest.mark.asyncio
    async def test_rule1_outlier_beyond_ucl(self, async_session, spc_engine, characteristic_n1):
        """Test Rule 1 violation - point beyond UCL."""
        # Process outlier sample (beyond UCL of 106.0)
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[110.0]
        )
        await async_session.commit()

        # Verify violation
        assert result.in_control is False
        assert len(result.violations) == 1
        violation = result.violations[0]
        assert violation.rule_id == 1
        assert violation.rule_name == "Outlier"
        assert violation.severity == "CRITICAL"

        # Verify violation was persisted
        violation_repo = ViolationRepository(async_session)
        db_violations = await violation_repo.get_by_sample(result.sample_id)
        assert len(db_violations) == 1
        assert db_violations[0].rule_id == 1
        assert db_violations[0].acknowledged is False

    @pytest.mark.asyncio
    async def test_rule1_outlier_beyond_lcl(self, async_session, spc_engine, characteristic_n1):
        """Test Rule 1 violation - point beyond LCL."""
        # Process outlier sample (beyond LCL of 94.0)
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[90.0]
        )
        await async_session.commit()

        # Verify violation
        assert result.in_control is False
        assert len(result.violations) == 1
        violation = result.violations[0]
        assert violation.rule_id == 1
        assert violation.severity == "CRITICAL"

    @pytest.mark.asyncio
    async def test_rule2_shift_nine_points_above(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test Rule 2 violation - 9 consecutive points above center."""
        # Process 9 samples all above center line (100.0)
        for i in range(9):
            result = await spc_engine.process_sample(
                characteristic_id=characteristic_n1.id,
                measurements=[101.0 + i * 0.1],
            )
            await async_session.commit()

            if i < 8:
                # First 8 samples should be in control
                assert result.in_control is True
            else:
                # 9th sample triggers Rule 2
                assert result.in_control is False
                assert len(result.violations) == 1
                violation = result.violations[0]
                assert violation.rule_id == 2
                assert violation.rule_name == "Shift"
                assert violation.severity == "WARNING"
                assert len(violation.involved_sample_ids) == 9


class TestXbarRChart:
    """Test SPC engine with X-bar R chart (n>1)."""

    @pytest.mark.asyncio
    async def test_process_subgroup_in_control(self, async_session, spc_engine, characteristic_n3):
        """Test processing a subgroup that is in control."""
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n3.id,
            measurements=[49.8, 50.0, 50.2],
            context=SampleContext(batch_number="BATCH-001"),
        )
        await async_session.commit()

        # Verify result
        assert result.sample_id > 0
        assert result.mean == 50.0
        assert result.range_value == pytest.approx(0.4, rel=1e-9)
        assert result.in_control is True
        assert len(result.violations) == 0

        # Verify sample and measurements were persisted
        sample_repo = SampleRepository(async_session)
        sample = await sample_repo.get_by_id(result.sample_id)
        assert len(sample.measurements) == 3
        values = sorted([m.value for m in sample.measurements])
        assert values == [49.8, 50.0, 50.2]

    @pytest.mark.asyncio
    async def test_rule1_outlier_subgroup(self, async_session, spc_engine, characteristic_n3):
        """Test Rule 1 violation with subgroup mean beyond UCL."""
        # Process subgroup with mean above UCL (55.0)
        # Mean will be 56.0, which is beyond UCL
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n3.id,
            measurements=[55.8, 56.0, 56.2],
        )
        await async_session.commit()

        # Verify violation
        assert result.mean == 56.0
        assert result.range_value == pytest.approx(0.4, rel=1e-9)
        assert result.in_control is False
        assert len(result.violations) == 1
        assert result.violations[0].rule_id == 1

    @pytest.mark.asyncio
    async def test_multiple_subgroups_building_history(
        self, async_session, spc_engine, characteristic_n3
    ):
        """Test processing multiple subgroups to build history."""
        subgroups = [
            [49.8, 50.0, 50.2],
            [49.9, 50.1, 50.3],
            [49.7, 49.9, 50.1],
            [50.0, 50.2, 50.4],
            [49.8, 50.0, 50.2],
        ]

        for i, measurements in enumerate(subgroups):
            result = await spc_engine.process_sample(
                characteristic_id=characteristic_n3.id,
                measurements=measurements,
                context=SampleContext(batch_number=f"BATCH-{i:03d}"),
            )
            await async_session.commit()

            assert result.in_control is True

        # Verify all samples were persisted
        sample_repo = SampleRepository(async_session)
        samples = await sample_repo.get_by_characteristic(characteristic_n3.id)
        assert len(samples) == 5

        # Verify rolling window contains samples
        window = await spc_engine._window_manager.get_window(characteristic_n3.id)
        assert window.size == 5


class TestRuleConfiguration:
    """Test rule enable/disable configuration."""

    @pytest.mark.asyncio
    async def test_disabled_rule_not_triggered(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test that disabled rules are not triggered."""
        # Disable Rule 1
        char_repo = CharacteristicRepository(async_session)
        char = await char_repo.get_with_rules(characteristic_n1.id)
        for rule in char.rules:
            if rule.rule_id == 1:
                rule.is_enabled = False
        await async_session.commit()

        # Process outlier sample (would trigger Rule 1 if enabled)
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[110.0]
        )
        await async_session.commit()

        # Rule 1 should not be triggered
        assert result.in_control is True
        assert len(result.violations) == 0

    @pytest.mark.asyncio
    async def test_only_enabled_rules_checked(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test that only enabled rules are evaluated."""
        # Disable all rules except Rule 1
        char_repo = CharacteristicRepository(async_session)
        char = await char_repo.get_with_rules(characteristic_n1.id)
        for rule in char.rules:
            rule.is_enabled = rule.rule_id == 1
        await async_session.commit()

        # Create condition that would trigger Rule 2 (if it were enabled)
        for i in range(9):
            result = await spc_engine.process_sample(
                characteristic_id=characteristic_n1.id,
                measurements=[101.0],
            )
            await async_session.commit()

        # Rule 2 should not trigger because it's disabled
        assert result.in_control is True
        assert len(result.violations) == 0


class TestLimitRecalculation:
    """Test control limit recalculation."""

    @pytest.mark.asyncio
    async def test_recalculate_limits_from_history(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test recalculating control limits from historical data."""
        # Remove stored limits
        char_repo = CharacteristicRepository(async_session)
        char = await char_repo.get_by_id(characteristic_n1.id)
        char.ucl = None
        char.lcl = None
        await async_session.commit()

        # Process multiple samples to build history
        values = [100.0, 102.0, 101.0, 103.0, 100.0, 102.0, 101.0, 103.0]
        for value in values:
            await spc_engine.process_sample(
                characteristic_id=characteristic_n1.id, measurements=[value]
            )
            await async_session.commit()

        # Recalculate limits
        center_line, ucl, lcl = await spc_engine.recalculate_limits(characteristic_n1.id)

        # Verify limits were calculated
        assert center_line > 0
        assert ucl > center_line
        assert lcl < center_line

        # Update characteristic with new limits
        char.ucl = ucl
        char.lcl = lcl
        await async_session.commit()

        # Verify new limits are used
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[101.5]
        )
        assert result.in_control is True


class TestConcurrentProcessing:
    """Test processing samples for multiple characteristics concurrently."""

    @pytest.mark.asyncio
    async def test_multiple_characteristics_independent(
        self, async_session, spc_engine, characteristic_n1, characteristic_n3
    ):
        """Test that processing for different characteristics is independent."""
        # Process sample for characteristic 1
        result1 = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[100.5]
        )
        await async_session.commit()

        # Process sample for characteristic 2
        result2 = await spc_engine.process_sample(
            characteristic_id=characteristic_n3.id, measurements=[49.8, 50.0, 50.2]
        )
        await async_session.commit()

        # Verify both processed correctly
        assert result1.characteristic_id == characteristic_n1.id
        assert result2.characteristic_id == characteristic_n3.id
        assert result1.sample_id != result2.sample_id

        # Verify windows are separate
        window1 = await spc_engine._window_manager.get_window(characteristic_n1.id)
        window2 = await spc_engine._window_manager.get_window(characteristic_n3.id)
        assert window1.size == 1
        assert window2.size == 1


class TestValidation:
    """Test validation and error handling."""

    @pytest.mark.asyncio
    async def test_characteristic_not_found(self, async_session, spc_engine):
        """Test error when characteristic doesn't exist."""
        with pytest.raises(ValueError, match="Characteristic 99999 not found"):
            await spc_engine.process_sample(
                characteristic_id=99999, measurements=[100.0]
            )

    @pytest.mark.asyncio
    async def test_wrong_measurement_count(
        self, async_session, spc_engine, characteristic_n3
    ):
        """Test error when measurement count doesn't match subgroup size."""
        with pytest.raises(ValueError, match="Expected 3 measurements"):
            await spc_engine.process_sample(
                characteristic_id=characteristic_n3.id,
                measurements=[50.0, 50.1],  # Only 2 measurements
            )

    @pytest.mark.asyncio
    async def test_recalculate_limits_no_data(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test error when recalculating limits with no data."""
        # Remove stored limits
        char_repo = CharacteristicRepository(async_session)
        char = await char_repo.get_by_id(characteristic_n1.id)
        char.ucl = None
        char.lcl = None
        await async_session.commit()

        # Try to recalculate with no samples
        with pytest.raises(ValueError, match="No samples available"):
            await spc_engine.recalculate_limits(characteristic_n1.id)


class TestPerformance:
    """Test performance characteristics."""

    @pytest.mark.asyncio
    async def test_processing_time_tracked(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test that processing time is tracked."""
        result = await spc_engine.process_sample(
            characteristic_id=characteristic_n1.id, measurements=[100.5]
        )
        await async_session.commit()

        # Verify processing time was recorded
        assert result.processing_time_ms > 0
        # Should complete in reasonable time (< 1 second)
        assert result.processing_time_ms < 1000

    @pytest.mark.asyncio
    async def test_bulk_processing_performance(
        self, async_session, spc_engine, characteristic_n1
    ):
        """Test processing many samples in sequence."""
        import time

        start_time = time.perf_counter()

        # Process 100 samples
        for i in range(100):
            await spc_engine.process_sample(
                characteristic_id=characteristic_n1.id,
                measurements=[100.0 + i * 0.01],
            )
            await async_session.commit()

        end_time = time.perf_counter()
        total_time = end_time - start_time

        # Should process 100 samples in reasonable time (< 10 seconds)
        assert total_time < 10.0

        # Verify all samples were created
        sample_repo = SampleRepository(async_session)
        samples = await sample_repo.get_by_characteristic(characteristic_n1.id)
        assert len(samples) == 100
