"""Shared fixtures and adapters for NIST reference validation tests.

Bridges reference dataset dataclass shapes to Cassini function signatures.
"""

from __future__ import annotations

import numpy as np
import pytest

from cassini.reference.datasets import (
    AttributeDataset,
    SubgroupDataset,
)


def subgroups_to_means_ranges(
    subgroups: tuple[tuple[float, ...], ...],
) -> tuple[list[float], list[float]]:
    """Convert raw subgroup data to (means, ranges) for calculate_xbar_r_limits().

    Args:
        subgroups: Tuple of subgroup measurement tuples.

    Returns:
        (means, ranges) -- parallel lists ready for calculate_xbar_r_limits().
    """
    means = []
    ranges = []
    for sg in subgroups:
        arr = np.asarray(sg, dtype=np.float64)
        means.append(float(np.mean(arr)))
        ranges.append(float(np.max(arr) - np.min(arr)))
    return means, ranges


def attribute_to_samples(dataset: AttributeDataset) -> list[dict]:
    """Convert AttributeDataset to list[dict] for calculate_attribute_limits().

    Maps to correct dict keys based on chart_type:
    - p/np charts: {"defect_count": ..., "sample_size": ...}
    - c charts:    {"defect_count": ...}
    - u charts:    {"defect_count": ..., "units_inspected": ...}

    Uses phase1 data only (sliced by phase1_count).
    """
    counts = dataset.phase1_counts
    sizes = dataset.phase1_sample_sizes

    samples = []
    for i, count in enumerate(counts):
        sample: dict = {"defect_count": count}
        if dataset.chart_type in ("p", "np"):
            sample["sample_size"] = sizes[i]
        elif dataset.chart_type == "u":
            sample["units_inspected"] = sizes[i]
        samples.append(sample)
    return samples


def flatten_subgroups(subgroups: tuple[tuple[float, ...], ...]) -> list[float]:
    """Flatten subgroups into a single list of individual measurements.

    Used for capability calculations which need all individual values.
    """
    return [v for sg in subgroups for v in sg]


def pytest_configure(config):
    config.addinivalue_line("markers", "nist: NIST reference dataset validation tests")
    config.addinivalue_line("markers", "validation: Statistical validation tests against certified values")
