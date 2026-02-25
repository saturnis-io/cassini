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
    2. Load previous sample's CUSUM values from DB
    3. Calculate new CUSUM+ and CUSUM- values
    4. Create sample with measurement and CUSUM values
    5. Check for violations (C+ > H or C- > H)
    6. Create violations if thresholds exceeded
    7. Return result

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
    k = char.cusum_k
    h = char.cusum_h

    if target is None:
        raise ValueError(f"Characteristic {char_id} has no cusum_target configured")
    if k is None:
        k = 0.5  # Default slack value
    if h is None:
        h = 5.0  # Default decision interval

    # Extract rule config for violation creation
    rule_require_ack = {
        rule.rule_id: rule.require_acknowledgement
        for rule in char.rules
        if rule.is_enabled
    }

    # Step 2: Load previous sample's CUSUM values
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

    # Step 3: Calculate new CUSUM values
    cusum_high = max(0.0, prev_cusum_high + (measurement - target - k))
    cusum_low = max(0.0, prev_cusum_low + (target - measurement - k))

    # Step 4: Create sample with measurement and CUSUM values
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

    # Step 5: Check for violations
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
