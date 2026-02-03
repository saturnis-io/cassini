"""SPC Engine orchestrator for processing samples through the complete SPC pipeline.

This module provides the main SPCEngine class that coordinates sample processing,
rule evaluation, violation creation, and statistics calculation.
"""

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from openspc.core.engine.rolling_window import WindowSample, ZoneBoundaries
from openspc.core.events import EventBus, SampleProcessedEvent
from openspc.core.providers.protocol import SampleContext
from openspc.db.models.characteristic import SubgroupMode
from openspc.utils.statistics import calculate_zones

if TYPE_CHECKING:
    from openspc.core.engine.nelson_rules import NelsonRuleLibrary, RuleResult
    from openspc.core.engine.rolling_window import RollingWindowManager
    from openspc.db.repositories import (
        CharacteristicRepository,
        SampleRepository,
        ViolationRepository,
    )

logger = logging.getLogger(__name__)


@dataclass
class ViolationInfo:
    """Information about a rule violation.

    Attributes:
        rule_id: Nelson Rule number (1-8)
        rule_name: Human-readable rule name
        severity: Severity level (WARNING or CRITICAL)
        message: Human-readable description
        involved_sample_ids: Sample IDs involved in the violation
    """

    rule_id: int
    rule_name: str
    severity: str
    message: str
    involved_sample_ids: list[int]


@dataclass
class ProcessingResult:
    """Result of processing a sample through the SPC engine.

    Attributes:
        sample_id: Database ID of the created sample
        characteristic_id: ID of the characteristic
        timestamp: When the sample was taken
        mean: Sample mean (average of measurements)
        range_value: Sample range (max-min) for subgroups, None for n=1
        zone: Zone classification (e.g., "zone_c_upper")
        sigma_distance: Distance from center line in sigma units
        is_above_center: True if sample is above center line
        in_control: True if no violations were triggered
        violations: List of violations that were triggered
        processing_time_ms: Time taken to process in milliseconds
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime

    # Statistics
    mean: float
    range_value: float | None

    # Zone information
    zone: str
    sigma_distance: float
    is_above_center: bool

    # Control state
    in_control: bool
    violations: list[ViolationInfo] = field(default_factory=list)

    # Performance
    processing_time_ms: float = 0.0


class SPCEngine:
    """Main SPC processing engine.

    Orchestrates the complete SPC pipeline:
    1. Validates characteristic and measurements
    2. Persists sample and measurements to database
    3. Calculates statistics (mean, range)
    4. Updates rolling window with zone classification
    5. Evaluates enabled Nelson Rules
    6. Creates violations for triggered rules
    7. Returns processing result with all information

    Args:
        sample_repo: Repository for sample persistence
        char_repo: Repository for characteristic queries
        violation_repo: Repository for violation persistence
        window_manager: Manager for rolling windows
        rule_library: Library of Nelson Rules
    """

    def __init__(
        self,
        sample_repo: "SampleRepository",
        char_repo: "CharacteristicRepository",
        violation_repo: "ViolationRepository",
        window_manager: "RollingWindowManager",
        rule_library: "NelsonRuleLibrary",
        event_bus: EventBus | None = None,
    ):
        """Initialize SPC engine with required dependencies.

        Args:
            sample_repo: Repository for sample operations
            char_repo: Repository for characteristic operations
            violation_repo: Repository for violation operations
            window_manager: Rolling window manager
            rule_library: Nelson Rules library
            event_bus: Optional event bus for publishing events (uses global if None)
        """
        self._sample_repo = sample_repo
        self._char_repo = char_repo
        self._violation_repo = violation_repo
        self._window_manager = window_manager
        self._rule_library = rule_library

        # Use provided event bus or import global instance
        if event_bus is None:
            from openspc.core.events import event_bus as global_bus

            self._event_bus = global_bus
        else:
            self._event_bus = event_bus

    def _validate_measurements(
        self,
        char,
        measurements: list[float],
    ) -> tuple[bool, bool]:
        """Validate measurements against characteristic's subgroup configuration.

        Args:
            char: Characteristic model object
            measurements: List of measurement values

        Returns:
            Tuple of (is_valid, is_undersized)

        Raises:
            ValueError: If measurement count is below min_measurements
            ValueError: If Mode C and measurements exceed subgroup_size
        """
        actual_n = len(measurements)

        # Check minimum measurements requirement
        if actual_n < char.min_measurements:
            raise ValueError(
                f"Insufficient measurements: got {actual_n}, "
                f"minimum required is {char.min_measurements}"
            )

        # For NOMINAL_TOLERANCE mode, enforce max subgroup_size
        if char.subgroup_mode == SubgroupMode.NOMINAL_TOLERANCE.value:
            if actual_n > char.subgroup_size:
                raise ValueError(
                    f"Too many measurements for NOMINAL_TOLERANCE mode: "
                    f"got {actual_n}, maximum is {char.subgroup_size}"
                )

        # Determine if undersized
        threshold = char.warn_below_count or char.subgroup_size
        is_undersized = actual_n < threshold

        return True, is_undersized

    def _compute_sample_statistics(
        self,
        char,
        measurements: list[float],
        actual_n: int,
    ) -> dict:
        """Compute mode-specific statistics for a sample.

        Args:
            char: Characteristic model object
            measurements: List of measurement values
            actual_n: Actual number of measurements

        Returns:
            Dict with mean, range_value, z_score, effective_ucl, effective_lcl

        Raises:
            ValueError: If Mode A/B requires stored_sigma but it's not set
        """
        # Calculate basic statistics
        mean = sum(measurements) / len(measurements)
        range_value = None
        if len(measurements) > 1:
            range_value = max(measurements) - min(measurements)

        # Initialize mode-specific values
        z_score = None
        effective_ucl = None
        effective_lcl = None

        mode = char.subgroup_mode

        if mode == SubgroupMode.STANDARDIZED.value:
            # Mode A: Calculate Z-score
            if char.stored_sigma is None or char.stored_center_line is None:
                raise ValueError(
                    "STANDARDIZED mode requires stored_sigma and stored_center_line. "
                    "Run recalculate-limits first."
                )
            # sigma_xbar = sigma / sqrt(n)
            sigma_xbar = char.stored_sigma / math.sqrt(actual_n)
            z_score = (mean - char.stored_center_line) / sigma_xbar

        elif mode == SubgroupMode.VARIABLE_LIMITS.value:
            # Mode B: Calculate effective limits per point
            if char.stored_sigma is None or char.stored_center_line is None:
                raise ValueError(
                    "VARIABLE_LIMITS mode requires stored_sigma and stored_center_line. "
                    "Run recalculate-limits first."
                )
            # sigma_xbar = sigma / sqrt(n)
            sigma_xbar = char.stored_sigma / math.sqrt(actual_n)
            effective_ucl = char.stored_center_line + 3 * sigma_xbar
            effective_lcl = char.stored_center_line - 3 * sigma_xbar

        # Mode C (NOMINAL_TOLERANCE): No additional calculations needed

        return {
            "mean": mean,
            "range_value": range_value,
            "z_score": z_score,
            "effective_ucl": effective_ucl,
            "effective_lcl": effective_lcl,
        }

    async def process_sample(
        self,
        characteristic_id: int,
        measurements: list[float],
        context: SampleContext | None = None,
    ) -> ProcessingResult:
        """Process a new sample through the SPC pipeline.

        This is the main entry point for sample processing. It performs the
        complete SPC workflow from validation through rule evaluation.

        Args:
            characteristic_id: ID of the characteristic to process
            measurements: List of measurement values
            context: Optional context (batch, operator, etc.)

        Returns:
            ProcessingResult with statistics, zone info, and violations

        Raises:
            ValueError: If characteristic not found or validation fails

        Example:
            >>> result = await engine.process_sample(
            ...     characteristic_id=1,
            ...     measurements=[10.1, 10.2, 10.0],
            ...     context=SampleContext(batch_number="B123")
            ... )
            >>> print(f"Sample {result.sample_id}: In control = {result.in_control}")
        """
        start_time = time.perf_counter()

        if context is None:
            context = SampleContext()

        # Step 1: Validate characteristic exists and measurements
        char = await self._char_repo.get_with_rules(characteristic_id)
        if char is None:
            raise ValueError(f"Characteristic {characteristic_id} not found")

        # Step 2: Validate measurements against subgroup mode configuration
        actual_n = len(measurements)
        _, is_undersized = self._validate_measurements(char, measurements)

        # Step 3: Compute mode-specific statistics
        stats = self._compute_sample_statistics(char, measurements, actual_n)
        mean = stats["mean"]
        range_value = stats["range_value"]
        z_score = stats["z_score"]
        effective_ucl = stats["effective_ucl"]
        effective_lcl = stats["effective_lcl"]

        # Step 4: Persist sample and measurements with mode-specific fields
        sample = await self._sample_repo.create_with_measurements(
            char_id=characteristic_id,
            values=measurements,
            batch_number=context.batch_number,
            operator_id=context.operator_id,
            actual_n=actual_n,
            is_undersized=is_undersized,
            effective_ucl=effective_ucl,
            effective_lcl=effective_lcl,
            z_score=z_score,
        )

        # Step 5: Get zone boundaries and update rolling window
        boundaries = await self._get_zone_boundaries(characteristic_id, char)

        # Add sample to rolling window with mode-specific data
        window_sample = await self._window_manager.add_sample(
            char_id=characteristic_id,
            sample=sample,
            boundaries=boundaries,
            measurement_values=measurements,
            subgroup_mode=char.subgroup_mode,
            actual_n=actual_n,
            is_undersized=is_undersized,
            z_score=z_score,
            effective_ucl=effective_ucl,
            effective_lcl=effective_lcl,
            stored_sigma=char.stored_sigma,
            stored_center_line=char.stored_center_line,
        )

        # Step 5: Evaluate enabled Nelson Rules
        window = await self._window_manager.get_window(characteristic_id)

        # Get enabled rule IDs from characteristic configuration
        enabled_rules = {rule.rule_id for rule in char.rules if rule.is_enabled}

        # Check all enabled rules
        rule_results = self._rule_library.check_all(window, enabled_rules)

        # Step 6: Create violations for triggered rules
        violations = await self._create_violations(sample.id, rule_results)

        # Step 7: Build and return result
        end_time = time.perf_counter()
        processing_time_ms = (end_time - start_time) * 1000

        result = ProcessingResult(
            sample_id=sample.id,
            characteristic_id=characteristic_id,
            timestamp=sample.timestamp,
            mean=mean,
            range_value=range_value,
            zone=window_sample.zone.value,
            sigma_distance=window_sample.sigma_distance,
            is_above_center=window_sample.is_above_center,
            in_control=len(violations) == 0,
            violations=violations,
            processing_time_ms=processing_time_ms,
        )

        # Step 8: Publish SampleProcessedEvent to Event Bus
        event = SampleProcessedEvent(
            sample_id=sample.id,
            characteristic_id=characteristic_id,
            mean=mean,
            range_value=range_value,
            zone=window_sample.zone.value,
            in_control=len(violations) == 0,
            timestamp=sample.timestamp,
        )

        logger.debug(
            f"Publishing SampleProcessedEvent for sample {sample.id} "
            f"(characteristic {characteristic_id})"
        )

        await self._event_bus.publish(event)

        return result

    async def _get_zone_boundaries(
        self, characteristic_id: int, char=None
    ) -> ZoneBoundaries:
        """Get zone boundaries for a characteristic.

        Uses stored control limits if available, otherwise calculates from
        historical data.

        Args:
            characteristic_id: ID of the characteristic
            char: Optional pre-loaded characteristic object

        Returns:
            ZoneBoundaries with all zone boundaries calculated

        Raises:
            ValueError: If no control limits available and insufficient data
        """
        if char is None:
            char = await self._char_repo.get_by_id(characteristic_id)
            if char is None:
                raise ValueError(f"Characteristic {characteristic_id} not found")

        # If control limits are already stored, use them
        if char.ucl is not None and char.lcl is not None:
            # Calculate center line and sigma from stored limits
            center_line = (char.ucl + char.lcl) / 2
            sigma = (char.ucl - char.lcl) / 6  # UCL/LCL are typically +/- 3 sigma

            zones = calculate_zones(center_line, sigma)
            return ZoneBoundaries(
                center_line=zones.center_line,
                plus_1_sigma=zones.plus_1_sigma,
                plus_2_sigma=zones.plus_2_sigma,
                plus_3_sigma=zones.plus_3_sigma,
                minus_1_sigma=zones.minus_1_sigma,
                minus_2_sigma=zones.minus_2_sigma,
                minus_3_sigma=zones.minus_3_sigma,
                sigma=sigma,
            )

        # Otherwise, calculate from historical data
        center_line, ucl, lcl = await self.recalculate_limits(
            characteristic_id, exclude_ooc=False
        )

        sigma = (ucl - lcl) / 6
        zones = calculate_zones(center_line, sigma)

        return ZoneBoundaries(
            center_line=zones.center_line,
            plus_1_sigma=zones.plus_1_sigma,
            plus_2_sigma=zones.plus_2_sigma,
            plus_3_sigma=zones.plus_3_sigma,
            minus_1_sigma=zones.minus_1_sigma,
            minus_2_sigma=zones.minus_2_sigma,
            minus_3_sigma=zones.minus_3_sigma,
            sigma=sigma,
        )

    async def _create_violations(
        self,
        sample_id: int,
        rule_results: list["RuleResult"],
    ) -> list[ViolationInfo]:
        """Create violation records for triggered rules.

        Args:
            sample_id: ID of the sample that triggered violations
            rule_results: List of rule results from Nelson Rules evaluation

        Returns:
            List of ViolationInfo objects
        """
        violations = []

        for result in rule_results:
            if not result.triggered:
                continue

            # Create violation record in database
            from openspc.db.models.violation import Violation

            violation = Violation(
                sample_id=sample_id,
                rule_id=result.rule_id,
                rule_name=result.rule_name,
                severity=result.severity.value,
                acknowledged=False,
            )
            self._sample_repo.session.add(violation)
            await self._sample_repo.session.flush()

            # Create ViolationInfo for result
            violations.append(
                ViolationInfo(
                    rule_id=result.rule_id,
                    rule_name=result.rule_name,
                    severity=result.severity.value,
                    message=result.message,
                    involved_sample_ids=result.involved_sample_ids,
                )
            )

        return violations

    async def recalculate_limits(
        self,
        characteristic_id: int,
        exclude_ooc: bool = False,
    ) -> tuple[float, float, float]:
        """Recalculate control limits from historical data.

        This method calculates control limits using historical samples.
        It supports both subgroup (n>1) and individuals (n=1) charts.

        Args:
            characteristic_id: ID of the characteristic
            exclude_ooc: If True, exclude out-of-control samples

        Returns:
            Tuple of (center_line, ucl, lcl)

        Raises:
            ValueError: If characteristic not found or insufficient data
        """
        from openspc.utils.statistics import (
            calculate_imr_limits,
            calculate_xbar_r_limits,
        )

        char = await self._char_repo.get_by_id(characteristic_id)
        if char is None:
            raise ValueError(f"Characteristic {characteristic_id} not found")

        # Get historical samples
        samples = await self._sample_repo.get_rolling_window(
            char_id=characteristic_id,
            window_size=100,  # Use last 100 samples for limit calculation
            exclude_excluded=True,
        )

        if not samples:
            raise ValueError(
                f"No samples available for characteristic {characteristic_id}"
            )

        # Calculate based on subgroup size
        if char.subgroup_size == 1:
            # Individuals chart (I-MR)
            values = []
            for sample in samples:
                if sample.measurements:
                    values.append(sample.measurements[0].value)

            if len(values) < 2:
                raise ValueError("Need at least 2 samples for I-MR chart")

            limits = calculate_imr_limits(values)
            return (
                limits.xbar_limits.center_line,
                limits.xbar_limits.ucl,
                limits.xbar_limits.lcl,
            )
        else:
            # X-bar R chart
            means = []
            ranges = []
            for sample in samples:
                if len(sample.measurements) != char.subgroup_size:
                    continue
                values = [m.value for m in sample.measurements]
                means.append(sum(values) / len(values))
                ranges.append(max(values) - min(values))

            if len(means) < 2:
                raise ValueError("Need at least 2 subgroups for X-bar R chart")

            limits = calculate_xbar_r_limits(means, ranges, char.subgroup_size)
            return (
                limits.xbar_limits.center_line,
                limits.xbar_limits.ucl,
                limits.xbar_limits.lcl,
            )
