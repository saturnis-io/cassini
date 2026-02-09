"""SPC Engine orchestrator for processing samples through the complete SPC pipeline.

This module provides the main SPCEngine class that coordinates sample processing,
rule evaluation, violation creation, and statistics calculation.
"""

import structlog
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

logger = structlog.get_logger(__name__)

# Default number of recent samples used for auto-limit calculation.
# Override via CharacteristicConfig or recalculate-limits last_n param.
# TODO: Make this configurable per-characteristic via a field on the
# characteristic_config model (e.g. limit_window_size) with this as default.
DEFAULT_LIMIT_WINDOW_SIZE = 100


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
        return self._validate_measurements_with_values(
            subgroup_mode=char.subgroup_mode,
            subgroup_size=char.subgroup_size,
            min_measurements=char.min_measurements,
            warn_below_count=char.warn_below_count,
            measurements=measurements,
        )

    def _validate_measurements_with_values(
        self,
        subgroup_mode: str,
        subgroup_size: int,
        min_measurements: int | None,
        warn_below_count: int | None,
        measurements: list[float],
    ) -> tuple[bool, bool]:
        """Validate measurements against subgroup configuration values.

        Args:
            subgroup_mode: Subgroup handling mode
            subgroup_size: Expected subgroup size
            min_measurements: Minimum measurements required
            warn_below_count: Threshold for undersized warning
            measurements: List of measurement values

        Returns:
            Tuple of (is_valid, is_undersized)

        Raises:
            ValueError: If measurement count is below min_measurements
            ValueError: If Mode C and measurements exceed subgroup_size
        """
        actual_n = len(measurements)

        # Check minimum measurements requirement (default to 1 if not set)
        min_required = min_measurements if min_measurements is not None else 1
        if actual_n < min_required:
            raise ValueError(
                f"Insufficient measurements: got {actual_n}, "
                f"minimum required is {min_required}"
            )

        # For NOMINAL_TOLERANCE mode, enforce max subgroup_size
        if subgroup_mode == SubgroupMode.NOMINAL_TOLERANCE.value:
            if actual_n > subgroup_size:
                raise ValueError(
                    f"Too many measurements for NOMINAL_TOLERANCE mode: "
                    f"got {actual_n}, maximum is {subgroup_size}"
                )

        # Determine if undersized
        threshold = warn_below_count or subgroup_size
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
        return self._compute_sample_statistics_with_values(
            subgroup_mode=char.subgroup_mode,
            stored_sigma=char.stored_sigma,
            stored_center_line=char.stored_center_line,
            measurements=measurements,
            actual_n=actual_n,
        )

    def _compute_sample_statistics_with_values(
        self,
        subgroup_mode: str,
        stored_sigma: float | None,
        stored_center_line: float | None,
        measurements: list[float],
        actual_n: int,
    ) -> dict:
        """Compute mode-specific statistics for a sample using extracted values.

        Args:
            subgroup_mode: Subgroup handling mode
            stored_sigma: Stored sigma value
            stored_center_line: Stored center line value
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

        if subgroup_mode == SubgroupMode.STANDARDIZED.value:
            # Mode A: Calculate Z-score
            if stored_sigma is None or stored_center_line is None:
                raise ValueError(
                    "STANDARDIZED mode requires stored_sigma and stored_center_line. "
                    "Run recalculate-limits first."
                )
            # sigma_xbar = sigma / sqrt(n)
            sigma_xbar = stored_sigma / math.sqrt(actual_n)
            z_score = (mean - stored_center_line) / sigma_xbar

        elif subgroup_mode == SubgroupMode.VARIABLE_LIMITS.value:
            # Mode B: Calculate effective limits per point
            if stored_sigma is None or stored_center_line is None:
                raise ValueError(
                    "VARIABLE_LIMITS mode requires stored_sigma and stored_center_line. "
                    "Run recalculate-limits first."
                )
            # sigma_xbar = sigma / sqrt(n)
            sigma_xbar = stored_sigma / math.sqrt(actual_n)
            effective_ucl = stored_center_line + 3 * sigma_xbar
            effective_lcl = stored_center_line - 3 * sigma_xbar

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

        # Extract ALL needed values immediately after loading to avoid lazy loading issues
        # (session operations below may expire the ORM object)
        enabled_rules = {rule.rule_id for rule in char.rules if rule.is_enabled}
        # Also extract require_acknowledgement settings per rule
        rule_require_ack = {
            rule.rule_id: rule.require_acknowledgement
            for rule in char.rules
        }
        char_subgroup_mode = char.subgroup_mode
        char_subgroup_size = char.subgroup_size
        char_min_measurements = char.min_measurements
        char_warn_below_count = char.warn_below_count
        char_ucl = char.ucl
        char_lcl = char.lcl
        char_stored_sigma = char.stored_sigma
        char_stored_center_line = char.stored_center_line

        # Step 2: Validate measurements against subgroup mode configuration
        actual_n = len(measurements)
        _, is_undersized = self._validate_measurements_with_values(
            subgroup_mode=char_subgroup_mode,
            subgroup_size=char_subgroup_size,
            min_measurements=char_min_measurements,
            warn_below_count=char_warn_below_count,
            measurements=measurements,
        )

        # Step 3: Compute mode-specific statistics
        stats = self._compute_sample_statistics_with_values(
            subgroup_mode=char_subgroup_mode,
            stored_sigma=char_stored_sigma,
            stored_center_line=char_stored_center_line,
            measurements=measurements,
            actual_n=actual_n,
        )
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
        boundaries = await self._get_zone_boundaries_with_values(
            characteristic_id=characteristic_id,
            ucl=char_ucl,
            lcl=char_lcl,
        )

        # Add sample to rolling window with mode-specific data
        window_sample = await self._window_manager.add_sample(
            char_id=characteristic_id,
            sample=sample,
            boundaries=boundaries,
            measurement_values=measurements,
            subgroup_mode=char_subgroup_mode,
            actual_n=actual_n,
            is_undersized=is_undersized,
            z_score=z_score,
            effective_ucl=effective_ucl,
            effective_lcl=effective_lcl,
            stored_sigma=char_stored_sigma,
            stored_center_line=char_stored_center_line,
        )

        # Step 5: Evaluate enabled Nelson Rules
        window = await self._window_manager.get_window(characteristic_id)

        # Check all enabled rules (enabled_rules was extracted earlier to avoid lazy loading)
        rule_results = self._rule_library.check_all(window, enabled_rules)

        # Step 6: Create violations for triggered rules
        violations = await self._create_violations(sample.id, rule_results, rule_require_ack)

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
            "publishing_sample_processed_event",
            sample_id=sample.id,
            characteristic_id=characteristic_id,
        )

        await self._event_bus.publish(event)

        return result


    async def _get_zone_boundaries_with_values(
        self,
        characteristic_id: int,
        ucl: float | None,
        lcl: float | None,
    ) -> ZoneBoundaries:
        """Get zone boundaries using pre-extracted UCL/LCL values.

        Uses provided control limits if available, otherwise calculates from
        historical data.

        Args:
            characteristic_id: ID of the characteristic
            ucl: Pre-extracted Upper Control Limit
            lcl: Pre-extracted Lower Control Limit

        Returns:
            ZoneBoundaries with all zone boundaries calculated

        Raises:
            ValueError: If no control limits available and insufficient data
        """
        # If control limits are provided, use them
        if ucl is not None and lcl is not None:
            # Calculate center line and sigma from stored limits
            center_line = (ucl + lcl) / 2
            sigma = (ucl - lcl) / 6  # UCL/LCL are typically +/- 3 sigma

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
        rule_require_ack: dict[int, bool] | None = None,
    ) -> list[ViolationInfo]:
        """Create violation records for triggered rules.

        Args:
            sample_id: ID of the sample that triggered violations
            rule_results: List of rule results from Nelson Rules evaluation
            rule_require_ack: Mapping of rule_id to require_acknowledgement setting

        Returns:
            List of ViolationInfo objects
        """
        violations = []
        if rule_require_ack is None:
            rule_require_ack = {}

        for result in rule_results:
            if not result.triggered:
                continue

            # Look up require_acknowledgement for this rule (default True)
            requires_ack = rule_require_ack.get(result.rule_id, True)

            # Create violation record through repository
            await self._violation_repo.create(
                sample_id=sample_id,
                rule_id=result.rule_id,
                rule_name=result.rule_name,
                severity=result.severity.value,
                acknowledged=False,
                requires_acknowledgement=requires_ack,
            )

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

        # Get historical samples as plain dicts to avoid lazy loading issues
        sample_data = await self._sample_repo.get_rolling_window_data(
            char_id=characteristic_id,
            window_size=DEFAULT_LIMIT_WINDOW_SIZE,
            exclude_excluded=True,
        )

        if not sample_data:
            raise ValueError(
                f"No samples available for characteristic {characteristic_id}"
            )

        # Calculate based on subgroup size
        if char.subgroup_size == 1:
            # Individuals chart (I-MR)
            values = []
            for data in sample_data:
                if data["values"]:
                    values.append(data["values"][0])

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
            for data in sample_data:
                sample_values = data["values"]
                if len(sample_values) != char.subgroup_size:
                    continue
                means.append(sum(sample_values) / len(sample_values))
                ranges.append(max(sample_values) - min(sample_values))

            if len(means) < 2:
                raise ValueError("Need at least 2 subgroups for X-bar R chart")

            limits = calculate_xbar_r_limits(means, ranges, char.subgroup_size)
            return (
                limits.xbar_limits.center_line,
                limits.xbar_limits.ucl,
                limits.xbar_limits.lcl,
            )
