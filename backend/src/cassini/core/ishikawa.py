"""Ishikawa / Fishbone diagram variance decomposition engine.

Analyzes variation sources in SPC data by running one-way ANOVA across
six 6M categories (Personnel, Material, Method, Environment, Equipment,
Measurement) and computing eta-squared effect sizes.
"""

from __future__ import annotations

import json
import logging
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from scipy.stats import f_oneway
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.msa import MSAStudy
from cassini.db.models.sample import Measurement, Sample

logger = logging.getLogger(__name__)

# Minimum levels for a factor to be analyzable
MIN_LEVELS = 2
# Minimum samples per level
MIN_SAMPLES_PER_LEVEL = 5
# Significance threshold
ALPHA = 0.05
# Time shift bucket size in hours
SHIFT_BUCKET_HOURS = 8


@dataclass
class IshikawaFactor:
    """A single level within a category (e.g., one operator name)."""

    name: str
    sample_count: int


@dataclass
class IshikawaCategory:
    """One of the 6M categories with its ANOVA result."""

    category: str
    eta_squared: float | None
    p_value: float | None
    significant: bool
    sufficient_data: bool
    factors: list[IshikawaFactor]
    detail: str


@dataclass
class IshikawaResult:
    """Complete variance decomposition result."""

    effect: str
    total_variance: float
    sample_count: int
    categories: list[IshikawaCategory]
    analysis_window: dict[str, str | int | None]
    warnings: list[str] = field(default_factory=list)


def _bucket_hour(ts: datetime) -> str:
    """Map a timestamp to an 8-hour shift bucket label."""
    hour = ts.hour
    bucket = (hour // SHIFT_BUCKET_HOURS) * SHIFT_BUCKET_HOURS
    end = bucket + SHIFT_BUCKET_HOURS
    return f"{bucket:02d}:00-{end:02d}:00"


def _day_of_week(ts: datetime) -> str:
    """Map a timestamp to day-of-week label."""
    return ts.strftime("%A")


def _run_anova(groups: dict[str, list[float]]) -> tuple[float | None, float | None, bool, list[IshikawaFactor], str]:
    """Run one-way ANOVA on grouped values.

    Returns (eta_squared, p_value, sufficient_data, factors, detail).
    """
    factors = [
        IshikawaFactor(name=k, sample_count=len(v))
        for k, v in sorted(groups.items())
    ]

    # Check data sufficiency
    valid_groups = {k: v for k, v in groups.items() if len(v) >= MIN_SAMPLES_PER_LEVEL}
    if len(valid_groups) < MIN_LEVELS:
        return (
            None,
            None,
            False,
            factors,
            f"Insufficient data: need >= {MIN_LEVELS} levels with >= {MIN_SAMPLES_PER_LEVEL} samples each",
        )

    # Run ANOVA
    group_arrays = [np.array(v, dtype=np.float64) for v in valid_groups.values()]
    try:
        f_stat, p_value = f_oneway(*group_arrays)
    except Exception:
        logger.debug("ANOVA failed for groups", exc_info=True)
        return None, None, True, factors, "ANOVA computation failed"

    if math.isnan(f_stat) or math.isnan(p_value):
        return None, None, True, factors, "ANOVA returned NaN (likely zero variance within all groups)"

    # Compute eta-squared: SS_between / SS_total
    all_values = np.concatenate(group_arrays)
    grand_mean = np.mean(all_values)
    ss_total = float(np.sum((all_values - grand_mean) ** 2))

    if ss_total == 0:
        return 0.0, float(p_value), True, factors, "Zero total variance"

    group_means = [np.mean(g) for g in group_arrays]
    group_sizes = [len(g) for g in group_arrays]
    ss_between = sum(n * (m - grand_mean) ** 2 for n, m in zip(group_sizes, group_means))
    eta_squared = float(ss_between / ss_total)

    significant = p_value < ALPHA
    detail = (
        f"F={f_stat:.2f}, p={p_value:.4f}, eta²={eta_squared:.4f}"
        + (" (significant)" if significant else " (not significant)")
    )

    return eta_squared, float(p_value), True, factors, detail


async def analyze_variation_sources(
    session: AsyncSession,
    characteristic_id: int,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int | None = None,
) -> IshikawaResult:
    """Decompose variation sources for a characteristic across the 6M categories.

    Args:
        session: Async DB session.
        characteristic_id: ID of the characteristic to analyze.
        start_date: Optional start of analysis window.
        end_date: Optional end of analysis window.
        limit: Optional max number of recent samples.

    Returns:
        IshikawaResult with ANOVA results per 6M category.
    """
    # Fetch samples with measurements
    stmt = (
        select(Sample)
        .options(selectinload(Sample.measurements))
        .where(
            Sample.char_id == characteristic_id,
            Sample.is_excluded == False,  # noqa: E712
        )
        .order_by(Sample.timestamp)
    )
    if start_date is not None:
        stmt = stmt.where(Sample.timestamp >= start_date)
    if end_date is not None:
        stmt = stmt.where(Sample.timestamp <= end_date)

    result = await session.execute(stmt)
    samples = list(result.scalars().all())

    # Apply limit (most recent N)
    if limit and len(samples) > limit:
        samples = samples[-limit:]

    warnings: list[str] = []
    if len(samples) < 10:
        warnings.append(f"Only {len(samples)} samples available; results may not be reliable")

    # Compute subgroup means for each sample
    sample_means: list[tuple[Sample, float]] = []
    for s in samples:
        meas = [m.value for m in s.measurements]
        if meas:
            sample_means.append((s, sum(meas) / len(meas)))

    total_values = [mean for _, mean in sample_means]
    total_variance = float(np.var(total_values, ddof=1)) if len(total_values) >= 2 else 0.0

    categories: list[IshikawaCategory] = []

    # --- Personnel: group by operator_id ---
    operator_groups: dict[str, list[float]] = defaultdict(list)
    for s, mean in sample_means:
        key = s.operator_id or "(unassigned)"
        operator_groups[key].append(mean)

    eta, p, sufficient, factors, detail = _run_anova(operator_groups)
    categories.append(
        IshikawaCategory(
            category="Personnel",
            eta_squared=eta,
            p_value=p,
            significant=p is not None and p < ALPHA,
            sufficient_data=sufficient,
            factors=factors,
            detail=detail,
        )
    )

    # --- Material: group by batch_number ---
    batch_groups: dict[str, list[float]] = defaultdict(list)
    for s, mean in sample_means:
        key = s.batch_number or "(no batch)"
        batch_groups[key].append(mean)

    eta, p, sufficient, factors, detail = _run_anova(batch_groups)
    categories.append(
        IshikawaCategory(
            category="Material",
            eta_squared=eta,
            p_value=p,
            significant=p is not None and p < ALPHA,
            sufficient_data=sufficient,
            factors=factors,
            detail=detail,
        )
    )

    # --- Method: group by time shift (8-hour buckets) ---
    shift_groups: dict[str, list[float]] = defaultdict(list)
    for s, mean in sample_means:
        key = _bucket_hour(s.timestamp)
        shift_groups[key].append(mean)

    eta, p, sufficient, factors, detail = _run_anova(shift_groups)
    categories.append(
        IshikawaCategory(
            category="Method",
            eta_squared=eta,
            p_value=p,
            significant=p is not None and p < ALPHA,
            sufficient_data=sufficient,
            factors=factors,
            detail=detail,
        )
    )

    # --- Environment: group by day of week ---
    dow_groups: dict[str, list[float]] = defaultdict(list)
    for s, mean in sample_means:
        key = _day_of_week(s.timestamp)
        dow_groups[key].append(mean)

    eta, p, sufficient, factors, detail = _run_anova(dow_groups)
    categories.append(
        IshikawaCategory(
            category="Environment",
            eta_squared=eta,
            p_value=p,
            significant=p is not None and p < ALPHA,
            sufficient_data=sufficient,
            factors=factors,
            detail=detail,
        )
    )

    # --- Equipment: within-subgroup vs between-subgroup variance ---
    within_vars: list[float] = []
    between_means: list[float] = []
    for s in samples:
        meas = [m.value for m in s.measurements]
        if len(meas) >= 2:
            within_vars.append(float(np.var(meas, ddof=1)))
        if meas:
            between_means.append(sum(meas) / len(meas))

    if len(within_vars) >= 2 and len(between_means) >= 2:
        avg_within = float(np.mean(within_vars))
        var_between = float(np.var(between_means, ddof=1))
        equipment_total = avg_within + var_between
        if equipment_total > 0:
            within_pct = avg_within / equipment_total
            between_pct = var_between / equipment_total
            equip_detail = (
                f"Within-subgroup variance: {avg_within:.6f} ({within_pct:.1%}), "
                f"Between-subgroup variance: {var_between:.6f} ({between_pct:.1%})"
            )
            # Use between-subgroup ratio as the eta-squared analog
            equip_eta = between_pct
        else:
            equip_detail = "Zero total variance"
            equip_eta = 0.0
        equip_factors = [
            IshikawaFactor(name="Within-subgroup", sample_count=len(within_vars)),
            IshikawaFactor(name="Between-subgroup", sample_count=len(between_means)),
        ]
        categories.append(
            IshikawaCategory(
                category="Equipment",
                eta_squared=equip_eta,
                p_value=None,
                significant=equip_eta > 0.1 if equip_eta is not None else False,
                sufficient_data=True,
                factors=equip_factors,
                detail=equip_detail,
            )
        )
    else:
        categories.append(
            IshikawaCategory(
                category="Equipment",
                eta_squared=None,
                p_value=None,
                significant=False,
                sufficient_data=False,
                factors=[],
                detail="Need subgroups of size >= 2 for within/between variance decomposition",
            )
        )

    # --- Measurement: MSA %GRR from latest completed study ---
    msa_stmt = (
        select(MSAStudy)
        .where(
            MSAStudy.characteristic_id == characteristic_id,
            MSAStudy.status == "complete",
        )
        .order_by(MSAStudy.completed_at.desc())
        .limit(1)
    )
    msa_result = await session.execute(msa_stmt)
    msa_study = msa_result.scalar_one_or_none()

    if msa_study and msa_study.results_json:
        try:
            results = json.loads(msa_study.results_json) if isinstance(msa_study.results_json, str) else msa_study.results_json
            pct_grr = results.get("pct_contribution_grr") or results.get("pct_study_grr")
            if pct_grr is not None:
                # Convert %GRR to a 0-1 scale for eta_squared
                grr_ratio = float(pct_grr) / 100.0
                categories.append(
                    IshikawaCategory(
                        category="Measurement",
                        eta_squared=grr_ratio,
                        p_value=None,
                        significant=grr_ratio > 0.10,
                        sufficient_data=True,
                        factors=[
                            IshikawaFactor(name=f"MSA Study #{msa_study.id}", sample_count=0),
                        ],
                        detail=f"%GRR = {pct_grr:.1f}% from MSA study '{msa_study.name}'",
                    )
                )
            else:
                categories.append(
                    IshikawaCategory(
                        category="Measurement",
                        eta_squared=None,
                        p_value=None,
                        significant=False,
                        sufficient_data=False,
                        factors=[],
                        detail="MSA study completed but no %GRR result found",
                    )
                )
        except (json.JSONDecodeError, TypeError):
            logger.debug("Failed to parse MSA results_json", exc_info=True)
            categories.append(
                IshikawaCategory(
                    category="Measurement",
                    eta_squared=None,
                    p_value=None,
                    significant=False,
                    sufficient_data=False,
                    factors=[],
                    detail="MSA study results could not be parsed",
                )
            )
    else:
        categories.append(
            IshikawaCategory(
                category="Measurement",
                eta_squared=None,
                p_value=None,
                significant=False,
                sufficient_data=False,
                factors=[],
                detail="No completed MSA study found for this characteristic",
            )
        )

    analysis_window: dict[str, str | int | None] = {
        "start_date": start_date.isoformat() if start_date else None,
        "end_date": end_date.isoformat() if end_date else None,
        "limit": limit,
    }

    return IshikawaResult(
        effect="Process Variation",
        total_variance=total_variance,
        sample_count=len(sample_means),
        categories=categories,
        analysis_window=analysis_window,
        warnings=warnings,
    )
