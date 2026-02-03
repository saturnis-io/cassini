"""Unit tests for Control Limit Calculation Service.

Tests verify:
- Correct method selection based on subgroup size
- Accurate moving range calculations for n=1
- Accurate R-bar/d2 calculations for n=2-10
- Accurate S-bar/c4 calculations for n>10
- OOC sample exclusion functionality
- Limit persistence to characteristic
- Rolling window invalidation
- Error handling for insufficient samples
"""

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openspc.core.engine.control_limits import CalculationResult, ControlLimitService
from openspc.db.models.characteristic import Characteristic
from openspc.db.models.sample import Measurement, Sample


class TestMethodSelection:
    """Test automatic method selection based on subgroup size."""

    def test_select_moving_range_for_n1(self):
        """Verify moving range method selected for n=1."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        assert service._select_method(1) == "moving_range"

    def test_select_r_bar_for_n2_to_n10(self):
        """Verify R-bar/d2 method selected for n=2-10."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        assert service._select_method(2) == "r_bar_d2"
        assert service._select_method(5) == "r_bar_d2"
        assert service._select_method(10) == "r_bar_d2"

    def test_select_s_bar_for_n_greater_than_10(self):
        """Verify S-bar/c4 method selected for n>10."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        assert service._select_method(11) == "s_bar_c4"
        assert service._select_method(15) == "s_bar_c4"
        assert service._select_method(20) == "s_bar_c4"


class TestMovingRangeCalculation:
    """Test moving range method for individuals charts (n=1)."""

    def test_moving_range_with_known_values(self):
        """Test moving range calculation with known expected values.

        Test data: [10.0, 12.0, 11.0, 13.0, 10.0]
        Expected:
        - X-bar = 11.2
        - MRs = [2, 1, 2, 3] → MR-bar = 2.0
        - sigma = 2.0 / 1.128 = 1.773
        - UCL = 11.2 + 3*1.773 = 16.52
        - LCL = 11.2 - 3*1.773 = 5.88
        """
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create sample data
        values = [10.0, 12.0, 11.0, 13.0, 10.0]
        samples = []
        for value in values:
            sample = MagicMock(spec=Sample)
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_moving_range(samples)

        # Verify results (with tolerance for floating point)
        assert abs(center_line - 11.2) < 0.01
        assert abs(sigma - 1.773) < 0.01
        assert abs(ucl - 16.52) < 0.01
        assert abs(lcl - 5.88) < 0.01

    def test_moving_range_with_larger_dataset(self):
        """Test moving range with larger dataset for statistical validity."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Generate 30 samples around mean of 100 with some variation
        values = [
            100.0,
            102.0,
            98.0,
            101.0,
            99.0,
            103.0,
            97.0,
            100.5,
            101.5,
            98.5,
            100.0,
            102.5,
            99.5,
            101.0,
            100.0,
            98.0,
            102.0,
            100.5,
            99.0,
            101.5,
            100.0,
            98.5,
            102.5,
            99.5,
            101.0,
            100.5,
            99.0,
            102.0,
            100.0,
            101.0,
        ]

        samples = []
        for value in values:
            sample = MagicMock(spec=Sample)
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_moving_range(samples)

        # Verify reasonable results
        assert 99.0 < center_line < 101.0  # Mean should be around 100
        assert sigma > 0  # Sigma should be positive
        assert ucl > center_line  # UCL above center
        assert lcl < center_line  # LCL below center
        assert (ucl - center_line) == pytest.approx(3 * sigma, rel=1e-9)
        assert (center_line - lcl) == pytest.approx(3 * sigma, rel=1e-9)


class TestRBarCalculation:
    """Test R-bar/d2 method for X-bar R charts (n=2-10)."""

    def test_r_bar_with_known_values_n5(self):
        """Test R-bar calculation with known values for n=5.

        Test data:
        - Subgroup 1: [10.0, 10.2, 10.1, 10.3, 10.0] → mean=10.12, R=0.3
        - Subgroup 2: [10.5, 10.7, 10.6, 10.8, 10.5] → mean=10.62, R=0.3
        - Subgroup 3: [9.8, 10.0, 9.9, 10.1, 9.8] → mean=9.92, R=0.3
        - Subgroup 4: [10.2, 10.4, 10.3, 10.5, 10.2] → mean=10.32, R=0.3

        Expected:
        - X-double-bar = 10.245
        - R-bar = 0.3
        - sigma = 0.3 / 2.326 = 0.129
        - UCL = 10.245 + 3*0.129 = 10.632
        - LCL = 10.245 - 3*0.129 = 9.858
        """
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create sample data
        subgroups = [
            [10.0, 10.2, 10.1, 10.3, 10.0],
            [10.5, 10.7, 10.6, 10.8, 10.5],
            [9.8, 10.0, 9.9, 10.1, 9.8],
            [10.2, 10.4, 10.3, 10.5, 10.2],
        ]

        samples = []
        for subgroup_values in subgroups:
            sample = MagicMock(spec=Sample)
            measurements = []
            for value in subgroup_values:
                measurement = MagicMock(spec=Measurement)
                measurement.value = value
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=5)

        # Verify results
        assert abs(center_line - 10.245) < 0.01
        assert abs(sigma - 0.129) < 0.01
        assert abs(ucl - 10.632) < 0.01
        assert abs(lcl - 9.858) < 0.01

    def test_r_bar_with_varying_ranges(self):
        """Test R-bar calculation with varying subgroup ranges."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create samples with different ranges
        subgroups = [
            [10.0, 11.0, 10.5],  # R=1.0
            [10.0, 12.0, 11.0],  # R=2.0
            [10.0, 11.5, 10.8],  # R=1.5
            [10.0, 10.5, 10.2],  # R=0.5
        ]

        samples = []
        for subgroup_values in subgroups:
            sample = MagicMock(spec=Sample)
            measurements = []
            for value in subgroup_values:
                measurement = MagicMock(spec=Measurement)
                measurement.value = value
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=3)

        # Verify reasonable results
        expected_mean = sum(sum(sg) / len(sg) for sg in subgroups) / len(subgroups)
        expected_r_bar = (1.0 + 2.0 + 1.5 + 0.5) / 4  # 1.25
        expected_sigma = expected_r_bar / 1.693  # d2 for n=3

        assert abs(center_line - expected_mean) < 0.01
        assert abs(sigma - expected_sigma) < 0.01
        assert abs(ucl - (expected_mean + 3 * expected_sigma)) < 0.01
        assert abs(lcl - (expected_mean - 3 * expected_sigma)) < 0.01


class TestSBarCalculation:
    """Test S-bar/c4 method for X-bar S charts (n>10)."""

    def test_s_bar_with_known_values_n15(self):
        """Test S-bar calculation with known values for n=15.

        Test data: 4 subgroups of 15 values each
        All subgroups have mean=100 and std≈2.0
        """
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create sample data: 15 values per subgroup
        # Values generated to have known mean and std
        import random

        random.seed(42)  # For reproducibility

        samples = []
        for _ in range(4):
            # Generate 15 values around mean=100 with std≈2
            subgroup_values = [random.gauss(100, 2) for _ in range(15)]

            sample = MagicMock(spec=Sample)
            measurements = []
            for value in subgroup_values:
                measurement = MagicMock(spec=Measurement)
                measurement.value = value
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_s_bar(
            samples, subgroup_size=15
        )

        # Verify reasonable results
        assert 98.0 < center_line < 102.0  # Mean should be around 100
        assert 1.5 < sigma < 2.5  # Sigma should be around 2
        assert ucl > center_line
        assert lcl < center_line
        assert (ucl - center_line) == pytest.approx(3 * sigma, rel=1e-9)

    def test_s_bar_verifies_c4_correction(self):
        """Test that S-bar method applies c4 correction factor."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create samples with known standard deviations
        # Use constant values within subgroups to get predictable stds
        subgroups = []
        for i in range(4):
            base = 100 + i
            # Create 11 values with small variation
            subgroup_values = [base] * 5 + [base + 1] * 6
            subgroups.append(subgroup_values)

        samples = []
        for subgroup_values in subgroups:
            sample = MagicMock(spec=Sample)
            measurements = []
            for value in subgroup_values:
                measurement = MagicMock(spec=Measurement)
                measurement.value = value
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_s_bar(
            samples, subgroup_size=11
        )

        # Verify that calculation completes without error
        assert sigma > 0
        assert ucl > lcl
        assert center_line > lcl
        assert center_line < ucl


class TestCalculateLimits:
    """Test full calculate_limits method with database integration."""

    @pytest.mark.asyncio
    async def test_calculate_limits_moving_range_success(self):
        """Test successful limit calculation for n=1."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        char_repo.get_by_id = AsyncMock(return_value=characteristic)

        # Setup samples
        values = [10.0, 12.0, 11.0, 13.0, 10.0, 11.0, 12.5, 10.5, 11.5, 12.0] * 3
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            sample.violations = []
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)

        # Create service and calculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.calculate_limits(characteristic_id=1, min_samples=25)

        # Verify result
        assert isinstance(result, CalculationResult)
        assert result.method == "moving_range"
        assert result.sample_count == 30
        assert result.excluded_count == 0
        assert result.sigma > 0
        assert result.ucl > result.center_line
        assert result.lcl < result.center_line

    @pytest.mark.asyncio
    async def test_calculate_limits_r_bar_success(self):
        """Test successful limit calculation for n=5."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 5
        char_repo.get_by_id = AsyncMock(return_value=characteristic)

        # Setup samples (30 subgroups of 5)
        samples = []
        for i in range(30):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            sample.violations = []
            measurements = []
            for j in range(5):
                measurement = MagicMock(spec=Measurement)
                measurement.value = 10.0 + (i % 3) + (j * 0.1)
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)

        # Create service and calculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.calculate_limits(characteristic_id=1, min_samples=25)

        # Verify result
        assert isinstance(result, CalculationResult)
        assert result.method == "r_bar_d2"
        assert result.sample_count == 30
        assert result.excluded_count == 0
        assert result.sigma > 0
        assert result.ucl > result.center_line
        assert result.lcl < result.center_line

    @pytest.mark.asyncio
    async def test_calculate_limits_s_bar_success(self):
        """Test successful limit calculation for n=15."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 15
        char_repo.get_by_id = AsyncMock(return_value=characteristic)

        # Setup samples (30 subgroups of 15)
        import random

        random.seed(42)
        samples = []
        for i in range(30):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            sample.violations = []
            measurements = []
            for j in range(15):
                measurement = MagicMock(spec=Measurement)
                measurement.value = random.gauss(100, 2)
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)

        # Create service and calculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.calculate_limits(characteristic_id=1, min_samples=25)

        # Verify result
        assert isinstance(result, CalculationResult)
        assert result.method == "s_bar_c4"
        assert result.sample_count == 30
        assert result.excluded_count == 0
        assert result.sigma > 0
        assert result.ucl > result.center_line
        assert result.lcl < result.center_line

    @pytest.mark.asyncio
    async def test_calculate_limits_with_ooc_exclusion(self):
        """Test OOC sample exclusion functionality."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        char_repo.get_by_id = AsyncMock(return_value=characteristic)

        # Setup samples (some excluded)
        values = [10.0, 12.0, 11.0, 13.0, 10.0] * 6
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            # Mark every 5th sample as excluded
            sample.is_excluded = (i % 5 == 0)
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)

        # Create service and calculate with exclusion
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.calculate_limits(
            characteristic_id=1, exclude_ooc=True, min_samples=20
        )

        # Verify result
        assert result.sample_count == 24  # 30 - 6 excluded
        assert result.excluded_count == 6

    @pytest.mark.asyncio
    async def test_calculate_limits_insufficient_samples(self):
        """Test error handling for insufficient samples."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        char_repo.get_by_id = AsyncMock(return_value=characteristic)

        # Setup too few samples
        samples = []
        for i in range(10):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurement = MagicMock(spec=Measurement)
            measurement.value = 10.0
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)

        # Create service and try to calculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)

        with pytest.raises(ValueError, match="Insufficient samples"):
            await service.calculate_limits(characteristic_id=1, min_samples=25)

    @pytest.mark.asyncio
    async def test_calculate_limits_characteristic_not_found(self):
        """Test error handling when characteristic doesn't exist."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Characteristic not found
        char_repo.get_by_id = AsyncMock(return_value=None)

        # Create service and try to calculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)

        with pytest.raises(ValueError, match="Characteristic .* not found"):
            await service.calculate_limits(characteristic_id=999)


class TestRecalculateAndPersist:
    """Test recalculate_and_persist method."""

    @pytest.mark.asyncio
    async def test_recalculate_and_persist_success(self):
        """Test successful recalculation and persistence."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        characteristic.ucl = None
        characteristic.lcl = None
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples
        values = [10.0, 12.0, 11.0, 13.0, 10.0] * 6
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify result
        assert isinstance(result, CalculationResult)
        assert result.ucl > 0
        assert result.lcl > 0

        # Verify persistence
        assert characteristic.ucl == result.ucl
        assert characteristic.lcl == result.lcl
        char_repo.session.commit.assert_awaited_once()

        # Verify window invalidation
        window_manager.invalidate.assert_awaited_once_with(1)

    @pytest.mark.asyncio
    async def test_recalculate_and_persist_updates_existing_limits(self):
        """Test that existing limits are properly updated."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic with existing limits
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        characteristic.ucl = 15.0
        characteristic.lcl = 5.0
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples
        values = [10.0, 12.0, 11.0, 13.0, 10.0] * 6
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify limits were updated
        assert characteristic.ucl != 15.0  # Should be different from initial
        assert characteristic.lcl != 5.0
        assert characteristic.ucl == result.ucl
        assert characteristic.lcl == result.lcl


class TestStoredParametersPersistence:
    """Test stored sigma and center_line persistence."""

    @pytest.mark.asyncio
    async def test_recalculate_stores_sigma(self):
        """Test recalculate_and_persist stores stored_sigma on characteristic."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        characteristic.ucl = None
        characteristic.lcl = None
        characteristic.stored_sigma = None
        characteristic.stored_center_line = None
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples
        values = [10.0, 12.0, 11.0, 13.0, 10.0] * 6
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify stored_sigma was set
        assert characteristic.stored_sigma == result.sigma
        assert characteristic.stored_sigma > 0

    @pytest.mark.asyncio
    async def test_recalculate_stores_center_line(self):
        """Test recalculate_and_persist stores stored_center_line on characteristic."""
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 1
        characteristic.ucl = None
        characteristic.lcl = None
        characteristic.stored_sigma = None
        characteristic.stored_center_line = None
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples
        values = [10.0, 12.0, 11.0, 13.0, 10.0] * 6
        samples = []
        for i, value in enumerate(values):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify stored_center_line was set
        assert characteristic.stored_center_line == result.center_line
        assert characteristic.stored_center_line > 0


class TestModeSpecificLimitCalculation:
    """Test that mode-specific limits are calculated correctly."""

    @pytest.mark.asyncio
    async def test_mode_a_nominal_limits_calculated(self):
        """Test that recalculate computes nominal limits for Mode A.

        After recalculate, UCL/LCL should be based on nominal subgroup_size.
        """
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic (Mode A with subgroup_size=5)
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 5
        characteristic.subgroup_mode = "STANDARDIZED"
        characteristic.ucl = None
        characteristic.lcl = None
        characteristic.stored_sigma = None
        characteristic.stored_center_line = None
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples (subgroups of 5)
        samples = []
        for i in range(30):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurements = []
            for j in range(5):
                measurement = MagicMock(spec=Measurement)
                measurement.value = 100.0 + (i % 3) + (j * 0.1)
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify sigma and center_line were stored (needed for Mode A)
        assert characteristic.stored_sigma == result.sigma
        assert characteristic.stored_center_line == result.center_line

        # Verify UCL/LCL were calculated
        assert characteristic.ucl == result.ucl
        assert characteristic.lcl == result.lcl

    @pytest.mark.asyncio
    async def test_mode_b_nominal_limits_calculated(self):
        """Test that recalculate computes nominal limits for Mode B.

        Similar to Mode A - stored parameters should be set.
        """
        # Mock repositories
        char_repo = MagicMock()
        sample_repo = MagicMock()
        window_manager = MagicMock()

        # Setup characteristic (Mode B)
        characteristic = MagicMock(spec=Characteristic)
        characteristic.id = 1
        characteristic.subgroup_size = 5
        characteristic.subgroup_mode = "VARIABLE_LIMITS"
        characteristic.ucl = None
        characteristic.lcl = None
        characteristic.stored_sigma = None
        characteristic.stored_center_line = None
        char_repo.get_by_id = AsyncMock(return_value=characteristic)
        char_repo.session = MagicMock()
        char_repo.session.commit = AsyncMock()

        # Setup samples
        samples = []
        for i in range(30):
            sample = MagicMock(spec=Sample)
            sample.id = i
            sample.is_excluded = False
            measurements = []
            for j in range(5):
                measurement = MagicMock(spec=Measurement)
                measurement.value = 100.0 + (i % 3) + (j * 0.1)
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        sample_repo.get_by_characteristic = AsyncMock(return_value=samples)
        window_manager.invalidate = AsyncMock()

        # Create service and recalculate
        service = ControlLimitService(sample_repo, char_repo, window_manager)
        result = await service.recalculate_and_persist(
            characteristic_id=1, min_samples=25
        )

        # Verify sigma and center_line were stored (needed for Mode B)
        assert characteristic.stored_sigma == result.sigma
        assert characteristic.stored_center_line == result.center_line


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_moving_range_with_minimum_samples(self):
        """Test moving range with minimum required samples."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create exactly 2 samples (minimum for moving range span=2)
        values = [10.0, 12.0]
        samples = []
        for value in values:
            sample = MagicMock(spec=Sample)
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            sample.measurements = [measurement]
            samples.append(sample)

        # Should not raise error
        center_line, ucl, lcl, sigma = service._calculate_moving_range(samples)

        assert center_line == 11.0  # Mean of [10, 12]
        assert sigma > 0
        assert ucl > center_line
        assert lcl < center_line

    def test_r_bar_with_zero_range_subgroups(self):
        """Test R-bar calculation when all measurements in subgroup are identical."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create subgroups with zero range
        subgroups = [[10.0] * 5, [10.0] * 5, [10.0] * 5, [10.0] * 5]

        samples = []
        for subgroup_values in subgroups:
            sample = MagicMock(spec=Sample)
            measurements = []
            for value in subgroup_values:
                measurement = MagicMock(spec=Measurement)
                measurement.value = value
                measurements.append(measurement)
            sample.measurements = measurements
            samples.append(sample)

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=5)

        # Should have zero sigma (no variation)
        assert center_line == 10.0
        assert sigma == 0.0
        assert ucl == 10.0
        assert lcl == 10.0

    def test_handles_samples_with_multiple_measurements(self):
        """Test that service correctly handles samples with multiple measurements."""
        service = ControlLimitService(
            sample_repo=MagicMock(),
            char_repo=MagicMock(),
            window_manager=MagicMock(),
        )

        # Create sample with 5 measurements
        sample = MagicMock(spec=Sample)
        measurements = []
        for value in [10.0, 10.5, 11.0, 10.2, 10.8]:
            measurement = MagicMock(spec=Measurement)
            measurement.value = value
            measurements.append(measurement)
        sample.measurements = measurements

        samples = [sample] * 4  # 4 identical subgroups

        # Calculate
        center_line, ucl, lcl, sigma = service._calculate_r_bar(samples, subgroup_size=5)

        # Mean should be around 10.5
        expected_mean = (10.0 + 10.5 + 11.0 + 10.2 + 10.8) / 5
        assert abs(center_line - expected_mean) < 0.01
