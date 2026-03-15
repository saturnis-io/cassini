"""Control limit calculation service for SPC characteristics.

PURPOSE:
    Provides the ControlLimitService for computing, persisting, and managing
    Shewhart control limits from historical sample data. This is the heart of
    Phase I analysis -- establishing trial control limits from baseline data and
    iteratively excluding out-of-control subgroups to arrive at limits that
    represent the in-control process.

STANDARDS:
    - AIAG SPC Manual, 2nd Ed. (2005), Chapter II: Trial Control Limits and
      Phase I analysis procedure
    - Montgomery (2019), "Introduction to Statistical Quality Control", 8th Ed.,
      Section 6.3: Phase I Analysis of Control Charts
    - ASTM E2587-16: Standard Practice for Use of Control Charts
    - Wheeler & Chambers (1992), "Understanding Statistical Process Control"

ARCHITECTURE:
    This module sits between the low-level sigma estimators (utils/statistics.py)
    and the real-time SPC pipeline (core/engine/spc_engine.py). It is invoked:
      - Explicitly via the API (POST /characteristics/{id}/recalculate-limits)
      - Implicitly when the SPC engine processes a sample with no stored limits
    It publishes ControlLimitsUpdatedEvent to the EventBus, which triggers
    rolling window invalidation and WebSocket notifications.

Calculation methods (automatically selected by subgroup size):
    - n=1:    Moving Range (MR-bar / d2, d2=1.128 for span=2)
    - n=2-10: R-bar / d2 method (range-based within-subgroup estimator)
    - n>10:   S-bar / c4 method (std-dev-based within-subgroup estimator)
    Ref: AIAG SPC Manual, 2nd Ed., Chapter II;
         Montgomery (2019), Section 6.4.

OOC Exclusion (Phase I Trial Control Limits):
    When ``exclude_ooc=True``, this module implements the **iterative** OOC
    subgroup exclusion procedure specified in the AIAG SPC Manual (2nd Ed.,
    Chapter II) and Montgomery (2019), Section 6.3.

    The procedure works as follows:
      1. Compute trial control limits from all currently-included subgroups.
      2. Identify any included subgroups whose mean falls outside the trial UCL/LCL.
      3. If new OOC subgroups were found, exclude them and go back to step 1.
      4. Repeat until convergence (no new exclusions in an iteration).

    A single-pass approach (compute once, exclude, recompute once) is
    **insufficient** because the tighter limits from the first recomputation
    may reveal additional subgroups that are now out of control. The AIAG
    manual's Phase I procedure explicitly requires repeating until no
    further points fall outside the revised limits.

    Convergence criterion: strict inequality (> UCL or < LCL). Points exactly
    on the control limit are considered in-control per AIAG convention.

    Safety guards:
      - _OOC_MAX_ITERATIONS = 25: caps iteration cycles to prevent infinite
        loops in pathological data (e.g., oscillating exclusion sets).
      - _OOC_MIN_SUBGROUPS = 5: prevents over-exclusion that would make
        the sigma estimate unreliable.

KEY DECISIONS:
    - The user can override the auto-selected sigma method via
      characteristic.sigma_method (e.g., force S-bar/c4 for n=5).
      Defense-in-depth: incompatible overrides (e.g., moving_range for n>1)
      fall back to auto-selection with a warning log.
    - The ExplanationCollector (Show Your Work) is only attached to the
      FINAL computation pass, not intermediate OOC iteration passes, to
      show the user the formulas/values from the converged in-control set.
    - limits_calc_params is persisted as JSON on the characteristic so that
      Show Your Work can replay the exact calculation later.
"""

import json
import math
import structlog
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import numpy as np

from cassini.core.events import ControlLimitsUpdatedEvent, EventBus
from cassini.core.explain import ExplanationCollector
from cassini.utils.constants import get_c4, get_d2
from cassini.utils.statistics import (
    estimate_sigma_moving_range,
    estimate_sigma_rbar,
    estimate_sigma_sbar,
)

if TYPE_CHECKING:
    from cassini.core.engine.rolling_window import RollingWindowManager
    from cassini.db.repositories.characteristic import CharacteristicRepository
    from cassini.db.repositories.sample import SampleRepository

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Iterative OOC exclusion constants
#
# Ref: AIAG SPC Manual 2nd Ed., Chapter II -- Phase I trial control limits.
# Ref: Montgomery (2019) "Introduction to Statistical Quality Control", S6.3.
#
# _OOC_MAX_ITERATIONS: Upper bound on iteration cycles. In practice,
#   convergence happens in 2-4 iterations. The cap is a safety net against
#   pathological data that oscillates (e.g., alternating exclusion sets).
#
# _OOC_MIN_SUBGROUPS: Minimum number of subgroups that must remain after
#   exclusion. Below this threshold the sigma estimate becomes unreliable
#   and the iteration halts with a warning. The value of 5 is a pragmatic
#   floor; the AIAG manual recommends 25 subgroups for Phase I, but we
#   protect against over-exclusion rather than enforcing the full 25 here
#   (the caller's min_samples parameter governs the initial requirement).
# ---------------------------------------------------------------------------
_OOC_MAX_ITERATIONS: int = 25
_OOC_MIN_SUBGROUPS: int = 5


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
        ooc_iterations: Number of iterative OOC exclusion passes performed
            (0 when exclude_ooc is False; 1+ when iterative exclusion ran).
    """

    center_line: float
    ucl: float
    lcl: float
    sigma: float
    method: str
    sample_count: int
    excluded_count: int
    calculated_at: datetime
    ooc_iterations: int = 0


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
            from cassini.core.events import event_bus as global_bus

            self._event_bus = global_bus
        else:
            self._event_bus = event_bus

    async def calculate_limits(
        self,
        characteristic_id: int,
        exclude_ooc: bool = False,
        min_samples: int = 25,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        last_n: int | None = None,
        collector: ExplanationCollector | None = None,
        material_id: int | None = None,
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

        # Fetch samples (optionally filtered by date range and material)
        all_samples = await self._sample_repo.get_by_characteristic(
            characteristic_id,
            start_date=start_date,
            end_date=end_date,
            material_id=material_id,
        )

        # ---------------------------------------------------------------
        # Phase 0: Pre-filter samples marked as excluded in the database.
        # These are samples the user has explicitly flagged (e.g., known
        # assignable causes already investigated).
        # ---------------------------------------------------------------
        if exclude_ooc:
            samples = [s for s in all_samples if not s.is_excluded]
            db_excluded_count = len(all_samples) - len(samples)
        else:
            samples = all_samples
            db_excluded_count = 0

        # Take only the most recent N samples if requested
        if last_n is not None and last_n > 0 and len(samples) > last_n:
            samples = samples[-last_n:]

        # Check minimum sample requirement
        if len(samples) < min_samples:
            raise ValueError(
                f"Insufficient samples for calculation: {len(samples)} < {min_samples}"
            )

        # Select calculation method (respects user override if set)
        subgroup_size = characteristic.subgroup_size
        method = self._select_method(subgroup_size, characteristic.sigma_method)

        # ---------------------------------------------------------------
        # Phase I: Iterative OOC Subgroup Exclusion
        #
        # AIAG SPC Manual 2nd Ed., Chapter II -- Trial Control Limits:
        #   "If out-of-control points can be attributed to assignable
        #    causes, they should be eliminated and new trial limits
        #    computed from the remaining subgroups. This process is
        #    repeated until all remaining points are in control."
        #
        # Montgomery (2019), S6.3 -- Phase I Analysis:
        #   "After removing out-of-control points and recomputing the
        #    trial limits, some of the remaining points may now plot
        #    beyond the new limits. [...] Continue until all points
        #    plot within the control limits."
        #
        # Algorithm:
        #   1. Compute trial limits from currently-included subgroups.
        #   2. Compute each included subgroup's plotted value (mean for
        #      X-bar charts, individual value for I charts).
        #   3. Identify subgroups whose plotted value exceeds UCL or
        #      falls below LCL.
        #   4. If new OOC subgroups found AND enough subgroups remain:
        #      - Exclude them from the working set.
        #      - Return to step 1.
        #   5. Converge when no new OOC subgroups are identified, or
        #      halt if the safety cap (_OOC_MAX_ITERATIONS) is reached,
        #      or halt if remaining subgroups < _OOC_MIN_SUBGROUPS.
        #
        # When exclude_ooc is False, this entire block is skipped and
        # the calculation proceeds with all samples (single computation).
        # ---------------------------------------------------------------

        ooc_iterations = 0
        iterative_excluded_count = 0

        if exclude_ooc:
            # Working set: the samples we compute limits from.
            # We iterate on this list, shrinking it as OOC subgroups are
            # identified.  The original `samples` list is NOT mutated.
            working_samples = list(samples)

            for iteration in range(1, _OOC_MAX_ITERATIONS + 1):
                ooc_iterations = iteration

                # --- Step 1: Compute trial limits from working set ---
                # (No ExplanationCollector on intermediate iterations --
                #  we only instrument the final computation below.)
                trial_cl, trial_ucl, trial_lcl, trial_sigma = (
                    self._compute_limits_for_method(
                        method, working_samples, subgroup_size, collector=None
                    )
                )

                # --- Step 2-3: Identify OOC subgroups ---
                # A subgroup is OOC if its plotted value (subgroup mean
                # for X-bar charts, individual value for I charts) falls
                # strictly outside the control limits.
                #
                # Mathematical criterion (3-sigma limits):
                #   OOC iff  x_bar_i > UCL  or  x_bar_i < LCL
                #   where UCL = \bar{\bar{x}} + 3\sigma_{\bar{x}}
                #         LCL = \bar{\bar{x}} - 3\sigma_{\bar{x}}
                newly_ooc_indices: list[int] = []
                for idx, sample in enumerate(working_samples):
                    plotted_value = self._get_subgroup_mean(sample)
                    if plotted_value is None:
                        continue
                    # Strict inequality: points exactly on the limit are
                    # considered in-control per AIAG convention.
                    if plotted_value > trial_ucl or plotted_value < trial_lcl:
                        newly_ooc_indices.append(idx)

                # --- Step 4: Convergence check ---
                if not newly_ooc_indices:
                    # No new OOC points -- limits have converged.
                    logger.debug(
                        "ooc_iteration_converged",
                        iteration=iteration,
                        remaining_subgroups=len(working_samples),
                        total_excluded=iterative_excluded_count,
                    )
                    break

                # Check minimum subgroup floor BEFORE excluding.
                remaining_after = len(working_samples) - len(newly_ooc_indices)
                if remaining_after < _OOC_MIN_SUBGROUPS:
                    logger.warning(
                        "ooc_iteration_halted_min_subgroups",
                        iteration=iteration,
                        remaining_subgroups=len(working_samples),
                        would_exclude=len(newly_ooc_indices),
                        remaining_after=remaining_after,
                        min_required=_OOC_MIN_SUBGROUPS,
                        msg=(
                            "Iterative OOC exclusion halted: excluding "
                            f"{len(newly_ooc_indices)} more subgroups would "
                            f"leave only {remaining_after}, below the minimum "
                            f"floor of {_OOC_MIN_SUBGROUPS}."
                        ),
                    )
                    break

                # Exclude newly-identified OOC subgroups (remove by index,
                # highest-first to preserve index validity).
                for idx in sorted(newly_ooc_indices, reverse=True):
                    working_samples.pop(idx)
                iterative_excluded_count += len(newly_ooc_indices)

                logger.debug(
                    "ooc_iteration_excluded",
                    iteration=iteration,
                    newly_excluded=len(newly_ooc_indices),
                    remaining_subgroups=len(working_samples),
                    total_excluded=iterative_excluded_count,
                )
            else:
                # The for-loop completed without break -- we hit the cap.
                logger.warning(
                    "ooc_iteration_cap_reached",
                    max_iterations=_OOC_MAX_ITERATIONS,
                    remaining_subgroups=len(working_samples),
                    total_excluded=iterative_excluded_count,
                    msg=(
                        f"Iterative OOC exclusion did not converge within "
                        f"{_OOC_MAX_ITERATIONS} iterations. Using limits from "
                        f"the last iteration. This may indicate pathological "
                        f"data or a process with no stable in-control period."
                    ),
                )

            # Update samples to the final working set for the instrumented
            # computation below.
            samples = working_samples

        # ---------------------------------------------------------------
        # Final computation: calculate limits from the (possibly reduced)
        # sample set.  This pass includes the ExplanationCollector so
        # "Show Your Work" captures the formulas and values from the
        # converged in-control subgroup set.
        # ---------------------------------------------------------------
        center_line, ucl, lcl, sigma = self._compute_limits_for_method(
            method, samples, subgroup_size, collector=collector
        )

        total_excluded = db_excluded_count + iterative_excluded_count

        return CalculationResult(
            center_line=center_line,
            ucl=ucl,
            lcl=lcl,
            sigma=sigma,
            method=method,
            sample_count=len(samples),
            excluded_count=total_excluded,
            calculated_at=datetime.now(timezone.utc),
            ooc_iterations=ooc_iterations,
        )

    async def recalculate_and_persist(
        self,
        characteristic_id: int,
        exclude_ooc: bool = False,
        min_samples: int = 25,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        last_n: int | None = None,
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
            ValueError: If limits are frozen (Phase II mode)

        Example:
            >>> result = await service.recalculate_and_persist(
            ...     characteristic_id=1,
            ...     exclude_ooc=False,
            ...     min_samples=30
            ... )
            >>> print(f"Persisted UCL: {result.ucl}, LCL: {result.lcl}")
        """
        # Guard: Phase II mode — frozen limits cannot be recalculated
        char_check = await self._char_repo.get_by_id(characteristic_id)
        if char_check is not None and getattr(char_check, "limits_frozen", False) is True:
            raise ValueError(
                "Control limits are frozen (Phase II). "
                "Unfreeze limits before recalculating."
            )

        # Calculate limits
        result = await self.calculate_limits(
            characteristic_id=characteristic_id,
            exclude_ooc=exclude_ooc,
            min_samples=min_samples,
            start_date=start_date,
            end_date=end_date,
            last_n=last_n,
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

        # Store the calculation parameters so Show Your Work can replay exactly
        characteristic.limits_calc_params = json.dumps({
            "exclude_ooc": exclude_ooc,
            "min_samples": min_samples,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "last_n": last_n,
        })

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
            "publishing_control_limits_updated",
            characteristic_id=characteristic_id,
            method=result.method,
            sample_count=result.sample_count,
        )

        await self._event_bus.publish(event)

        return result

    def _select_method(self, subgroup_size: int, sigma_method: str | None = None) -> str:
        """Select calculation method based on subgroup size or user override.

        If sigma_method is set (not None), returns it directly.
        Otherwise, auto-selects based on subgroup size:
        - n=1: Moving range method (I-MR chart)
        - n=2-10: R-bar / d2 method (X-bar R chart)
        - n>10: S-bar / c4 method (X-bar S chart)

        Args:
            subgroup_size: Size of subgroups
            sigma_method: User-specified method override (None = auto)

        Returns:
            Method name string

        Example:
            >>> service._select_method(1)
            'moving_range'
            >>> service._select_method(5)
            'r_bar_d2'
            >>> service._select_method(5, 's_bar_c4')
            's_bar_c4'
        """
        if sigma_method:
            # Defense-in-depth: fall back to auto if mismatch
            if sigma_method == "moving_range" and subgroup_size > 1:
                logger.warning(
                    "sigma_method_subgroup_mismatch",
                    sigma_method=sigma_method,
                    subgroup_size=subgroup_size,
                    action="falling_back_to_auto",
                )
            elif sigma_method in ("r_bar_d2", "s_bar_c4") and subgroup_size == 1:
                logger.warning(
                    "sigma_method_subgroup_mismatch",
                    sigma_method=sigma_method,
                    subgroup_size=subgroup_size,
                    action="falling_back_to_auto",
                )
            else:
                return sigma_method
        if subgroup_size == 1:
            return "moving_range"
        elif subgroup_size <= 10:
            return "r_bar_d2"
        else:
            return "s_bar_c4"

    def _compute_limits_for_method(
        self,
        method: str,
        samples: list,
        subgroup_size: int,
        collector: ExplanationCollector | None = None,
    ) -> tuple[float, float, float, float]:
        """Dispatch to the appropriate limit calculation method.

        This is a thin routing layer that keeps the iterative OOC loop
        decoupled from the individual calculation implementations.

        Args:
            method: One of "moving_range", "r_bar_d2", "s_bar_c4".
            samples: List of Sample objects with measurements.
            subgroup_size: Nominal subgroup size.
            collector: Optional ExplanationCollector for Show Your Work.

        Returns:
            Tuple of (center_line, ucl, lcl, sigma).
        """
        if method == "moving_range":
            return self._calculate_moving_range(samples, collector=collector)
        elif method == "r_bar_d2":
            return self._calculate_r_bar(
                samples, subgroup_size, collector=collector
            )
        else:  # s_bar_c4
            return self._calculate_s_bar(
                samples, subgroup_size, collector=collector
            )

    @staticmethod
    def _get_subgroup_mean(sample) -> float | None:
        """Compute the plotted value (subgroup mean) for a single sample.

        For subgrouped data (n > 1), this is the arithmetic mean of the
        measurements within the subgroup.  For individuals data (n = 1),
        this is simply the single measurement value.

        This is the value plotted on the X-bar (or I) chart, and the
        value compared against UCL/LCL during OOC identification.

        Args:
            sample: A Sample object with a ``measurements`` attribute.

        Returns:
            The subgroup mean as a float, or None if the sample has no
            measurements.
        """
        measurement_values = [m.value for m in sample.measurements]
        if not measurement_values:
            return None
        return float(np.mean(measurement_values))

    def _calculate_moving_range(
        self,
        samples: list,
        collector: ExplanationCollector | None = None,
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
            collector: Optional ExplanationCollector for Show Your Work

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
                values.append(float(np.mean(measurement_values)))

        if collector:
            collector.input("n (subgroup size)", 1)
            collector.input("k (samples)", len(values))

        # Calculate center line (X-bar)
        center_line = float(np.mean(values))

        if collector:
            collector.input("\u0078\u0304", round(center_line, 6))
            collector.step(
                label="X-bar (Grand Mean)",
                formula_latex=r"\bar{x} = \frac{\sum x_i}{k}",
                substitution_latex=(
                    r"\bar{x} = \frac{"
                    + str(round(sum(values), 6))
                    + r"}{"
                    + str(len(values))
                    + r"}"
                ),
                result=center_line,
                note="Mean of individual values",
            )

        # Estimate sigma using moving range
        sigma = estimate_sigma_moving_range(values, span=2)

        if collector:
            # Compute moving ranges for step instrumentation
            arr = np.asarray(values, dtype=np.float64)
            moving_ranges = np.abs(np.diff(arr))
            mr_bar = float(np.mean(moving_ranges))
            d2 = get_d2(2)

            collector.step(
                label="MR-bar (Mean Moving Range)",
                formula_latex=r"\overline{MR} = \frac{\sum |x_i - x_{i-1}|}{k-1}",
                substitution_latex=(
                    r"\overline{MR} = \frac{"
                    + str(round(float(np.sum(moving_ranges)), 6))
                    + r"}{"
                    + str(len(moving_ranges))
                    + r"}"
                ),
                result=mr_bar,
                note="Mean of consecutive absolute differences (span=2)",
            )
            collector.step(
                label="d2 constant (span=2)",
                formula_latex=r"d_2 = 1.128 \text{ (for span } n=2\text{)}",
                substitution_latex=r"d_2 = 1.128",
                result=d2,
                note="From ASTM E2587 constants table",
            )
            collector.step(
                label="\u03c3 (Process Sigma)",
                formula_latex=r"\sigma = \frac{\overline{MR}}{d_2}",
                substitution_latex=(
                    r"\sigma = \frac{"
                    + str(round(mr_bar, 6))
                    + r"}{"
                    + str(d2)
                    + r"}"
                ),
                result=sigma,
            )

        # Calculate control limits (3-sigma)
        ucl = center_line + 3 * sigma
        lcl = center_line - 3 * sigma

        if collector:
            collector.step(
                label="UCL (Upper Control Limit)",
                formula_latex=r"UCL = \bar{x} + 3\sigma",
                substitution_latex=(
                    r"UCL = "
                    + str(round(center_line, 6))
                    + r" + 3 \times "
                    + str(round(sigma, 6))
                ),
                result=ucl,
            )
            collector.step(
                label="LCL (Lower Control Limit)",
                formula_latex=r"LCL = \bar{x} - 3\sigma",
                substitution_latex=(
                    r"LCL = "
                    + str(round(center_line, 6))
                    + r" - 3 \times "
                    + str(round(sigma, 6))
                ),
                result=lcl,
            )

        return center_line, ucl, lcl, sigma

    def _calculate_r_bar(
        self,
        samples: list,
        subgroup_size: int,
        collector: ExplanationCollector | None = None,
    ) -> tuple[float, float, float, float]:
        """Calculate limits using R-bar/d2 method.

        Uses the range-based method for subgroup sizes 2-10:
        - X-bar = mean of subgroup means
        - R-bar = mean of subgroup ranges
        - sigma = R-bar / d2  (process standard deviation)
        - sigma_xbar = sigma / sqrt(n)  (standard error of the mean)
        - UCL = X-bar + 3 * sigma_xbar
        - LCL = X-bar - 3 * sigma_xbar

        The returned sigma is the process standard deviation (not sigma_xbar),
        which is needed for Mode A/B variable subgroup calculations.

        Args:
            samples: List of Sample objects with measurements
            subgroup_size: Size of subgroups
            collector: Optional ExplanationCollector for Show Your Work

        Returns:
            Tuple of (center_line, ucl, lcl, sigma)
        """
        # Calculate subgroup means and ranges
        subgroup_means = []
        subgroup_ranges = []

        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values:
                arr = np.asarray(measurement_values, dtype=np.float64)
                subgroup_means.append(float(np.mean(arr)))
                subgroup_ranges.append(float(np.ptp(arr)))

        if collector:
            collector.input("n (subgroup size)", subgroup_size)
            collector.input("k (subgroups)", len(subgroup_means))

        # Calculate center line (X-double-bar)
        center_line = float(np.mean(subgroup_means))

        if collector:
            collector.input("\u0078\u0304\u0304", round(center_line, 6))
            collector.step(
                label="X-double-bar (Grand Mean)",
                formula_latex=r"\bar{\bar{x}} = \frac{\sum \bar{x}_i}{k}",
                substitution_latex=(
                    r"\bar{\bar{x}} = \frac{"
                    + str(round(sum(subgroup_means), 6))
                    + r"}{"
                    + str(len(subgroup_means))
                    + r"}"
                ),
                result=center_line,
                note="Mean of subgroup means",
            )

        # Estimate process sigma using R-bar method
        sigma = estimate_sigma_rbar(subgroup_ranges, subgroup_size)

        if collector:
            r_bar = float(np.mean(subgroup_ranges))
            d2 = get_d2(subgroup_size)

            collector.step(
                label="R-bar (Mean Range)",
                formula_latex=r"\bar{R} = \frac{\sum R_i}{k}",
                substitution_latex=(
                    r"\bar{R} = \frac{"
                    + str(round(sum(subgroup_ranges), 6))
                    + r"}{"
                    + str(len(subgroup_ranges))
                    + r"}"
                ),
                result=r_bar,
                note="Mean of subgroup ranges",
            )
            collector.step(
                label="d2 constant",
                formula_latex=r"d_2(n=" + str(subgroup_size) + r")",
                substitution_latex=r"d_2 = " + str(d2),
                result=d2,
                note="From ASTM E2587 constants table",
            )
            collector.step(
                label="\u03c3 (Process Sigma)",
                formula_latex=r"\sigma = \frac{\bar{R}}{d_2}",
                substitution_latex=(
                    r"\sigma = \frac{"
                    + str(round(r_bar, 6))
                    + r"}{"
                    + str(d2)
                    + r"}"
                ),
                result=sigma,
            )

        # Control limits use sigma of the mean (sigma / sqrt(n))
        sigma_xbar = sigma / math.sqrt(subgroup_size)

        if collector:
            collector.step(
                label="sigma_xbar (Sigma of the Mean)",
                formula_latex=r"\sigma_{\bar{x}} = \frac{\sigma}{\sqrt{n}}",
                substitution_latex=(
                    r"\sigma_{\bar{x}} = \frac{"
                    + str(round(sigma, 6))
                    + r"}{\sqrt{"
                    + str(subgroup_size)
                    + r"}}"
                ),
                result=sigma_xbar,
            )

        ucl = center_line + 3 * sigma_xbar
        lcl = center_line - 3 * sigma_xbar

        if collector:
            collector.step(
                label="UCL (Upper Control Limit)",
                formula_latex=r"UCL = \bar{\bar{x}} + 3\sigma_{\bar{x}}",
                substitution_latex=(
                    r"UCL = "
                    + str(round(center_line, 6))
                    + r" + 3 \times "
                    + str(round(sigma_xbar, 6))
                ),
                result=ucl,
            )
            collector.step(
                label="LCL (Lower Control Limit)",
                formula_latex=r"LCL = \bar{\bar{x}} - 3\sigma_{\bar{x}}",
                substitution_latex=(
                    r"LCL = "
                    + str(round(center_line, 6))
                    + r" - 3 \times "
                    + str(round(sigma_xbar, 6))
                ),
                result=lcl,
            )

        return center_line, ucl, lcl, sigma

    def _calculate_s_bar(
        self,
        samples: list,
        subgroup_size: int,
        collector: ExplanationCollector | None = None,
    ) -> tuple[float, float, float, float]:
        """Calculate limits using S-bar/c4 method.

        Uses the standard deviation method for subgroup sizes > 10:
        - X-bar = mean of subgroup means
        - S-bar = mean of subgroup standard deviations
        - sigma = S-bar / c4  (process standard deviation)
        - sigma_xbar = sigma / sqrt(n)  (standard error of the mean)
        - UCL = X-bar + 3 * sigma_xbar
        - LCL = X-bar - 3 * sigma_xbar

        The returned sigma is the process standard deviation (not sigma_xbar),
        which is needed for Mode A/B variable subgroup calculations.

        Args:
            samples: List of Sample objects with measurements
            subgroup_size: Size of subgroups
            collector: Optional ExplanationCollector for Show Your Work

        Returns:
            Tuple of (center_line, ucl, lcl, sigma)
        """
        # Calculate subgroup means and standard deviations
        subgroup_means = []
        subgroup_stds = []

        for sample in samples:
            measurement_values = [m.value for m in sample.measurements]
            if measurement_values and len(measurement_values) > 1:
                arr = np.asarray(measurement_values, dtype=np.float64)
                subgroup_means.append(float(np.mean(arr)))
                subgroup_stds.append(float(np.std(arr, ddof=1)))

        if collector:
            collector.input("n (subgroup size)", subgroup_size)
            collector.input("k (subgroups)", len(subgroup_means))

        # Calculate center line (X-double-bar)
        center_line = float(np.mean(subgroup_means))

        if collector:
            collector.input("\u0078\u0304\u0304", round(center_line, 6))
            collector.step(
                label="X-double-bar (Grand Mean)",
                formula_latex=r"\bar{\bar{x}} = \frac{\sum \bar{x}_i}{k}",
                substitution_latex=(
                    r"\bar{\bar{x}} = \frac{"
                    + str(round(sum(subgroup_means), 6))
                    + r"}{"
                    + str(len(subgroup_means))
                    + r"}"
                ),
                result=center_line,
                note="Mean of subgroup means",
            )

        # Estimate process sigma using S-bar method
        sigma = estimate_sigma_sbar(subgroup_stds, subgroup_size)

        if collector:
            s_bar = float(np.mean(subgroup_stds))
            c4 = get_c4(subgroup_size)

            collector.step(
                label="S-bar (Mean Standard Deviation)",
                formula_latex=r"\bar{S} = \frac{\sum S_i}{k}",
                substitution_latex=(
                    r"\bar{S} = \frac{"
                    + str(round(sum(subgroup_stds), 6))
                    + r"}{"
                    + str(len(subgroup_stds))
                    + r"}"
                ),
                result=s_bar,
                note="Mean of subgroup standard deviations",
            )
            collector.step(
                label="c4 constant",
                formula_latex=r"c_4(n=" + str(subgroup_size) + r")",
                substitution_latex=r"c_4 = " + str(c4),
                result=c4,
                note="From ASTM E2587 constants table",
            )
            collector.step(
                label="\u03c3 (Process Sigma)",
                formula_latex=r"\sigma = \frac{\bar{S}}{c_4}",
                substitution_latex=(
                    r"\sigma = \frac{"
                    + str(round(s_bar, 6))
                    + r"}{"
                    + str(c4)
                    + r"}"
                ),
                result=sigma,
            )

        # Control limits use sigma of the mean (sigma / sqrt(n))
        sigma_xbar = sigma / math.sqrt(subgroup_size)

        if collector:
            collector.step(
                label="sigma_xbar (Sigma of the Mean)",
                formula_latex=r"\sigma_{\bar{x}} = \frac{\sigma}{\sqrt{n}}",
                substitution_latex=(
                    r"\sigma_{\bar{x}} = \frac{"
                    + str(round(sigma, 6))
                    + r"}{\sqrt{"
                    + str(subgroup_size)
                    + r"}}"
                ),
                result=sigma_xbar,
            )

        ucl = center_line + 3 * sigma_xbar
        lcl = center_line - 3 * sigma_xbar

        if collector:
            collector.step(
                label="UCL (Upper Control Limit)",
                formula_latex=r"UCL = \bar{\bar{x}} + 3\sigma_{\bar{x}}",
                substitution_latex=(
                    r"UCL = "
                    + str(round(center_line, 6))
                    + r" + 3 \times "
                    + str(round(sigma_xbar, 6))
                ),
                result=ucl,
            )
            collector.step(
                label="LCL (Lower Control Limit)",
                formula_latex=r"LCL = \bar{\bar{x}} - 3\sigma_{\bar{x}}",
                substitution_latex=(
                    r"LCL = "
                    + str(round(center_line, 6))
                    + r" - 3 \times "
                    + str(round(sigma_xbar, 6))
                ),
                result=lcl,
            )

        return center_line, ucl, lcl, sigma
