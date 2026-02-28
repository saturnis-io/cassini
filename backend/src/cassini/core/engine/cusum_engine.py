"""CUSUM (Cumulative Sum) SPC engine for detecting small persistent shifts.

This module provides CUSUM chart processing for detecting small, sustained
shifts in a process mean that standard Shewhart charts may miss.

CUSUM formulas (two-sided tabular CUSUM):
    C+_n = max(0, C+_(n-1) + (x_n - target - k))
    C-_n = max(0, C-_(n-1) + (target - x_n - k))

    Violation when C+_n > H or C-_n > H

Where:
    target = process target/mean
    k = slack value (allowance), typically 0.5 * sigma
    H = decision interval, typically 4 * sigma or 5 * sigma
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
class CUSUMProcessingResult:
    """Result of processing a CUSUM sample.

    Attributes:
        sample_id: Database ID of the created sample
        characteristic_id: ID of the characteristic
        timestamp: When the sample was taken
        measurement: Raw measurement value
        cusum_high: Running CUSUM+ value after this sample
        cusum_low: Running CUSUM- value after this sample
        target: Process target value
        h: Decision interval threshold
        in_control: True if no violations were triggered
        violations: List of violation descriptions
        processing_time_ms: Time taken to process in milliseconds
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime
    measurement: float
    cusum_high: float
    cusum_low: float
    target: float
    h: float
    in_control: bool
    violations: list[dict] = field(default_factory=list)
    processing_time_ms: float = 0.0


async def process_cusum_sample(
    char_id: int,
    measurement: float,
    sample_repo: "SampleRepository",
    char_repo: "CharacteristicRepository",
    violation_repo: "ViolationRepository",
    batch_number: str | None = None,
    operator_id: str | None = None,
) -> CUSUMProcessingResult:
    """Full CUSUM sample processing pipeline.

    Steps:
    1. Load characteristic and validate CUSUM configuration
    2. Estimate sigma from stored_sigma or historical data
    3. Load previous sample's CUSUM values from DB
    4. Calculate new CUSUM+ and CUSUM- values (k and h scaled by sigma)
    5. Create sample with measurement and CUSUM values
    6. Check for violations (C+ > H*sigma or C- > H*sigma)
    7. Create violations if thresholds exceeded
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
        CUSUMProcessingResult with all processing data

    Raises:
        ValueError: If characteristic not found or CUSUM not configured
    """
    start_time = time.perf_counter()

    # Step 1: Load characteristic
    char = await char_repo.get_with_rules(char_id)
    if char is None:
        raise ValueError(f"Characteristic {char_id} not found")

    if char.chart_type != "cusum":
        raise ValueError(
            f"Characteristic {char_id} is not configured for CUSUM "
            f"(chart_type={char.chart_type})"
        )

    target = char.cusum_target
    k_sigma = char.cusum_k  # k in sigma units (e.g. 0.5 means 0.5*sigma)
    h_sigma = char.cusum_h  # h in sigma units (e.g. 5 means 5*sigma)

    if target is None:
        raise ValueError(f"Characteristic {char_id} has no cusum_target configured")
    if k_sigma is None:
        k_sigma = 0.5  # Default slack value in sigma units
    if h_sigma is None:
        h_sigma = 5.0  # Default decision interval in sigma units

    # Extract rule config for violation creation
    rule_require_ack = {
        rule.rule_id: rule.require_acknowledgement
        for rule in char.rules
        if rule.is_enabled
    }

    # Step 2: Estimate sigma (same pattern as EWMA engine)
    # Use stored_sigma if available, otherwise estimate from historical data
    sigma = char.stored_sigma
    if sigma is None or sigma <= 0:
        window_data = await sample_repo.get_rolling_window_data(
            char_id=char_id, window_size=100, exclude_excluded=True
        )
        all_values = []
        for wd in window_data:
            all_values.extend(wd["values"])
        all_values.append(measurement)
        if len(all_values) >= 2:
            n = len(all_values)
            mean = sum(all_values) / n
            variance = sum((x - mean) ** 2 for x in all_values) / (n - 1)
            sigma = math.sqrt(variance)
        else:
            sigma = 0.0

    if sigma <= 0:
        sigma = 1.0  # Fallback to prevent division by zero
        logger.warning(
            "cusum_sigma_fallback",
            char_id=char_id,
            msg="Insufficient data to estimate sigma, using 1.0",
        )

    # Convert k and h from sigma units to measurement units
    # Montgomery (Ch. 9): K = k*sigma, H = h*sigma
    k = k_sigma * sigma
    h = h_sigma * sigma

    # Step 3: Load previous sample's CUSUM values
    prev_cusum_high = 0.0
    prev_cusum_low = 0.0

    # Get the most recent sample for this characteristic
    recent_samples = await sample_repo.get_rolling_window(
        char_id=char_id, window_size=1, exclude_excluded=True
    )
    if recent_samples:
        prev_sample = recent_samples[-1]
        prev_cusum_high = prev_sample.cusum_high if prev_sample.cusum_high is not None else 0.0
        prev_cusum_low = prev_sample.cusum_low if prev_sample.cusum_low is not None else 0.0

    # Step 4: Calculate new CUSUM values
    # k and h are now in measurement units (k_sigma*sigma, h_sigma*sigma)
    cusum_high = max(0.0, prev_cusum_high + (measurement - target - k))
    cusum_low = max(0.0, prev_cusum_low + (target - measurement - k))

    # Step 5: Create sample with measurement and CUSUM values
    sample = await sample_repo.create_with_measurements(
        char_id=char_id,
        values=[measurement],
        batch_number=batch_number,
        operator_id=operator_id,
    )

    # Update the sample with CUSUM running values
    sample.cusum_high = cusum_high
    sample.cusum_low = cusum_low
    await sample_repo.session.flush()

    # Step 6: Check for violations
    violations = []

    if cusum_high > h:
        # CUSUM+ exceeded decision interval - upward shift detected
        requires_ack = rule_require_ack.get(1, True)
        await violation_repo.create(
            sample_id=sample.id,
            char_id=char_id,
            rule_id=1,
            rule_name="CUSUM+ Shift",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=requires_ack,
        )
        violations.append({
            "rule_id": 1,
            "rule_name": "CUSUM+ Shift",
            "severity": "CRITICAL",
            "message": f"CUSUM+ = {cusum_high:.4f} exceeds H = {h:.4f} (upward shift)",
        })

    if cusum_low > h:
        # CUSUM- exceeded decision interval - downward shift detected
        requires_ack = rule_require_ack.get(1, True)
        await violation_repo.create(
            sample_id=sample.id,
            char_id=char_id,
            rule_id=1,
            rule_name="CUSUM- Shift",
            severity="CRITICAL",
            acknowledged=False,
            requires_acknowledgement=requires_ack,
        )
        violations.append({
            "rule_id": 1,
            "rule_name": "CUSUM- Shift",
            "severity": "CRITICAL",
            "message": f"CUSUM- = {cusum_low:.4f} exceeds H = {h:.4f} (downward shift)",
        })

    end_time = time.perf_counter()
    processing_time_ms = (end_time - start_time) * 1000

    return CUSUMProcessingResult(
        sample_id=sample.id,
        characteristic_id=char_id,
        timestamp=sample.timestamp,
        measurement=measurement,
        cusum_high=cusum_high,
        cusum_low=cusum_low,
        target=target,
        h=h,
        in_control=len(violations) == 0,
        violations=violations,
        processing_time_ms=processing_time_ms,
    )
