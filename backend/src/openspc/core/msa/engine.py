"""Gage R&R calculation engine (Crossed ANOVA, Range, Nested ANOVA).

Implements AIAG MSA 4th Edition methods for variable measurement system
analysis. All methods accept a 3D measurements array shaped as
``measurements_3d[operator_idx][part_idx][replicate_idx]`` and return a
:class:`GageRRResult`.
"""
from __future__ import annotations

import math
from collections.abc import Sequence

from scipy.stats import f as f_dist

from openspc.core.msa.models import D2_STAR, GageRRResult


def _flatten_3d(measurements_3d: Sequence[Sequence[Sequence[float]]]) -> list[float]:
    """Flatten a 3D array into a single list of floats."""
    return [v for op in measurements_3d for part in op for v in part]


def _mean(values: Sequence[float]) -> float:
    """Arithmetic mean."""
    return sum(values) / len(values)


def _get_d2_star(m: int) -> float:
    """Look up d2* from AIAG table, with interpolation for missing keys."""
    if m in D2_STAR:
        return D2_STAR[m]
    # Linear interpolation between nearest known keys
    keys = sorted(D2_STAR.keys())
    if m < keys[0]:
        return D2_STAR[keys[0]]
    if m > keys[-1]:
        return D2_STAR[keys[-1]]
    for i in range(len(keys) - 1):
        if keys[i] < m < keys[i + 1]:
            lo, hi = keys[i], keys[i + 1]
            frac = (m - lo) / (hi - lo)
            return D2_STAR[lo] + frac * (D2_STAR[hi] - D2_STAR[lo])
    return D2_STAR[keys[-1]]  # pragma: no cover


def _build_verdict(pct_study_grr: float) -> str:
    """Determine verdict from %Study GRR per AIAG guidelines."""
    if pct_study_grr < 10.0:
        return "acceptable"
    if pct_study_grr <= 30.0:
        return "marginal"
    return "unacceptable"


def _build_result(
    *,
    method: str,
    sigma2_equipment: float,
    sigma2_operator: float,
    sigma2_interaction: float | None,
    sigma2_part: float,
    tolerance: float | None,
    anova_table: dict | None,
) -> GageRRResult:
    """Assemble a GageRRResult from variance components."""
    ev = math.sqrt(sigma2_equipment)
    interaction_sigma = math.sqrt(sigma2_interaction) if sigma2_interaction is not None else 0.0
    av = math.sqrt(sigma2_operator + (sigma2_interaction or 0.0))
    grr = math.sqrt(ev**2 + av**2)
    pv = math.sqrt(sigma2_part)
    tv = math.sqrt(grr**2 + pv**2)

    # Avoid division by zero
    tv2 = tv**2 if tv > 0 else 1e-30
    tv_safe = tv if tv > 0 else 1e-30

    # %Contribution (variance-based)
    pct_contribution_ev = (sigma2_equipment / tv2) * 100.0
    pct_contribution_av = (sigma2_operator / tv2) * 100.0
    pct_contribution_interaction = (
        (sigma2_interaction / tv2) * 100.0 if sigma2_interaction is not None else None
    )
    pct_contribution_grr = (grr**2 / tv2) * 100.0
    pct_contribution_pv = (sigma2_part / tv2) * 100.0

    # %Study Variation (sigma / TV * 100)
    pct_study_ev = (ev / tv_safe) * 100.0
    pct_study_av = (av / tv_safe) * 100.0
    pct_study_grr = (grr / tv_safe) * 100.0
    pct_study_pv = (pv / tv_safe) * 100.0

    # %Tolerance
    pct_tolerance_grr: float | None = None
    if tolerance is not None and tolerance > 0:
        pct_tolerance_grr = (5.15 * grr / tolerance) * 100.0

    # Number of distinct categories (ndc >= 1)
    grr_safe = grr if grr > 0 else 1e-30
    ndc = max(1, math.floor(1.41 * pv / grr_safe))

    verdict = _build_verdict(pct_study_grr)

    return GageRRResult(
        method=method,
        repeatability_ev=ev,
        reproducibility_av=av,
        interaction=interaction_sigma if sigma2_interaction is not None else None,
        gage_rr=grr,
        part_variation=pv,
        total_variation=tv,
        pct_contribution_ev=pct_contribution_ev,
        pct_contribution_av=pct_contribution_av,
        pct_contribution_interaction=pct_contribution_interaction,
        pct_contribution_grr=pct_contribution_grr,
        pct_contribution_pv=pct_contribution_pv,
        pct_study_ev=pct_study_ev,
        pct_study_av=pct_study_av,
        pct_study_grr=pct_study_grr,
        pct_study_pv=pct_study_pv,
        pct_tolerance_grr=pct_tolerance_grr,
        ndc=ndc,
        anova_table=anova_table,
        verdict=verdict,
    )


class GageRREngine:
    """Gage R&R calculation engine supporting multiple AIAG methods."""

    # ------------------------------------------------------------------
    # Crossed ANOVA (two-way with interaction)
    # ------------------------------------------------------------------

    def calculate_crossed_anova(
        self,
        measurements_3d: list[list[list[float]]],
        tolerance: float | None = None,
    ) -> GageRRResult:
        """Two-way crossed ANOVA with interaction.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
                All operators measure the same parts.
            tolerance: USL - LSL for %Tolerance calculation.

        Returns:
            GageRRResult with full ANOVA table.
        """
        n_ops = len(measurements_3d)
        n_parts = len(measurements_3d[0])
        n_reps = len(measurements_3d[0][0])

        if n_ops < 2:
            raise ValueError("Crossed ANOVA requires at least 2 operators")
        if n_parts < 2:
            raise ValueError("Crossed ANOVA requires at least 2 parts")
        if n_reps < 2:
            raise ValueError("Crossed ANOVA requires at least 2 replicates")

        all_values = _flatten_3d(measurements_3d)
        grand_mean = _mean(all_values)

        # Operator means
        op_means = []
        for i in range(n_ops):
            vals = [v for part in measurements_3d[i] for v in part]
            op_means.append(_mean(vals))

        # Part means
        part_means = []
        for j in range(n_parts):
            vals = [measurements_3d[i][j][k] for i in range(n_ops) for k in range(n_reps)]
            part_means.append(_mean(vals))

        # Cell means (operator x part)
        cell_means = []
        for i in range(n_ops):
            row = []
            for j in range(n_parts):
                row.append(_mean(measurements_3d[i][j]))
            cell_means.append(row)

        # Sum of Squares
        ss_total = sum((v - grand_mean) ** 2 for v in all_values)

        ss_operator = n_parts * n_reps * sum(
            (om - grand_mean) ** 2 for om in op_means
        )

        ss_part = n_ops * n_reps * sum(
            (pm - grand_mean) ** 2 for pm in part_means
        )

        ss_interaction = n_reps * sum(
            (cell_means[i][j] - op_means[i] - part_means[j] + grand_mean) ** 2
            for i in range(n_ops)
            for j in range(n_parts)
        )

        ss_equipment = ss_total - ss_operator - ss_part - ss_interaction

        # Degrees of freedom
        df_operator = n_ops - 1
        df_part = n_parts - 1
        df_interaction = df_operator * df_part
        df_equipment = n_ops * n_parts * (n_reps - 1)

        # Mean Squares
        ms_operator = ss_operator / df_operator if df_operator > 0 else 0.0
        ms_part = ss_part / df_part if df_part > 0 else 0.0
        ms_interaction = ss_interaction / df_interaction if df_interaction > 0 else 0.0
        ms_equipment = ss_equipment / df_equipment if df_equipment > 0 else 0.0

        # F-tests
        ms_int_safe = ms_interaction if ms_interaction > 0 else 1e-30
        ms_eq_safe = ms_equipment if ms_equipment > 0 else 1e-30

        f_operator = ms_operator / ms_int_safe
        f_part = ms_part / ms_int_safe
        f_interaction = ms_interaction / ms_eq_safe

        p_operator = float(f_dist.sf(f_operator, df_operator, df_interaction))
        p_part = float(f_dist.sf(f_part, df_part, df_interaction))
        p_interaction = float(f_dist.sf(f_interaction, df_interaction, df_equipment))

        # Check if interaction is significant (p <= 0.25)
        interaction_significant = p_interaction <= 0.25

        # Variance components (clamp negative to 0)
        sigma2_equipment = ms_equipment

        if interaction_significant:
            sigma2_interaction: float | None = max(
                0.0, (ms_interaction - ms_equipment) / n_reps
            )
            sigma2_operator = max(
                0.0, (ms_operator - ms_interaction) / (n_parts * n_reps)
            )
            sigma2_part = max(
                0.0, (ms_part - ms_interaction) / (n_ops * n_reps)
            )
        else:
            # Pool interaction with equipment
            sigma2_interaction = None
            df_pooled = df_interaction + df_equipment
            ss_pooled = ss_interaction + ss_equipment
            ms_pooled = ss_pooled / df_pooled if df_pooled > 0 else 0.0
            sigma2_equipment = ms_pooled
            sigma2_operator = max(
                0.0, (ms_operator - ms_pooled) / (n_parts * n_reps)
            )
            sigma2_part = max(
                0.0, (ms_part - ms_pooled) / (n_ops * n_reps)
            )

        # Build ANOVA table
        anova_table = {
            "operator": {
                "SS": ss_operator,
                "df": df_operator,
                "MS": ms_operator,
                "F": f_operator,
                "p": p_operator,
            },
            "part": {
                "SS": ss_part,
                "df": df_part,
                "MS": ms_part,
                "F": f_part,
                "p": p_part,
            },
            "interaction": {
                "SS": ss_interaction,
                "df": df_interaction,
                "MS": ms_interaction,
                "F": f_interaction,
                "p": p_interaction,
            },
            "equipment": {
                "SS": ss_equipment,
                "df": df_equipment,
                "MS": ms_equipment,
            },
            "total": {
                "SS": ss_total,
                "df": len(all_values) - 1,
            },
        }

        return _build_result(
            method="crossed_anova",
            sigma2_equipment=sigma2_equipment,
            sigma2_operator=sigma2_operator,
            sigma2_interaction=sigma2_interaction,
            sigma2_part=sigma2_part,
            tolerance=tolerance,
            anova_table=anova_table,
        )

    # ------------------------------------------------------------------
    # Range Method (simplified, AIAG Appendix)
    # ------------------------------------------------------------------

    def calculate_range_method(
        self,
        measurements_3d: list[list[list[float]]],
        tolerance: float | None = None,
    ) -> GageRRResult:
        """Simplified range-based Gage R&R estimator.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
            tolerance: USL - LSL for %Tolerance calculation.

        Returns:
            GageRRResult (no ANOVA table).
        """
        n_ops = len(measurements_3d)
        n_parts = len(measurements_3d[0])
        n_reps = len(measurements_3d[0][0])

        if n_ops < 2:
            raise ValueError("Range method requires at least 2 operators")
        if n_reps < 2:
            raise ValueError("Range method requires at least 2 replicates")

        d2_reps = _get_d2_star(n_reps)

        # --- Equipment Variation (EV) ---
        # Range across replicates for each operator-part cell
        ranges = []
        for i in range(n_ops):
            for j in range(n_parts):
                cell = measurements_3d[i][j]
                ranges.append(max(cell) - min(cell))
        r_bar = _mean(ranges)
        ev = r_bar / d2_reps
        sigma2_equipment = ev**2

        # --- Appraiser Variation (AV) ---
        # Difference between max and min operator averages
        op_means = []
        for i in range(n_ops):
            vals = [v for part in measurements_3d[i] for v in part]
            op_means.append(_mean(vals))
        x_bar_diff = max(op_means) - min(op_means)

        d2_ops = _get_d2_star(n_ops)
        k1 = 1.0 / d2_ops
        av_squared = max(0.0, (x_bar_diff * k1) ** 2 - sigma2_equipment / (n_parts * n_reps))
        sigma2_operator = av_squared

        # --- Part Variation (PV) ---
        # Range of part averages
        part_means = []
        for j in range(n_parts):
            vals = [measurements_3d[i][j][k] for i in range(n_ops) for k in range(n_reps)]
            part_means.append(_mean(vals))
        rp = max(part_means) - min(part_means)

        d2_parts = _get_d2_star(n_parts)
        k3 = 1.0 / d2_parts
        sigma2_part = (rp * k3) ** 2

        return _build_result(
            method="range",
            sigma2_equipment=sigma2_equipment,
            sigma2_operator=sigma2_operator,
            sigma2_interaction=None,
            sigma2_part=sigma2_part,
            tolerance=tolerance,
            anova_table=None,
        )

    # ------------------------------------------------------------------
    # Nested ANOVA (each operator measures different parts)
    # ------------------------------------------------------------------

    def calculate_nested_anova(
        self,
        measurements_3d: list[list[list[float]]],
        tolerance: float | None = None,
    ) -> GageRRResult:
        """Nested ANOVA for destructive or non-reproducible tests.

        Each operator measures different parts (parts are nested within
        operators). The 3D array has the same shape but parts are unique
        per operator.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
                Parts for different operators are distinct physical parts.
            tolerance: USL - LSL for %Tolerance calculation.

        Returns:
            GageRRResult (no interaction term).
        """
        n_ops = len(measurements_3d)
        n_parts = len(measurements_3d[0])
        n_reps = len(measurements_3d[0][0])

        if n_ops < 2:
            raise ValueError("Nested ANOVA requires at least 2 operators")
        if n_parts < 2:
            raise ValueError("Nested ANOVA requires at least 2 parts")
        if n_reps < 2:
            raise ValueError("Nested ANOVA requires at least 2 replicates")

        all_values = _flatten_3d(measurements_3d)
        grand_mean = _mean(all_values)

        # Operator means
        op_means = []
        for i in range(n_ops):
            vals = [v for part in measurements_3d[i] for v in part]
            op_means.append(_mean(vals))

        # --- Within-cell variance (repeatability) ---
        # Pooled within-cell variance across all operator-part cells
        ss_within = 0.0
        df_within = 0
        for i in range(n_ops):
            for j in range(n_parts):
                cell = measurements_3d[i][j]
                cell_mean = _mean(cell)
                ss_within += sum((v - cell_mean) ** 2 for v in cell)
                df_within += n_reps - 1

        ms_within = ss_within / df_within if df_within > 0 else 0.0
        sigma2_equipment = ms_within

        # --- Between-part (within operator) variance ---
        # Parts are nested within operators
        ss_parts_within_ops = 0.0
        df_parts_within_ops = 0
        for i in range(n_ops):
            op_vals = [v for part in measurements_3d[i] for v in part]
            op_mean = _mean(op_vals)
            for j in range(n_parts):
                cell_mean = _mean(measurements_3d[i][j])
                ss_parts_within_ops += n_reps * (cell_mean - op_mean) ** 2
            df_parts_within_ops += n_parts - 1

        ms_parts = ss_parts_within_ops / df_parts_within_ops if df_parts_within_ops > 0 else 0.0
        sigma2_part = max(0.0, (ms_parts - ms_within) / n_reps)

        # --- Between-operator variance ---
        ss_operator = n_parts * n_reps * sum(
            (om - grand_mean) ** 2 for om in op_means
        )
        df_operator = n_ops - 1
        ms_operator = ss_operator / df_operator if df_operator > 0 else 0.0
        sigma2_operator = max(
            0.0, (ms_operator - ms_parts) / (n_parts * n_reps)
        )

        return _build_result(
            method="nested_anova",
            sigma2_equipment=sigma2_equipment,
            sigma2_operator=sigma2_operator,
            sigma2_interaction=None,
            sigma2_part=sigma2_part,
            tolerance=tolerance,
            anova_table=None,
        )
