"""Unit tests for SPC Engine."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, Mock

from cassini.core.engine.nelson_rules import (
    NelsonRuleLibrary,
    Rule1Outlier,
    Rule2Shift,
    RuleResult,
    Severity,
)
from cassini.core.engine.rolling_window import (
    RollingWindow,
    RollingWindowManager,
    WindowSample,
    Zone,
    ZoneBoundaries,
)
from cassini.core.engine.spc_engine import (
    ProcessingResult,
    SampleContext,
    SPCEngine,
    ViolationInfo,
)
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.sample import Measurement, Sample


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
    # session.add() is synchronous on real AsyncSession; use MagicMock to
    # avoid "coroutine was never awaited" warnings in batch violation path.
    repo.session = MagicMock()
    repo.session.flush = AsyncMock()
    return repo


@pytest.fixture
def mock_window_manager():
    """Mock rolling window manager."""
    manager = AsyncMock()
    # get_cached_limits, put_cached_limits, and increment_limit_counter are
    # synchronous methods; configure them as regular Mocks so they don't
    # return coroutines.
    manager.get_cached_limits = MagicMock(return_value=None)
    manager.put_cached_limits = MagicMock()
    manager.increment_limit_counter = MagicMock()
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
    from cassini.core.events import EventBus

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

        # Verify violations were batch-persisted via session (not repo.create)
        spc_engine._violation_repo.session.add.assert_called()
        spc_engine._violation_repo.session.flush.assert_called()

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
    async def test_too_many_measurements_rejected(
        self, spc_engine, mock_char_repo, characteristic_with_rules
    ):
        """Test error when measurement count exceeds subgroup size (NOMINAL_TOLERANCE mode)."""
        characteristic_with_rules.subgroup_size = 3
        characteristic_with_rules.subgroup_mode = "NOMINAL_TOLERANCE"
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules

        with pytest.raises(ValueError, match="Too many measurements"):
            await spc_engine.process_sample(
                characteristic_id=1, measurements=[10.0, 10.1, 10.2, 10.3]
            )

    @pytest.mark.asyncio
    async def test_insufficient_measurements_rejected(
        self, spc_engine, mock_char_repo, characteristic_with_rules
    ):
        """Test error when measurement count is below min_measurements."""
        characteristic_with_rules.subgroup_size = 3
        characteristic_with_rules.min_measurements = 2
        mock_char_repo.get_with_rules.return_value = characteristic_with_rules

        with pytest.raises(ValueError, match="Insufficient measurements"):
            await spc_engine.process_sample(characteristic_id=1, measurements=[10.0])


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
        boundaries = await spc_engine._get_zone_boundaries_with_values(
            characteristic_id=1, ucl=106.0, lcl=94.0
        )

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
        characteristic_with_rules.subgroup_size = 1
        mock_char_repo.get_by_id.return_value = characteristic_with_rules

        # Create historical sample data as dicts (matching get_rolling_window_data format)
        sample_data = [
            {"values": [100.0 + i]} for i in range(10)
        ]

        mock_sample_repo.get_rolling_window_data.return_value = sample_data

        boundaries = await spc_engine._get_zone_boundaries_with_values(
            characteristic_id=1, ucl=None, lcl=None
        )

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
        )
        mock_char_repo.get_by_id.return_value = char

        # Create historical sample data as dicts (matching get_rolling_window_data format)
        values = [10.0, 12.0, 11.0, 13.0, 10.0, 12.0, 11.0, 13.0]
        sample_data = [{"values": [v]} for v in values]

        mock_sample_repo.get_rolling_window_data.return_value = sample_data

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
        )
        mock_char_repo.get_by_id.return_value = char

        # Create historical sample data as dicts (matching get_rolling_window_data format)
        sample_data = [
            {"values": [10.0 + i * 0.1, 10.1 + i * 0.1, 10.2 + i * 0.1]}
            for i in range(10)
        ]

        mock_sample_repo.get_rolling_window_data.return_value = sample_data

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
        )
        mock_char_repo.get_by_id.return_value = char
        mock_sample_repo.get_rolling_window_data.return_value = []

        with pytest.raises(ValueError, match="No samples available"):
            await spc_engine.recalculate_limits(1)


class TestSubgroupModeValidation:
    """Test subgroup mode validation logic."""

    @pytest.fixture
    def characteristic_mode_c(self):
        """Characteristic with NOMINAL_TOLERANCE mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode C",
            subgroup_size=5,
            min_measurements=2,
            warn_below_count=4,
            subgroup_mode="NOMINAL_TOLERANCE",
            ucl=106.0,
            lcl=94.0,

        )
        char.rules = []
        return char

    @pytest.fixture
    def characteristic_mode_a(self):
        """Characteristic with STANDARDIZED mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode A",
            subgroup_size=5,
            min_measurements=2,
            warn_below_count=4,
            subgroup_mode="STANDARDIZED",
            stored_sigma=2.0,
            stored_center_line=100.0,
            ucl=106.0,
            lcl=94.0,

        )
        char.rules = []
        return char

    @pytest.fixture
    def characteristic_mode_b(self):
        """Characteristic with VARIABLE_LIMITS mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode B",
            subgroup_size=5,
            min_measurements=2,
            warn_below_count=4,
            subgroup_mode="VARIABLE_LIMITS",
            stored_sigma=2.0,
            stored_center_line=100.0,
            ucl=106.0,
            lcl=94.0,

        )
        char.rules = []
        return char

    def test_mode_c_accepts_exact_subgroup_size(self, spc_engine, characteristic_mode_c):
        """Test Mode C accepts exact subgroup size measurements."""
        is_valid, is_undersized = spc_engine._validate_measurements(
            characteristic_mode_c, [1.0, 2.0, 3.0, 4.0, 5.0]
        )
        assert is_valid is True
        assert is_undersized is False

    def test_mode_c_rejects_measurements_exceeding_subgroup_size(self, spc_engine, characteristic_mode_c):
        """Test Mode C rejects measurements exceeding subgroup_size."""
        with pytest.raises(ValueError, match="Too many measurements"):
            spc_engine._validate_measurements(
                characteristic_mode_c, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
            )

    def test_mode_c_accepts_undersized_above_min_measurements(self, spc_engine, characteristic_mode_c):
        """Test Mode C accepts samples above min_measurements but below warn threshold."""
        is_valid, is_undersized = spc_engine._validate_measurements(
            characteristic_mode_c, [1.0, 2.0, 3.0]  # 3 measurements, min=2, warn=4
        )
        assert is_valid is True
        assert is_undersized is True

    def test_mode_c_rejects_below_min_measurements(self, spc_engine, characteristic_mode_c):
        """Test Mode C rejects samples below min_measurements."""
        with pytest.raises(ValueError, match="Insufficient measurements"):
            spc_engine._validate_measurements(
                characteristic_mode_c, [1.0]  # 1 measurement, min=2
            )

    def test_mode_a_requires_stored_sigma(self, spc_engine, characteristic_mode_a):
        """Test Mode A requires stored_sigma for statistics computation."""
        char = characteristic_mode_a
        char.stored_sigma = None

        with pytest.raises(ValueError, match="STANDARDIZED mode requires stored_sigma"):
            spc_engine._compute_sample_statistics(char, [1.0, 2.0, 3.0], 3)

    def test_mode_b_requires_stored_sigma(self, spc_engine, characteristic_mode_b):
        """Test Mode B requires stored_sigma for statistics computation."""
        char = characteristic_mode_b
        char.stored_sigma = None

        with pytest.raises(ValueError, match="VARIABLE_LIMITS mode requires stored_sigma"):
            spc_engine._compute_sample_statistics(char, [1.0, 2.0, 3.0], 3)


class TestModeSpecificComputation:
    """Test mode-specific statistics computation."""

    @pytest.fixture
    def characteristic_mode_a(self):
        """Characteristic with STANDARDIZED mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode A",
            subgroup_size=5,
            min_measurements=1,
            subgroup_mode="STANDARDIZED",
            stored_sigma=10.0,
            stored_center_line=100.0,
            ucl=115.0,
            lcl=85.0,

        )
        return char

    @pytest.fixture
    def characteristic_mode_b(self):
        """Characteristic with VARIABLE_LIMITS mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode B",
            subgroup_size=5,
            min_measurements=1,
            subgroup_mode="VARIABLE_LIMITS",
            stored_sigma=10.0,
            stored_center_line=100.0,
            ucl=115.0,
            lcl=85.0,

        )
        return char

    @pytest.fixture
    def characteristic_mode_c(self):
        """Characteristic with NOMINAL_TOLERANCE mode."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test Mode C",
            subgroup_size=5,
            min_measurements=1,
            subgroup_mode="NOMINAL_TOLERANCE",
            ucl=115.0,
            lcl=85.0,

        )
        return char

    def test_mode_a_computes_z_score(self, spc_engine, characteristic_mode_a):
        """Test Mode A computes correct z-score.

        Given: mean=105, stored_center_line=100, stored_sigma=10, actual_n=4
        Expected: z_score = (105-100) / (10/sqrt(4)) = 5/5 = 1.0
        """
        measurements = [104.0, 105.0, 106.0, 105.0]  # mean = 105
        stats = spc_engine._compute_sample_statistics(
            characteristic_mode_a, measurements, actual_n=4
        )

        assert stats["mean"] == pytest.approx(105.0)
        assert stats["z_score"] == pytest.approx(1.0)
        assert stats["effective_ucl"] is None
        assert stats["effective_lcl"] is None

    def test_mode_b_computes_effective_limits(self, spc_engine, characteristic_mode_b):
        """Test Mode B computes correct effective limits.

        Given: stored_center_line=100, stored_sigma=10, actual_n=4
        Expected: sigma_xbar = 10/sqrt(4) = 5
        Expected: effective_ucl = 100 + 3*5 = 115
        Expected: effective_lcl = 100 - 3*5 = 85
        """
        measurements = [100.0, 101.0, 99.0, 100.0]  # mean = 100
        stats = spc_engine._compute_sample_statistics(
            characteristic_mode_b, measurements, actual_n=4
        )

        assert stats["mean"] == pytest.approx(100.0)
        assert stats["effective_ucl"] == pytest.approx(115.0)
        assert stats["effective_lcl"] == pytest.approx(85.0)
        assert stats["z_score"] is None

    def test_mode_c_uses_nominal_limits(self, spc_engine, characteristic_mode_c):
        """Test Mode C doesn't compute z_score or effective limits."""
        measurements = [100.0, 101.0, 99.0, 100.0, 100.0]
        stats = spc_engine._compute_sample_statistics(
            characteristic_mode_c, measurements, actual_n=5
        )

        assert stats["mean"] == pytest.approx(100.0)
        assert stats["z_score"] is None
        assert stats["effective_ucl"] is None
        assert stats["effective_lcl"] is None


class TestUndersizedFlagging:
    """Test undersized sample flagging logic."""

    @pytest.fixture
    def characteristic_with_warn_threshold(self):
        """Characteristic with warn_below_count set."""
        char = Characteristic(
            id=1,
            hierarchy_id=1,
            name="Test",
            subgroup_size=5,
            min_measurements=2,
            warn_below_count=4,
            subgroup_mode="NOMINAL_TOLERANCE",
            ucl=106.0,
            lcl=94.0,

        )
        return char

    def test_sample_flagged_as_undersized(self, spc_engine, characteristic_with_warn_threshold):
        """Test sample is flagged as undersized when below warn threshold."""
        # 3 measurements, warn_below_count=4 -> undersized
        is_valid, is_undersized = spc_engine._validate_measurements(
            characteristic_with_warn_threshold, [1.0, 2.0, 3.0]
        )
        assert is_undersized is True

    def test_sample_not_flagged_when_at_threshold(self, spc_engine, characteristic_with_warn_threshold):
        """Test sample is not flagged when at or above warn threshold."""
        # 4 measurements, warn_below_count=4 -> not undersized
        is_valid, is_undersized = spc_engine._validate_measurements(
            characteristic_with_warn_threshold, [1.0, 2.0, 3.0, 4.0]
        )
        assert is_undersized is False

        # 5 measurements, warn_below_count=4 -> not undersized
        is_valid, is_undersized = spc_engine._validate_measurements(
            characteristic_with_warn_threshold, [1.0, 2.0, 3.0, 4.0, 5.0]
        )
        assert is_undersized is False


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


class TestViolationInfo:
    def test_violation_info_has_violation_id(self):
        """ViolationInfo must include violation_id field."""
        vi = ViolationInfo(
            violation_id=42,
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            message="Beyond 3σ",
            involved_sample_ids=[10],
        )
        assert vi.violation_id == 42

    def test_violation_info_violation_id_default_none(self):
        """violation_id defaults to None for backward compatibility."""
        vi = ViolationInfo(
            rule_id=1,
            rule_name="Outlier",
            severity="CRITICAL",
            message="Beyond 3σ",
            involved_sample_ids=[10],
        )
        assert vi.violation_id is None


class TestControlLimitCacheIntegration:
    """Tests that SPCEngine uses cached limits to avoid recomputation."""

    @pytest.mark.asyncio
    async def test_zone_boundaries_uses_cache_on_second_call(self):
        """Second call to _get_zone_boundaries_with_values uses cache."""
        from cassini.core.engine.rolling_window import CachedLimits, RollingWindowManager
        import time

        manager = RollingWindowManager()
        # Pre-populate the limit cache
        limits = CachedLimits(
            center_line=100.0, ucl=106.0, lcl=94.0, sigma=2.0,
            samples_since_compute=0, computed_at=time.monotonic(),
        )
        manager.put_cached_limits(char_id=42, material_id=None, limits=limits)

        # Create engine with this manager
        engine = SPCEngine(
            sample_repo=AsyncMock(),
            char_repo=AsyncMock(),
            violation_repo=AsyncMock(),
            window_manager=manager,
            rule_library=MagicMock(),
        )

        # Call zone boundaries with NULL ucl/lcl — should use cache
        boundaries = await engine._get_zone_boundaries_with_values(
            characteristic_id=42, ucl=None, lcl=None,
        )
        assert boundaries.center_line == 100.0
        assert abs(boundaries.plus_3_sigma - 106.0) < 0.01
        assert abs(boundaries.minus_3_sigma - 94.0) < 0.01

    @pytest.mark.asyncio
    async def test_zone_boundaries_falls_through_on_stale_cache(self):
        """When cache is stale, falls through to recalculate_limits."""
        from cassini.core.engine.rolling_window import CachedLimits, RollingWindowManager
        import time

        manager = RollingWindowManager()
        # Pre-populate with stale entry (count exceeded)
        limits = CachedLimits(
            center_line=100.0, ucl=106.0, lcl=94.0, sigma=2.0,
            samples_since_compute=25,  # at threshold = stale
            computed_at=time.monotonic(),
        )
        manager.put_cached_limits(char_id=42, material_id=None, limits=limits)

        engine = SPCEngine(
            sample_repo=AsyncMock(),
            char_repo=AsyncMock(),
            violation_repo=AsyncMock(),
            window_manager=manager,
            rule_library=MagicMock(),
        )

        # Mock recalculate_limits to return known values
        engine.recalculate_limits = AsyncMock(return_value=(200.0, 212.0, 188.0))

        boundaries = await engine._get_zone_boundaries_with_values(
            characteristic_id=42, ucl=None, lcl=None,
        )
        # Should have used recalculate_limits values, not cached
        assert boundaries.center_line == 200.0
        engine.recalculate_limits.assert_called_once()


class TestBatchViolationCreation:
    """Tests for batch violation persistence optimization."""

    @pytest.mark.asyncio
    async def test_create_violations_batch_returns_ids(self, spc_engine, mock_violation_repo):
        """Batch violation creation returns ViolationInfo with real violation_ids."""
        rule_results = [
            RuleResult(
                rule_id=1, rule_name="Outlier", triggered=True,
                severity=Severity.CRITICAL, message="Beyond 3\u03c3",
                involved_sample_ids=[10],
            ),
            RuleResult(
                rule_id=5, rule_name="Trend", triggered=True,
                severity=Severity.WARNING, message="6 trending",
                involved_sample_ids=[5, 6, 7, 8, 9, 10],
            ),
        ]

        # Mock the session to assign IDs on flush
        mock_session = AsyncMock()
        violation_id_counter = [100]
        added_objects: list = []

        def fake_add(obj):
            added_objects.append(obj)

        async def fake_flush():
            # Simulate DB assigning IDs
            for obj in added_objects:
                if hasattr(obj, "id") and obj.id is None:
                    obj.id = violation_id_counter[0]
                    violation_id_counter[0] += 1

        mock_session.add = fake_add
        mock_session.flush = fake_flush
        mock_violation_repo.session = mock_session

        violations, dicts = await spc_engine._create_violations(
            sample_id=1,
            rule_results=rule_results,
            rule_require_ack={1: True, 5: False},
            characteristic_id=1,
        )

        assert len(violations) == 2
        assert all(v.violation_id is not None for v in violations)
        assert violations[0].violation_id == 100
        assert violations[1].violation_id == 101
        # Verify dicts also have correct IDs
        assert dicts[0]["id"] == 100
        assert dicts[1]["id"] == 101

    @pytest.mark.asyncio
    async def test_create_violations_empty_rules_no_flush(self, spc_engine, mock_violation_repo):
        """When no rules trigger, no flush should occur."""
        rule_results = [
            RuleResult(
                rule_id=1, rule_name="Outlier", triggered=False,
                severity=Severity.CRITICAL, message="",
                involved_sample_ids=[],
            ),
        ]
        mock_session = AsyncMock()
        mock_violation_repo.session = mock_session

        violations, dicts = await spc_engine._create_violations(
            sample_id=1,
            rule_results=rule_results,
            rule_require_ack={},
            characteristic_id=1,
        )

        assert violations == []
        assert dicts == []
        mock_session.flush.assert_not_called()
        mock_session.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_create_violations_includes_violation_id_in_info(
        self, spc_engine, mock_violation_repo
    ):
        """ViolationInfo objects include violation_id after batch flush."""
        rule_results = [
            RuleResult(
                rule_id=1, rule_name="Outlier", triggered=True,
                severity=Severity.CRITICAL, message="Test",
                involved_sample_ids=[10],
            ),
        ]

        mock_session = AsyncMock()
        added_objects: list = []

        def fake_add(obj):
            added_objects.append(obj)

        async def fake_flush():
            for i, obj in enumerate(added_objects):
                if hasattr(obj, "id") and obj.id is None:
                    obj.id = 500 + i

        mock_session.add = fake_add
        mock_session.flush = fake_flush
        mock_violation_repo.session = mock_session

        violations, _ = await spc_engine._create_violations(
            sample_id=1,
            rule_results=rule_results,
            rule_require_ack={1: True},
            characteristic_id=1,
        )

        assert violations[0].violation_id == 500

    @pytest.mark.asyncio
    async def test_create_violations_single_flush_for_multiple_rules(
        self, spc_engine, mock_violation_repo
    ):
        """Multiple triggered rules result in exactly one flush call."""
        rule_results = [
            RuleResult(
                rule_id=1, rule_name="Outlier", triggered=True,
                severity=Severity.CRITICAL, message="Beyond 3\u03c3",
                involved_sample_ids=[10],
            ),
            RuleResult(
                rule_id=2, rule_name="Shift", triggered=True,
                severity=Severity.WARNING, message="9 same side",
                involved_sample_ids=[2, 3, 4, 5, 6, 7, 8, 9, 10],
            ),
            RuleResult(
                rule_id=3, rule_name="Trend", triggered=False,
                severity=Severity.WARNING, message="",
                involved_sample_ids=[],
            ),
        ]

        flush_count = [0]
        added_objects: list = []

        def fake_add(obj):
            added_objects.append(obj)

        async def fake_flush():
            flush_count[0] += 1
            for obj in added_objects:
                if hasattr(obj, "id") and obj.id is None:
                    obj.id = 200 + len([o for o in added_objects if o.id is not None])

        mock_session = AsyncMock()
        mock_session.add = fake_add
        mock_session.flush = fake_flush
        mock_violation_repo.session = mock_session

        violations, dicts = await spc_engine._create_violations(
            sample_id=1,
            rule_results=rule_results,
            rule_require_ack={},
            characteristic_id=1,
        )

        # 2 triggered rules, but only 1 flush
        assert len(violations) == 2
        assert flush_count[0] == 1

    @pytest.mark.asyncio
    async def test_create_violations_respects_require_ack(
        self, spc_engine, mock_violation_repo
    ):
        """Batch creation correctly passes requires_acknowledgement per rule."""
        rule_results = [
            RuleResult(
                rule_id=1, rule_name="Outlier", triggered=True,
                severity=Severity.CRITICAL, message="Beyond 3\u03c3",
                involved_sample_ids=[10],
            ),
            RuleResult(
                rule_id=5, rule_name="Trend", triggered=True,
                severity=Severity.WARNING, message="6 trending",
                involved_sample_ids=[5, 6, 7, 8, 9, 10],
            ),
        ]

        added_objects: list = []

        def fake_add(obj):
            added_objects.append(obj)

        async def fake_flush():
            for i, obj in enumerate(added_objects):
                if hasattr(obj, "id") and obj.id is None:
                    obj.id = 300 + i

        mock_session = AsyncMock()
        mock_session.add = fake_add
        mock_session.flush = fake_flush
        mock_violation_repo.session = mock_session

        await spc_engine._create_violations(
            sample_id=1,
            rule_results=rule_results,
            rule_require_ack={1: True, 5: False},
            characteristic_id=1,
        )

        # Check the ORM objects have correct requires_acknowledgement
        assert added_objects[0].requires_acknowledgement is True
        assert added_objects[1].requires_acknowledgement is False
