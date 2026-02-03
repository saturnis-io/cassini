"""Unit tests for SPC Engine."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, Mock

from openspc.core.engine.nelson_rules import (
    NelsonRuleLibrary,
    Rule1Outlier,
    Rule2Shift,
    RuleResult,
    Severity,
)
from openspc.core.engine.rolling_window import (
    RollingWindow,
    RollingWindowManager,
    WindowSample,
    Zone,
    ZoneBoundaries,
)
from openspc.core.engine.spc_engine import (
    ProcessingResult,
    SampleContext,
    SPCEngine,
    ViolationInfo,
)
from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.violation import Violation


@pytest.fixture
def mock_sample_repo():
    """Mock sample repository."""
    repo = AsyncMock()
    repo.session = AsyncMock()
    return repo


@pytest.fixture
def mock_char_repo():
    """Mock characteristic repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def mock_violation_repo():
    """Mock violation repository."""
    repo = AsyncMock()
    return repo


@pytest.fixture
def mock_window_manager():
    """Mock rolling window manager."""
    manager = AsyncMock()
    return manager


@pytest.fixture
def rule_library():
    """Real Nelson Rule Library."""
    return NelsonRuleLibrary()


@pytest.fixture
def spc_engine(
    mock_sample_repo, mock_char_repo, mock_violation_repo, mock_window_manager, rule_library
):
    """Create SPC engine with mocked dependencies."""
    from openspc.core.events import EventBus

    # Create a test event bus
    event_bus = EventBus()

    return SPCEngine(
        sample_repo=mock_sample_repo,
        char_repo=mock_char_repo,
        violation_repo=mock_violation_repo,
        window_manager=mock_window_manager,
        rule_library=rule_library,
        event_bus=event_bus,
    )


@pytest.fixture
def characteristic_with_rules():
    """Create a characteristic with all rules enabled."""
    char = Characteristic(
        id=1,
        hierarchy_id=1,
        name="Test Characteristic",
        subgroup_size=3,
        ucl=106.0,
        lcl=94.0,
        provider_type="MANUAL",
    )
    char.rules = [
        CharacteristicRule(char_id=1, rule_id=i, is_enabled=True) for i in range(1, 9)
    ]
    return char


@pytest.fixture
def sample_with_measurements():
    """Create a sample with measurements."""
    sample = Sample(
        id=1,
        char_id=1,
        timestamp=datetime.utcnow(),
        batch_number="BATCH-001",
        operator_id="OPR-123",
        is_excluded=False,
    )
    sample.measurements = [
        Measurement(id=1, sample_id=1, value=10.1),
        Measurement(id=2, sample_id=1, value=10.2),
        Measurement(id=3, sample_id=1, value=10.0),
    ]
    return sample


class TestSampleProcessing:
    """Test successful sample processing."""

    @pytest.mark.asyncio
    async def test_process_sample_success_no_violations(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
        sample_with_measurements,
    ):
        """Test processing a sample that doesn't trigger any violations."""
        # Setup mocks
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules
        mock_sample_repo.create_with_measurements.return_value = sample_with_measurements

        # Create window sample with zone C (in control)
        window_sample = WindowSample(
            sample_id=1,
            timestamp=datetime.utcnow(),
            value=10.1,
            range_value=0.2,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
        )
        mock_window_manager.add_sample.return_value = window_sample

        # Create rolling window with no violations
        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)
        window.append(window_sample)
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1,
            measurements=[10.1, 10.2, 10.0],
            context=SampleContext(batch_number="BATCH-001", operator_id="OPR-123"),
        )

        # Assertions
        assert isinstance(result, ProcessingResult)
        assert result.sample_id == 1
        assert result.characteristic_id == 1
        assert result.mean == pytest.approx(10.1, rel=1e-9)
        assert result.range_value == pytest.approx(0.2, rel=1e-9)
        assert result.zone == "zone_c_upper"
        assert result.sigma_distance == pytest.approx(0.5, rel=1e-9)
        assert result.is_above_center is True
        assert result.in_control is True
        assert len(result.violations) == 0
        assert result.processing_time_ms > 0

        # Verify repository calls
        mock_char_repo.get_with_rules.assert_called_once_with(1)
        mock_sample_repo.create_with_measurements.assert_called_once()
        mock_window_manager.add_sample.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_sample_with_rule1_violation(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
        sample_with_measurements,
    ):
        """Test processing a sample that triggers Rule 1 (outlier)."""
        # Setup mocks
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules
        mock_sample_repo.create_with_measurements.return_value = sample_with_measurements

        # Create window sample beyond UCL (Rule 1 violation)
        window_sample = WindowSample(
            sample_id=1,
            timestamp=datetime.utcnow(),
            value=110.0,
            range_value=0.2,
            zone=Zone.BEYOND_UCL,
            is_above_center=True,
            sigma_distance=5.0,
        )
        mock_window_manager.add_sample.return_value = window_sample

        # Create rolling window with violation
        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)
        window.append(window_sample)
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1, measurements=[10.1, 10.2, 10.0]
        )

        # Assertions
        assert result.in_control is False
        assert len(result.violations) == 1
        violation = result.violations[0]
        assert violation.rule_id == 1
        assert violation.rule_name == "Outlier"
        assert violation.severity == "CRITICAL"
        assert 1 in violation.involved_sample_ids

        # Verify violation was created in database
        mock_sample_repo.session.add.assert_called()
        mock_sample_repo.session.flush.assert_called()

    @pytest.mark.asyncio
    async def test_process_sample_with_rule2_violation(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
        sample_with_measurements,
    ):
        """Test processing a sample that triggers Rule 2 (shift)."""
        # Setup mocks
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules
        mock_sample_repo.create_with_measurements.return_value = sample_with_measurements

        # Create window with 9 consecutive points above center (Rule 2)
        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)

        # Add 8 samples above center
        for i in range(8):
            window.append(
                WindowSample(
                    sample_id=i,
                    timestamp=datetime.utcnow(),
                    value=101.0,
                    range_value=None,
                    zone=Zone.ZONE_C_UPPER,
                    is_above_center=True,
                    sigma_distance=0.5,
                )
            )

        # Add 9th sample (triggers Rule 2)
        window_sample = WindowSample(
            sample_id=9,
            timestamp=datetime.utcnow(),
            value=101.0,
            range_value=0.2,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
        )
        window.append(window_sample)

        mock_window_manager.add_sample.return_value = window_sample
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1, measurements=[10.1, 10.2, 10.0]
        )

        # Assertions
        assert result.in_control is False
        assert len(result.violations) == 1
        violation = result.violations[0]
        assert violation.rule_id == 2
        assert violation.rule_name == "Shift"
        assert violation.severity == "WARNING"
        assert len(violation.involved_sample_ids) == 9

    @pytest.mark.asyncio
    async def test_process_sample_with_subgroup_size_1(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
    ):
        """Test processing individual samples (n=1)."""
        # Setup characteristic with subgroup_size=1
        characteristic_with_rules.subgroup_size = 1
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules

        # Create sample with single measurement
        sample = Sample(id=1, char_id=1, timestamp=datetime.utcnow())
        sample.measurements = [Measurement(id=1, sample_id=1, value=10.5)]
        mock_sample_repo.create_with_measurements.return_value = sample

        # Create window sample
        window_sample = WindowSample(
            sample_id=1,
            timestamp=datetime.utcnow(),
            value=10.5,
            range_value=None,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.25,
        )
        mock_window_manager.add_sample.return_value = window_sample

        # Create rolling window
        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)
        window.append(window_sample)
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1, measurements=[10.5]
        )

        # Assertions
        assert result.mean == 10.5
        assert result.range_value is None  # No range for n=1


class TestValidation:
    """Test validation error cases."""

    @pytest.mark.asyncio
    async def test_characteristic_not_found(self, spc_engine, mock_char_repo):
        """Test error when characteristic doesn't exist."""
        mock_char_repo.get_with_rules.return_value = None

        with pytest.raises(ValueError, match="Characteristic 999 not found"):
            await spc_engine.process_sample(characteristic_id=999, measurements=[10.0])

    @pytest.mark.asyncio
    async def test_wrong_measurement_count(
        self, spc_engine, mock_char_repo, characteristic_with_rules
    ):
        """Test error when measurement count doesn't match subgroup size."""
        characteristic_with_rules.subgroup_size = 3
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules

        with pytest.raises(ValueError, match="Expected 3 measurements"):
            await spc_engine.process_sample(characteristic_id=1, measurements=[10.0, 10.1])


class TestRuleEvaluation:
    """Test rule evaluation logic."""

    @pytest.mark.asyncio
    async def test_only_enabled_rules_evaluated(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
        sample_with_measurements,
    ):
        """Test that only enabled rules are evaluated."""
        # Disable Rule 2
        characteristic_with_rules.rules[1].is_enabled = False
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules
        mock_sample_repo.create_with_measurements.return_value = sample_with_measurements

        # Create window that would trigger Rule 2 (but it's disabled)
        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)

        # Add 9 samples above center
        for i in range(9):
            window.append(
                WindowSample(
                    sample_id=i,
                    timestamp=datetime.utcnow(),
                    value=101.0,
                    range_value=None,
                    zone=Zone.ZONE_C_UPPER,
                    is_above_center=True,
                    sigma_distance=0.5,
                )
            )

        window_sample = window.get_samples()[-1]
        mock_window_manager.add_sample.return_value = window_sample
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1, measurements=[10.1, 10.2, 10.0]
        )

        # Rule 2 should not be triggered because it's disabled
        assert result.in_control is True
        assert len(result.violations) == 0


class TestZoneBoundaries:
    """Test zone boundary calculation."""

    @pytest.mark.asyncio
    async def test_use_stored_control_limits(
        self,
        spc_engine,
        mock_char_repo,
        characteristic_with_rules,
    ):
        """Test using stored UCL/LCL for zone boundaries."""
        characteristic_with_rules.ucl = 106.0
        characteristic_with_rules.lcl = 94.0
        mock_char_repo.get_by_id.return_value = characteristic_with_rules

        boundaries = await spc_engine._get_zone_boundaries(1, characteristic_with_rules)

        assert boundaries.center_line == 100.0
        assert boundaries.sigma == pytest.approx(2.0, rel=1e-9)
        assert boundaries.plus_3_sigma == 106.0
        assert boundaries.minus_3_sigma == 94.0

    @pytest.mark.asyncio
    async def test_calculate_limits_from_historical_data(
        self, spc_engine, mock_char_repo, mock_sample_repo, characteristic_with_rules
    ):
        """Test calculating limits from historical data when not stored."""
        # Remove stored limits
        characteristic_with_rules.ucl = None
        characteristic_with_rules.lcl = None
        characteristic_with_rules.subgroup_size = 1
        mock_char_repo.get_by_id.return_value = characteristic_with_rules

        # Create historical samples
        samples = []
        for i in range(10):
            sample = Sample(id=i, char_id=1, timestamp=datetime.utcnow())
            sample.measurements = [Measurement(id=i, sample_id=i, value=100.0 + i)]
            samples.append(sample)

        mock_sample_repo.get_rolling_window.return_value = samples

        boundaries = await spc_engine._get_zone_boundaries(1, characteristic_with_rules)

        # Verify boundaries were calculated
        assert boundaries.center_line > 0
        assert boundaries.sigma > 0
        assert boundaries.plus_3_sigma > boundaries.center_line


class TestRecalculateLimits:
    """Test control limit recalculation."""

    @pytest.mark.asyncio
    async def test_recalculate_limits_individuals(
        self, spc_engine, mock_char_repo, mock_sample_repo
    ):
        """Test recalculating limits for individuals chart (n=1)."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test",
            subgroup_size=1,
            provider_type="MANUAL",
        )
        mock_char_repo.get_by_id.return_value = char

        # Create historical samples
        samples = []
        values = [10.0, 12.0, 11.0, 13.0, 10.0, 12.0, 11.0, 13.0]
        for i, val in enumerate(values):
            sample = Sample(id=i, char_id=1, timestamp=datetime.utcnow())
            sample.measurements = [Measurement(id=i, sample_id=i, value=val)]
            samples.append(sample)

        mock_sample_repo.get_rolling_window.return_value = samples

        center_line, ucl, lcl = await spc_engine.recalculate_limits(1)

        assert center_line > 0
        assert ucl > center_line
        assert lcl < center_line

    @pytest.mark.asyncio
    async def test_recalculate_limits_subgroups(
        self, spc_engine, mock_char_repo, mock_sample_repo
    ):
        """Test recalculating limits for X-bar R chart (n>1)."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test",
            subgroup_size=3,
            provider_type="MANUAL",
        )
        mock_char_repo.get_by_id.return_value = char

        # Create historical samples with subgroups
        samples = []
        for i in range(10):
            sample = Sample(id=i, char_id=1, timestamp=datetime.utcnow())
            sample.measurements = [
                Measurement(id=i * 3 + 0, sample_id=i, value=10.0 + i * 0.1),
                Measurement(id=i * 3 + 1, sample_id=i, value=10.1 + i * 0.1),
                Measurement(id=i * 3 + 2, sample_id=i, value=10.2 + i * 0.1),
            ]
            samples.append(sample)

        mock_sample_repo.get_rolling_window.return_value = samples

        center_line, ucl, lcl = await spc_engine.recalculate_limits(1)

        assert center_line > 0
        assert ucl > center_line
        assert lcl < center_line

    @pytest.mark.asyncio
    async def test_recalculate_limits_insufficient_data(
        self, spc_engine, mock_char_repo, mock_sample_repo
    ):
        """Test error when insufficient data for limit calculation."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test",
            subgroup_size=1,
            provider_type="MANUAL",
        )
        mock_char_repo.get_by_id.return_value = char
        mock_sample_repo.get_rolling_window.return_value = []

        with pytest.raises(ValueError, match="No samples available"):
            await spc_engine.recalculate_limits(1)


class TestPerformance:
    """Test performance tracking."""

    @pytest.mark.asyncio
    async def test_processing_time_recorded(
        self,
        spc_engine,
        mock_sample_repo,
        mock_char_repo,
        mock_window_manager,
        characteristic_with_rules,
        sample_with_measurements,
    ):
        """Test that processing time is recorded."""
        # Setup mocks
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules
        mock_sample_repo.create_with_measurements.return_value = sample_with_measurements

        window_sample = WindowSample(
            sample_id=1,
            timestamp=datetime.utcnow(),
            value=10.1,
            range_value=0.2,
            zone=Zone.ZONE_C_UPPER,
            is_above_center=True,
            sigma_distance=0.5,
        )
        mock_window_manager.add_sample.return_value = window_sample

        window = RollingWindow(max_size=25)
        boundaries = ZoneBoundaries(
            center_line=100.0,
            sigma=2.0,
            plus_1_sigma=102.0,
            plus_2_sigma=104.0,
            plus_3_sigma=106.0,
            minus_1_sigma=98.0,
            minus_2_sigma=96.0,
            minus_3_sigma=94.0,
        )
        window.set_boundaries(boundaries)
        window.append(window_sample)
        mock_window_manager.get_window.return_value = window

        # Process sample
        result = await spc_engine.process_sample(
            characteristic_id=1, measurements=[10.1, 10.2, 10.0]
        )

        # Verify processing time was recorded and is reasonable
        assert result.processing_time_ms > 0
        assert result.processing_time_ms < 10000  # Should be under 10 seconds
