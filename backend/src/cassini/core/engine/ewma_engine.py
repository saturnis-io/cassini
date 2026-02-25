"""EWMA (Exponentially Weighted Moving Average) SPC engine.

This module provides EWMA chart processing for detecting small shifts
in the process mean with emphasis on recent observations.

EWMA formula:
    z_n = lambda * x_n + (1 - lambda) * z_(n-1)
    z_0 = target (process mean)

Control limits:
    UCL = target + L * sigma * sqrt(lambda / (2 - lambda))
    LCL = target - L * sigma * sqrt(lambda / (2 - lambda))

Where:
    lambda = smoothing constant (0 < lambda <= 1), typical 0.2
    L = control limit multiplier, typical 2.7
    sigma = process standard deviation (estimated from historical data)
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
) -> tuple[float, float]:
    """Calculate EWMA control limits.

    The steady-state EWMA control limits use the asymptotic formula:
        UCL = target + L * sigma * sqrt(lambda / (2 - lambda))
        LCL = target - L * sigma * sqrt(lambda / (2 - lambda))

    Args:
        target: Process target/mean
        sigma: Process standard deviation
        ewma_lambda: Smoothing constant (0 < lambda <= 1)
        ewma_l: Control limit multiplier

    Returns:
        Tuple of (UCL, LCL)
    """
    if sigma <= 0 or ewma_lambda <= 0 or ewma_lambda > 1:
        return (target, target)

    limit_width = ewma_l * sigma * math.sqrt(ewma_lambda / (2.0 - ewma_lambda))
    ucl = target + limit_width
    lcl = target - limit_width
    return (ucl, lcl)


def estimate_sigma_from_values(values: list[float]) -> float:
    """Estimate process sigma from individual measurement values.

    Uses the standard deviation of individual values (ddof=1).
    If fewer than 2 values, returns 0.

    Args:
        values: List of measurement values

    Returns:
        Estimated process sigma
    """
    if len(values) < 2:
        return 0.0

    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    return math.sqrt(variance)


async def process_ewma_sample(
    char_id: int,
    measurement: float,
    sample_repo: "SampleRepository",
    char_repo: "CharacteristicRepository",
    violation_repo: "ViolationRepository",
    batch_number: str | None = None,
    operator_id: str | None = None,
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

    if char.chart_type != "ewma":
        raise ValueError(
            f"Characteristic {char_id} is not configured for EWMA "
            f"(chart_type={char.chart_type})"
        )

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

    # Step 2: Load previous sample's EWMA value
    prev_ewma = target  # z_0 = target (EWMA starts at process mean)

    recent_samples = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=1, exclude_excluded=True
    )
    if recent_samples:
        prev_sample = recent_samples[-1]
        if prev_sample.ewma_value is not None:
            prev_ewma = prev_sample.ewma_value

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
    ewma_value = ewma_lambda * measurement + (1.0 - ewma_lambda) * prev_ewma

    # Step 5: Calculate control limits
    ucl, lcl = calculate_ewma_limits(target, sigma, ewma_lambda, ewma_l)

    # Step 6: Create sample with measurement and EWMA value
    sample = await sample_repo.create_with_measurements(
        char_id=char_id,
        values=[measurement],
        batch_number=batch_number,
        operator_id=operator_id,
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
