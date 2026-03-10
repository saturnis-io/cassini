"""EWMA (Exponentially Weighted Moving Average) SPC engine.

PURPOSE:
    Provides EWMA chart processing for detecting small, sustained shifts in
    the process mean. The EWMA chart smooths individual observations using
    an exponential weighting scheme, giving more weight to recent data. Like
    the CUSUM, it is substantially more sensitive than Shewhart charts for
    detecting shifts of 0.5-2 sigma.

STANDARDS:
    - Roberts, S.W. (1959), "Control Chart Tests Based on Geometric Moving
      Averages", Technometrics, 1(3), pp.239-250 -- original EWMA proposal
    - Montgomery (2019), "Introduction to Statistical Quality Control",
      8th Ed., Chapter 9, Section 9.2: EWMA Control Chart
    - Lucas, J.M. & Saccucci, M.S. (1990), "Exponentially Weighted Moving
      Average Control Schemes: Properties and Enhancements", Technometrics,
      32(1), pp.1-12 -- ARL analysis and optimal lambda/L combinations
    - ASTM E2587-16, Section 9: EWMA charts

ARCHITECTURE:
    Like the CUSUM engine, the EWMA engine operates independently of the
    Shewhart SPC engine and can be invoked as standalone or supplementary.
    The EWMA statistic and control limits are persisted per-sample.

EWMA formula:
    z_n = lambda * x_n + (1 - lambda) * z_{n-1}
    z_0 = target (process mean / center line)

    Ref: Montgomery (2019), Eq. (9.16).

Time-varying (exact) control limits:
    UCL_i = target + L * sigma * sqrt((lambda/(2-lambda)) * (1 - (1-lambda)^{2i}))
    LCL_i = target - L * sigma * sqrt((lambda/(2-lambda)) * (1 - (1-lambda)^{2i}))

    The factor (1 - (1-lambda)^{2i}) starts near 0 for i=1 and converges
    to 1 as i increases. This provides tighter limits for the first ~20
    samples, correctly reflecting the lower variance of the EWMA statistic
    when the geometric weighting has not yet reached steady state.

    Ref: Montgomery (2019), Eq. (9.20)-(9.21).

Steady-state (asymptotic) control limits:
    UCL = target + L * sigma * sqrt(lambda / (2 - lambda))
    LCL = target - L * sigma * sqrt(lambda / (2 - lambda))

    Used when i is large or when time-varying limits are not desired.

KEY DECISIONS:
    - Default lambda = 0.2, L = 2.7. This combination provides good
      sensitivity for detecting shifts of 1-sigma with an in-control
      ARL of approximately 370 (comparable to Shewhart 3-sigma).
      Ref: Lucas & Saccucci (1990), Table 1.
    - Time-varying limits are used by default (sample_index > 0). The
      steady-state formula is available for backward compatibility and
      bulk chart rendering.
    - Sigma estimation uses the within-subgroup MR-bar/d2 estimator,
      consistent with the CUSUM engine and per Montgomery Ch. 9/10
      recommendation.
    - EWMA running value (z_n) is persisted on the sample record.
    - Supplementary EWMA uses rule_id 11/12 to avoid collision with
      Nelson Rule 1 and CUSUM rule_ids 9/10 in the violations table.
"""

import math
import time
import structlog
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cassini.db.repositories import (
        CharacteristicRepository,
        SampleRepository,
        ViolationRepository,
    )

logger = structlog.get_logger(__name__)


@dataclass
class EWMAProcessingResult:
    """Result of processing an EWMA sample.

    Attributes:
        sample_id: Database ID of the created sample
        characteristic_id: ID of the characteristic
        timestamp: When the sample was taken
        measurement: Raw measurement value
        ewma_value: Running EWMA value after this sample
        target: Process target value
        ucl: Upper control limit
        lcl: Lower control limit
        sigma: Process standard deviation used
        in_control: True if no violations were triggered
        violations: List of violation descriptions
        processing_time_ms: Time taken to process in milliseconds
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime
    measurement: float
    ewma_value: float
    target: float
    ucl: float
    lcl: float
    sigma: float
    in_control: bool
    violations: list[dict] = field(default_factory=list)
    processing_time_ms: float = 0.0


def calculate_ewma_limits(
    target: float,
    sigma: float,
    ewma_lambda: float,
    ewma_l: float,
    sample_index: int = 0,
) -> tuple[float, float]:
    """Calculate EWMA control limits (time-varying or steady-state).

    The variance of the EWMA statistic z_n is:
        Var(z_n) = sigma^2 * (lambda/(2-lambda)) * (1 - (1-lambda)^{2n})

    The time-varying factor (1 - (1-lambda)^{2n}) accounts for the
    startup period where the EWMA has not yet reached its steady-state
    variance. For lambda=0.2, this factor reaches 0.99 at n~20.

    Ref: Montgomery (2019), Section 9.2, Eq. (9.20)-(9.21);
         Lucas & Saccucci (1990), Technometrics, 32(1), pp.1-12.

    Steady-state (asymptotic) limits (sample_index=0):
        UCL = target + L * sigma * sqrt(lambda / (2 - lambda))
        LCL = target - L * sigma * sqrt(lambda / (2 - lambda))

    Time-varying (exact) limits (sample_index > 0):
        UCL_i = target + L * sigma * sqrt((lambda/(2-lambda)) * (1-(1-lambda)^{2i}))
        LCL_i = target - L * sigma * sqrt((lambda/(2-lambda)) * (1-(1-lambda)^{2i}))

    Args:
        target: Process target/mean (z_0 initialization value)
        sigma: Process standard deviation (within-subgroup estimate)
        ewma_lambda: Smoothing constant (0 < lambda <= 1). Smaller values
            give more weight to history; larger values emphasize recent data.
        ewma_l: Control limit width multiplier. Typically 2.7 for lambda=0.2,
            giving ARL_0 ~ 370.  Ref: Lucas & Saccucci (1990), Table 1.
        sample_index: 1-based sample index for time-varying limits.
            0 (default) returns steady-state limits for backward compatibility.

    Returns:
        Tuple of (UCL, LCL)
    """
    if sigma <= 0 or ewma_lambda <= 0 or ewma_lambda > 1:
        return (target, target)

    asymptotic_factor = ewma_lambda / (2.0 - ewma_lambda)

    if sample_index > 0:
        # Time-varying: multiply by (1 - (1 - lambda)^(2*i))
        time_factor = 1.0 - math.pow(1.0 - ewma_lambda, 2.0 * sample_index)
        limit_width = ewma_l * sigma * math.sqrt(asymptotic_factor * time_factor)
    else:
        # Steady-state (asymptotic) — backward compatible default
        limit_width = ewma_l * sigma * math.sqrt(asymptotic_factor)

    ucl = target + limit_width
    lcl = target - limit_width
    return (ucl, lcl)


def calculate_ewma_limit_arrays(
    target: float,
    sigma: float,
    ewma_lambda: float,
    ewma_l: float,
    num_samples: int,
) -> tuple[list[float], list[float]]:
    """Calculate per-point time-varying EWMA control limit arrays.

    Generates UCL and LCL values for each sample position (1-based index),
    using the exact time-varying formula. Useful for chart rendering where
    each point has its own control limits.

    Args:
        target: Process target/mean
        sigma: Process standard deviation
        ewma_lambda: Smoothing constant (0 < lambda <= 1)
        ewma_l: Control limit multiplier
        num_samples: Number of sample points to generate limits for

    Returns:
        Tuple of (ucl_values, lcl_values) where each is a list of floats
        with length num_samples.
    """
    ucl_values: list[float] = []
    lcl_values: list[float] = []

    for i in range(1, num_samples + 1):
        ucl, lcl = calculate_ewma_limits(
            target, sigma, ewma_lambda, ewma_l, sample_index=i
        )
        ucl_values.append(ucl)
        lcl_values.append(lcl)

    return ucl_values, lcl_values


def estimate_sigma_from_values(values: list[float]) -> float:
    """Estimate process sigma from individual measurement values.

    Uses the moving range method (MR-bar/d2, span=2) to estimate
    within-subgroup (short-term) sigma. This is the correct estimator
    for EWMA charts, which are designed to detect shifts from a stable
    baseline. Using overall standard deviation would inflate sigma if
    shifts already exist, making the chart LESS sensitive.

    Ref: Montgomery, "Introduction to Statistical Quality Control" 8th Ed.,
    Ch. 10: sigma should be estimated from in-control Phase I data using
    the moving range method.

    Args:
        values: List of measurement values

    Returns:
        Estimated process sigma (within-subgroup)
    """
    if len(values) < 2:
        return 0.0

    from cassini.utils.statistics import estimate_sigma_moving_range

    return estimate_sigma_moving_range(values, span=2)


async def process_ewma_sample(
    char_id: int,
    measurement: float,
    sample_repo: "SampleRepository",
    char_repo: "CharacteristicRepository",
    violation_repo: "ViolationRepository",
    batch_number: str | None = None,
    operator_id: str | None = None,
    material_id: int | None = None,
) -> EWMAProcessingResult:
    """Full EWMA sample processing pipeline.

    Steps:
    1. Load characteristic and validate EWMA configuration
    2. Load previous sample's EWMA value from DB
    3. Estimate sigma from historical data (or use stored_sigma)
    4. Calculate new EWMA value
    5. Calculate control limits
    6. Create sample with measurement and EWMA value
    7. Check for violations (EWMA outside UCL/LCL)
    8. Return result

    Args:
        char_id: Characteristic ID
        measurement: Individual measurement value
        sample_repo: Sample repository
        char_repo: Characteristic repository
        violation_repo: Violation repository
        batch_number: Optional batch identifier
        operator_id: Optional operator identifier

    Returns:
        EWMAProcessingResult with all processing data

    Raises:
        ValueError: If characteristic not found or EWMA not configured
    """
    start_time = time.perf_counter()

    # Step 1: Load characteristic
    char = await char_repo.get_with_rules(char_id)
    if char is None:
        raise ValueError(f"Characteristic {char_id} not found")

    ewma_lambda = char.ewma_lambda
    ewma_l = char.ewma_l
    target = char.cusum_target  # Reuse cusum_target as the process target

    if ewma_lambda is None:
        ewma_lambda = 0.2  # Default smoothing constant
    if ewma_l is None:
        ewma_l = 2.7  # Default control limit multiplier
    if target is None:
        # Fall back to target_value or stored_center_line
        target = char.target_value or char.stored_center_line
    if target is None:
        raise ValueError(
            f"Characteristic {char_id} has no target configured "
            f"(set cusum_target, target_value, or stored_center_line)"
        )

    # Extract rule config for violation creation
    rule_require_ack = {
        rule.rule_id: rule.require_acknowledgement
        for rule in char.rules
        if rule.is_enabled
    }

    # Step 2: Load previous sample's EWMA value and count existing samples
    prev_ewma = target  # z_0 = target (EWMA starts at process mean)

    recent_samples = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=1, exclude_excluded=True
    )
    if recent_samples:
        prev_sample = recent_samples[-1]
        if prev_sample.ewma_value is not None:
            prev_ewma = prev_sample.ewma_value

    # Count total non-excluded samples to determine 1-based index for this new sample
    from sqlalchemy import select as sa_select, func as sa_func
    from cassini.db.models.sample import Sample as SampleModel

    count_stmt = sa_select(sa_func.count()).select_from(SampleModel).where(
        SampleModel.char_id == char_id,
        SampleModel.is_excluded == False,  # noqa: E712
    )
    existing_count = (await sample_repo.session.execute(count_stmt)).scalar_one()
    # This new sample will be the (existing_count + 1)-th non-excluded sample
    sample_index = existing_count + 1

    # Step 3: Estimate sigma
    # Use stored_sigma if available, otherwise estimate from historical data
    sigma = char.stored_sigma
    if sigma is None or sigma <= 0:
        # Get historical measurements for sigma estimation
        window_data = await sample_repo.get_rolling_window_data(
            char_id=char_id, window_size=100, exclude_excluded=True
        )
        all_values = []
        for wd in window_data:
            all_values.extend(wd["values"])
        # Include the current measurement
        all_values.append(measurement)
        sigma = estimate_sigma_from_values(all_values)

    if sigma <= 0:
        sigma = 1.0  # Fallback to prevent division by zero

    # Step 4: Calculate new EWMA value
    # z_n = lambda * x_n + (1 - lambda) * z_{n-1}
    # Ref: Montgomery (2019), Section 9.2, Eq. (9.16)
    # The EWMA is a geometrically weighted average of all past observations:
    #   z_n = lambda * sum_{j=0}^{n-1} (1-lambda)^j * x_{n-j} + (1-lambda)^n * z_0
    # Recent observations receive exponentially more weight. For lambda=0.2,
    # the most recent observation gets weight 0.2, the previous gets 0.16,
    # etc. After ~13 observations, each additional point contributes < 1%.
    ewma_value = ewma_lambda * measurement + (1.0 - ewma_lambda) * prev_ewma

    # Step 5: Calculate time-varying control limits for this sample position
    ucl, lcl = calculate_ewma_limits(
        target, sigma, ewma_lambda, ewma_l, sample_index=sample_index
    )

    # Step 6: Create sample with measurement and EWMA value
    sample = await sample_repo.create_with_measurements(
        char_id=char_id,
        values=[measurement],
        batch_number=batch_number,
        operator_id=operator_id,
        material_id=material_id,
    )

    # Update the sample with EWMA running value
    sample.ewma_value = ewma_value
    await sample_repo.session.flush()

    # Step 7: Check for violations
    violations = []

    if ewma_value > ucl:
        requires_ack = rule_require_ack.get(1, True)
        await violation_repo.create(
            sample_id=sample.id,
            char_id=char_id,
            rule_id=1,
            rule_name="EWMA Above UCL",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=requires_ack,
        )
        violations.append({
            "rule_id": 1,
            "rule_name": "EWMA Above UCL",
            "severity": "CRITICAL",
            "message": f"EWMA = {ewma_value:.4f} exceeds UCL = {ucl:.4f}",
        })

    if ewma_value < lcl:
        requires_ack = rule_require_ack.get(1, True)
        await violation_repo.create(
            sample_id=sample.id,
            char_id=char_id,
            rule_id=1,
            rule_name="EWMA Below LCL",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=requires_ack,
        )
        violations.append({
            "rule_id": 1,
            "rule_name": "EWMA Below LCL",
            "severity": "CRITICAL",
            "message": f"EWMA = {ewma_value:.4f} below LCL = {lcl:.4f}",
        })

    end_time = time.perf_counter()
    processing_time_ms = (end_time - start_time) * 1000

    return EWMAProcessingResult(
        sample_id=sample.id,
        characteristic_id=char_id,
        timestamp=sample.timestamp,
        measurement=measurement,
        ewma_value=ewma_value,
        target=target,
        ucl=ucl,
        lcl=lcl,
        sigma=sigma,
        in_control=len(violations) == 0,
        violations=violations,
        processing_time_ms=processing_time_ms,
    )


async def process_ewma_supplementary(
    sample_id: int,
    char: object,
    measurement: float,
    sample_repo: "SampleRepository",
    violation_repo: "ViolationRepository",
) -> None:
    """Run supplementary EWMA analysis on an already-created sample.

    Updates the sample's ewma_value cache column and creates EWMA-specific
    violations if thresholds are exceeded. Called after standard SPC
    processing when EWMA params are configured.
    """
    ewma_lambda = char.ewma_lambda if char.ewma_lambda is not None else 0.2
    ewma_l = char.ewma_l if char.ewma_l is not None else 2.7
    target = char.cusum_target or char.target_value or char.stored_center_line
    if target is None:
        logger.warning("ewma_supplementary_no_target", char_id=char.id)
        return

    sigma = char.stored_sigma
    if sigma is None or sigma <= 0:
        window_data = await sample_repo.get_rolling_window_data(
            char_id=char.id, window_size=100, exclude_excluded=True
        )
        all_values = []
        for wd in window_data:
            all_values.extend(wd["values"])
        sigma = estimate_sigma_from_values(all_values) if len(all_values) >= 2 else 1.0
    if sigma <= 0:
        sigma = 1.0

    # Load previous EWMA value
    prev_ewma = target
    recent = await sample_repo.get_rolling_window(
        char_id=char.id, window_size=2, exclude_excluded=True
    )
    for s in recent:
        if s.id != sample_id and s.ewma_value is not None:
            prev_ewma = s.ewma_value
            break

    ewma_value = ewma_lambda * measurement + (1.0 - ewma_lambda) * prev_ewma

    # Count total samples for time-varying limits
    from sqlalchemy import select as sa_select, func as sa_func, update
    from cassini.db.models.sample import Sample as SampleModel

    count_stmt = sa_select(sa_func.count()).select_from(SampleModel).where(
        SampleModel.char_id == char.id,
        SampleModel.is_excluded == False,  # noqa: E712
    )
    total = (await sample_repo.session.execute(count_stmt)).scalar_one()

    ucl, lcl = calculate_ewma_limits(target, sigma, ewma_lambda, ewma_l, sample_index=total)

    # Update sample cache column
    await sample_repo.session.execute(
        update(SampleModel).where(SampleModel.id == sample_id).values(
            ewma_value=ewma_value
        )
    )

    # Check for violations (rule_id 11/12 to avoid collision with Nelson Rule 1)
    if ewma_value > ucl:
        await violation_repo.create(
            sample_id=sample_id,
            char_id=char.id,
            rule_id=11,
            rule_name="EWMA Above UCL",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=True,
        )
    if ewma_value < lcl:
        await violation_repo.create(
            sample_id=sample_id,
            char_id=char.id,
            rule_id=12,
            rule_name="EWMA Below LCL",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=True,
        )
