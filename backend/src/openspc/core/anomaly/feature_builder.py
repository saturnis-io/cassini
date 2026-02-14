"""Feature extraction for anomaly detection.

Builds a 6-dimensional feature vector from SPC sample data for use
with Isolation Forest and other multivariate detectors.
"""

import numpy as np

FEATURE_NAMES = [
    "mean",
    "range",
    "sigma_distance",
    "delta_mean",
    "rolling_std_5",
    "time_gap",
]


def build_features(sample: dict, history: list[dict]) -> list[float]:
    """Extract a feature vector from a sample and its history context.

    Features:
        1. mean — Sample mean (or plotted value)
        2. range — Range value (0 for n=1)
        3. sigma_distance — Distance from center line in sigma units
        4. delta_mean — Difference from previous sample mean
        5. rolling_std_5 — Std dev of last 5 sample means
        6. time_gap — Seconds since previous sample

    Args:
        sample: Dictionary with sample data (mean, range_value, etc.)
        history: List of sample dictionaries in chronological order,
                 including the current sample as the last element.

    Returns:
        List of 6 float feature values.
    """
    mean = float(sample.get("mean", 0.0) or 0.0)
    range_val = float(sample.get("range_value", 0.0) or 0.0)
    sigma_dist = float(sample.get("sigma_distance", 0.0) or 0.0)

    # Delta from previous sample
    if len(history) >= 2:
        prev_mean = float(history[-2].get("mean", 0.0) or 0.0)
        delta_mean = mean - prev_mean
    else:
        delta_mean = 0.0

    # Rolling std of last 5 sample means
    recent_means = [float(s.get("mean", 0.0) or 0.0) for s in history[-5:]]
    if len(recent_means) >= 2:
        rolling_std = float(np.std(recent_means, ddof=1))
    else:
        rolling_std = 0.0

    # Time gap in seconds since previous sample
    if len(history) >= 2:
        t1 = history[-1].get("timestamp_epoch", 0)
        t2 = history[-2].get("timestamp_epoch", 0)
        time_gap = max(0.0, float(t1 - t2))
    else:
        time_gap = 0.0

    return [mean, range_val, sigma_dist, delta_mean, rolling_std, time_gap]
