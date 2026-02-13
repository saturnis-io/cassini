"""Process capability calculations (Cp, Cpk, Pp, Ppk, Cpm).

Provides functions to calculate process capability indices from measurement
data, including normality testing via Shapiro-Wilk.

Formulas:
    Cp  = (USL - LSL) / (6 * sigma_within)
    Cpk = min((USL - mean) / (3 * sigma_within), (mean - LSL) / (3 * sigma_within))
    Pp  = (USL - LSL) / (6 * sigma_overall)
    Ppk = min((USL - mean) / (3 * sigma_overall), (mean - LSL) / (3 * sigma_overall))
    Cpm = Cp / sqrt(1 + ((mean - target) / sigma_within)^2)

Where:
    sigma_within  = from control chart (stored_sigma or R-bar/d2)
    sigma_overall = sample standard deviation of all individual values
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math

import numpy as np
from scipy import stats as scipy_stats


@dataclass
class CapabilityResult:
    """Result of a process capability calculation."""

    cp: float | None
    cpk: float | None
    pp: float | None
    ppk: float | None
    cpm: float | None
    sample_count: int
    normality_p_value: float | None
    normality_test: str
    is_normal: bool
    calculated_at: datetime


def calculate_capability(
    values: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
) -> CapabilityResult:
    """Calculate process capability indices from measurement values.

    Args:
        values: Individual measurement values (flattened from subgroups).
        usl: Upper specification limit. None if one-sided.
        lsl: Lower specification limit. None if one-sided.
        target: Process target value. Defaults to midpoint of spec limits.
        sigma_within: Within-subgroup sigma from control chart (R-bar/d2).
            If None, Cp/Cpk are not calculated.

    Returns:
        CapabilityResult with all computed indices.

    Raises:
        ValueError: If fewer than 2 values or both USL and LSL are None.
    """
    if len(values) < 2:
        raise ValueError(f"Need at least 2 values for capability calculation, got {len(values)}")

    if usl is None and lsl is None:
        raise ValueError("At least one specification limit (USL or LSL) must be provided")

    arr = np.asarray(values, dtype=np.float64)
    mean = float(np.mean(arr))
    sigma_overall = float(np.std(arr, ddof=1))
    n = len(values)
    now = datetime.now(timezone.utc)

    # Normality test (Shapiro-Wilk, max 5000 samples)
    normality_p: float | None = None
    normality_test = "shapiro_wilk"
    is_normal = False
    if n >= 3:
        test_sample = arr[:5000] if n > 5000 else arr
        try:
            result = scipy_stats.shapiro(test_sample)
            normality_p = float(result.pvalue)
            is_normal = normality_p >= 0.05
        except Exception:
            normality_test = "failed"

    # Target defaults to midpoint of spec limits
    if target is None and usl is not None and lsl is not None:
        target = (usl + lsl) / 2.0

    # --- Cp / Cpk (short-term, within-subgroup variation) ---
    cp: float | None = None
    cpk: float | None = None
    cpm: float | None = None

    if sigma_within is not None and sigma_within > 0:
        if usl is not None and lsl is not None:
            cp = (usl - lsl) / (6.0 * sigma_within)

        # Cpk: one-sided if only one limit
        cpk_values = []
        if usl is not None:
            cpk_values.append((usl - mean) / (3.0 * sigma_within))
        if lsl is not None:
            cpk_values.append((mean - lsl) / (3.0 * sigma_within))
        if cpk_values:
            cpk = min(cpk_values)

        # Cpm: requires target and both spec limits
        if cp is not None and target is not None:
            tau = math.sqrt(sigma_within**2 + (mean - target) ** 2)
            if tau > 0 and usl is not None and lsl is not None:
                cpm = (usl - lsl) / (6.0 * tau)

    # --- Pp / Ppk (long-term, overall variation) ---
    pp: float | None = None
    ppk: float | None = None

    if sigma_overall > 0:
        if usl is not None and lsl is not None:
            pp = (usl - lsl) / (6.0 * sigma_overall)

        ppk_values = []
        if usl is not None:
            ppk_values.append((usl - mean) / (3.0 * sigma_overall))
        if lsl is not None:
            ppk_values.append((mean - lsl) / (3.0 * sigma_overall))
        if ppk_values:
            ppk = min(ppk_values)

    return CapabilityResult(
        cp=_round_or_none(cp),
        cpk=_round_or_none(cpk),
        pp=_round_or_none(pp),
        ppk=_round_or_none(ppk),
        cpm=_round_or_none(cpm),
        sample_count=n,
        normality_p_value=_round_or_none(normality_p, 6),
        normality_test=normality_test,
        is_normal=is_normal,
        calculated_at=now,
    )


def _round_or_none(value: float | None, decimals: int = 4) -> float | None:
    """Round a value to the specified decimals, or return None."""
    if value is None:
        return None
    return round(value, decimals)
