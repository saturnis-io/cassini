"""Control limit calculation service for SPC characteristics.

This module provides services for calculating and recalculating control limits
from historical sample data. It automatically selects the appropriate calculation
method based on subgroup size and supports OOC (Out of Control) sample exclusion.

Calculation methods:
- n=1: Moving Range (MR-bar / d2)
- n=2-10: R-bar / d2 method
- n>10: S-bar / c4 method
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from openspc.core.events import ControlLimitsUpdatedEvent, EventBus
from openspc.utils.constants import get_c4, get_d2
from openspc.utils.statistics import (
    estimate_sigma_moving_range,
    estimate_sigma_rbar,
    estimate_sigma_sbar,
)

if TYPE_CHECKING:
    from openspc.core.engine.rolling_window import RollingWindowManager
    from openspc.db.repositories.characteristic import CharacteristicRepository
    from openspc.db.repositories.sample import SampleRepository

logger = logging.getLogger(__name__)


@dataclass
class CalculationResult:
    """Result of control limit calculation.

    Attributes:
        center_line: Process center line (mean)
        ucl: Upper Control Limit
        lcl: Lower Control Limit
        sigma: Estimated process standard deviation
        method: Calculation method used ("moving_range", "r_bar_d2", "s_bar_c4")
        sample_count: Number of samples used in calculation
        excluded_count: Number of samples excluded from calculation
        calculated_at: Timestamp when calculation was performed
    """

    center_line: float
    ucl: float
    lcl: float
    sigma: float
    method: str
    sample_count: int
    excluded_count: int
    calculated_at: datetime


class ControlLimitService:
    """Service for calculating and managing control limits.

    This service calculates control limits from historical sample data,
    automatically selecting the appropriate method based on subgroup size.
    It supports excluding out-of-control samples and persisting calculated
    limits to the database.

    Example:
        >>> service = ControlLimitService(sample_repo, char_repo, window_manager)
        >>> result = await service.calculate_limits(
        ...     characteristic_id=1,
        ...     exclude_ooc=True,
        ...     min_samples=25
        ... )
        >>> print(f"UCL: {result.ucl}, LCL: {result.lcl}")
    """

    def __init__(
        self,
        sample_repo: "SampleRepository",
        char_repo: "CharacteristicRepository",
        window_manager: "RollingWindowManager",
        event_bus: EventBus | None = None,
    ):
        """Initialize control limit service.

        Args:
            sample_repo: Repository for sample data access
            char_repo: Repository for characteristic data access
            window_manager: Manager for rolling window cache
            event_bus: Optional event bus for publishing events (uses global if None)
        """
        self._sample_repo = sample_repo
        self._char_repo = char_repo
        self._window_manager = window_manager

        # Use provided event bus or import global instance
        if event_bus is None:
            from openspc.core.events import event_bus as global_bus

            self._event_bus = global_bus
        else:
            self._event_bus = event_bus

    async def calculate_limits(
        self,
        characteristic_id: int,
        exclude_ooc: bool = False,
        min_samples: int = 25,
    ) -> CalculationResult:
        """Calculate control limits from historical data.

        This method fetches historical samples for a characteristic,
        selects the appropriate calculation method based on subgroup size,
        and computes control limits.

        Args:
            characteristic_id: ID of characteristic to calculate limits for
            exclude_ooc: If True, exclude samples with violations from calculation
            min_samples: Minimum number of samples required (default: 25)

        Returns:
            CalculationResult containing calculated limits and metadata

        Raises:
            ValueError: If characteristic not found
            ValueError: If insufficient samples (< min_samples)

        Example:
            >>> result = await service.calculate_limits(
            ...     characteristic_id=1,
            ...     exclude_ooc=True,
            ...     min_samples=25
            ... )
            >>> print(f"Method: {result.method}, Sigma: {result.sigma}")
        """
        # Fetch characteristic
        characteristic = await self._char_repo.get_by_id(characteristic_id)
        if characteristic is None:
            raise ValueError(f"Characteristic {characteristic_id} not found")

        # Fetch all samples (not just rolling window)
        all_samples = await self._sample_repo.get_by_characteristic(characteristic_id)

        # Filter out excluded samples if requested
        if exclude_ooc:
            # Exclude samples that are marked as excluded or have violations
            samples = [s for s in all_samples if not s.is_excluded]
            excluded_count = len(all_samples) - len(samples)
        else:
            samples = all_samples
            excluded_count = 0

        # Check minimum sample requirement
        if len(samples) < min_samples:
            raise ValueError(
                f"Insufficient samples for calculation: {len(samples)} < {min_samples}"
            )

        # Select calculation method
        subgroup_size = characteristic.subgroup_size
        method = self._select_method(subgroup_size)

        # Calculate limits based on method
        if method == "moving_range":
            center_line, ucl, lcl, sigma = self._calculate_moving_range(samples)
        elif method == "r_bar_d2":
            center_line, ucl, lcl, sigma = self._calculate_r_bar(
                samples, subgroup_size
            )
        else:  # s_bar_c4
            center_line, ucl, lcl, sigma = self._calculate_s_bar(
                samples, subgroup_size
            )

        return CalculationResult(
            center_line=center_line,
            ucl=ucl,
            lcl=lcl,
            sigma=sigma,
            method=method,
            sample_count=len(samples),
            excluded_count=excluded_count,
            calculated_at=datetime.utcnow(),
        )

    async def recalculate_and_persist(
        self,
        characteristic_id: int,
        exclude_ooc: bool = False,
        min_samples: int = 25,
    ) -> CalculationResult:
        """Calculate limits and persist to characteristic.

        This method calculates control limits and updates the characteristic
        in the database. It also invalidates the rolling window cache to
        ensure new limits are picked up on the next evaluation.

        Args:
            characteristic_id: ID of characteristic to recalculate
            exclude_ooc: If True, exclude samples with violations from calculation
            min_samples: Minimum number of samples required (default: 25)

        Returns:
            CalculationResult containing calculated limits and metadata

        Raises:
            ValueError: If characteristic not found
            ValueError: If insufficient samples (< min_samples)

        Example:
            >>> result = await service.recalculate_and_persist(
            ...     characteristic_id=1,
            ...     exclude_ooc=False,
            ...     min_samples=30
            ... )
            >>> print(f"Persisted UCL: {result.ucl}, LCL: {result.lcl}")
        """
        # Calculate limits
        result = await self.calculate_limits(
            characteristic_id=characteristic_id,
            exclude_ooc=exclude_ooc,
            min_samples=min_samples,
        )

        # Update characteristic with new limits and stored parameters
        characteristic = await self._char_repo.get_by_id(characteristic_id)
        if characteristic is None:
            raise ValueError(f"Characteristic {characteristic_id} not found")

        characteristic.ucl = result.ucl
        characteristic.lcl = result.lcl

        # Store sigma and center_line for Mode A (STANDARDIZED) and Mode B (VARIABLE_LIMITS)
        # These values are required for variable subgroup size handling
        characteristic.stored_sigma = result.sigma
        characteristic.stored_center_line = result.center_line

        # Commit changes
        await self._char_repo.session.commit()

        # Invalidate rolling window to pick up new limits
        await self._window_manager.invalidate(characteristic_id)

        # Publish ControlLimitsUpdatedEvent to Event Bus
        event = ControlLimitsUpdatedEvent(
            characteristic_id=characteristic_id,
            center_line=result.center_line,
            ucl=result.ucl,
            lcl=result.lcl,
            method=result.method,
            sample_count=result.sample_count,
            timestamp=result.calculated_at,
        )

        logger.info(
            f"Publishing ControlLimitsUpdatedEvent for characteristic "
            f"{characteristic_id} (method={result.method}, samples={result.sample_count})"
        )

        await self._event_bus.publish(event)

        return result

    def _select_method(self, subgroup_size: int) -> str:
        """Select calculation method based on subgroup size.

        Selection rules:
        - n=1: Moving range method (I-MR chart)
        - n=2-10: R-bar / d2 method (X-bar R chart)
        - n>10: S-bar / c4 method (X-bar S chart)

        Args:
            subgroup_size: Size of subgroups

        Returns:
            Method name string

        Example:
            >>> service._select_method(1)
            'moving_range'
            >>> service._select_method(5)
            'r_bar_d2'
            >>> service._select_method(15)
            's_bar_c4'
        """
        if subgroup_size == 1:
            return "moving_range"
        elif subgroup_size <= 10:
            return "r_bar_d2"
        else:
            return "s_bar_c4"

    def _calculate_moving_range(
        self, samples: list
    ) -> tuple[float, float, float, float]:
        """Calculate limits for individuals chart (n=1).

        Uses the moving range method with span=2:
        - X-bar = mean of individual values
        - MR-bar = mean of moving ranges
        - sigma = MR-bar / d2 (d2=1.128 for span=2)
        - UCL = X-bar + 3*sigma
        - LCL = X-bar - 3*sigma

        Args:
            samples: List of Sample objects with measurements

        Returns:
            Tuple of (center_line, ucl, lcl, sigma)

        Example:
            For values [10.0, 12.0, 11.0, 13.0, 10.0]:
            - X-bar = 11.2
            - MR-bar = 2.0
            - sigma = 1.773
            - UCL = 16.52, LCL = 5.88
        """
        # Extract individual values (mean of each sample's measurements)
        values = []
        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values:
                values.append(sum(measurement_values) / len(measurement_values))

        # Calculate center line (X-bar)
        center_line = sum(values) / len(values)

        # Estimate sigma using moving range
        sigma = estimate_sigma_moving_range(values, span=2)

        # Calculate control limits (3-sigma)
        ucl = center_line + 3 * sigma
        lcl = center_line - 3 * sigma

        return center_line, ucl, lcl, sigma

    def _calculate_r_bar(
        self, samples: list, subgroup_size: int
    ) -> tuple[float, float, float, float]:
        """Calculate limits using R-bar/d2 method.

        Uses the range-based method for subgroup sizes 2-10:
        - X-bar = mean of subgroup means
        - R-bar = mean of subgroup ranges
        - sigma = R-bar / d2
        - UCL = X-bar + 3*sigma
        - LCL = X-bar - 3*sigma

        Args:
            samples: List of Sample objects with measurements
            subgroup_size: Size of subgroups

        Returns:
            Tuple of (center_line, ucl, lcl, sigma)

        Example:
            For subgroup means [10.0, 10.2, 9.8, 10.1] and ranges [1.2, 1.5, 1.0, 1.3]:
            With n=5:
            - X-bar = 10.025
            - R-bar = 1.25
            - sigma = 1.25 / 2.326 = 0.537
            - UCL = 11.637, LCL = 8.413
        """
        # Calculate subgroup means and ranges
        subgroup_means = []
        subgroup_ranges = []

        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values:
                # Calculate mean
                subgroup_mean = sum(measurement_values) / len(measurement_values)
                subgroup_means.append(subgroup_mean)

                # Calculate range
                subgroup_range = max(measurement_values) - min(measurement_values)
                subgroup_ranges.append(subgroup_range)

        # Calculate center line (X-double-bar)
        center_line = sum(subgroup_means) / len(subgroup_means)

        # Estimate sigma using R-bar method
        sigma = estimate_sigma_rbar(subgroup_ranges, subgroup_size)

        # Calculate control limits (3-sigma)
        ucl = center_line + 3 * sigma
        lcl = center_line - 3 * sigma

        return center_line, ucl, lcl, sigma

    def _calculate_s_bar(
        self, samples: list, subgroup_size: int
    ) -> tuple[float, float, float, float]:
        """Calculate limits using S-bar/c4 method.

        Uses the standard deviation method for subgroup sizes > 10:
        - X-bar = mean of subgroup means
        - S-bar = mean of subgroup standard deviations
        - sigma = S-bar / c4
        - UCL = X-bar + 3*sigma
        - LCL = X-bar - 3*sigma

        Args:
            samples: List of Sample objects with measurements
            subgroup_size: Size of subgroups

        Returns:
            Tuple of (center_line, ucl, lcl, sigma)

        Example:
            For subgroup means [10.0, 10.2, 9.8, 10.1] and stds [0.5, 0.6, 0.4, 0.5]:
            With n=15:
            - X-bar = 10.025
            - S-bar = 0.5
            - sigma = 0.5 / 0.9823 = 0.509
            - UCL = 11.552, LCL = 8.498
        """
        # Calculate subgroup means and standard deviations
        subgroup_means = []
        subgroup_stds = []

        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values and len(measurement_values) > 1:
                # Calculate mean
                subgroup_mean = sum(measurement_values) / len(measurement_values)
                subgroup_means.append(subgroup_mean)

                # Calculate standard deviation
                variance = sum(
                    (x - subgroup_mean) ** 2 for x in measurement_values
                ) / (len(measurement_values) - 1)
                subgroup_std = variance ** 0.5
                subgroup_stds.append(subgroup_std)

        # Calculate center line (X-double-bar)
        center_line = sum(subgroup_means) / len(subgroup_means)

        # Estimate sigma using S-bar method
        sigma = estimate_sigma_sbar(subgroup_stds, subgroup_size)

        # Calculate control limits (3-sigma)
        ucl = center_line + 3 * sigma
        lcl = center_line - 3 * sigma

        return center_line, ucl, lcl, sigma
