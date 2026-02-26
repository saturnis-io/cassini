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

from cassini.core.explain import ExplanationCollector
from cassini.core.msa.models import D2_STAR, D2_STAR_TABLE, GageRRResult


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


def _get_d2_star_2d(m: int, g: int) -> float:
    """Look up d2*(m, g) from AIAG 2D table for the Range Method.

    Args:
        m: Subgroup size (number of measurements in range).
        g: Number of subgroups (ranges being averaged).

    Uses full 2D table for accurate K-factor calculation. Falls back to
    1D d2 table (g→infinity) when m or g not found in 2D table.
    """
    if m in D2_STAR_TABLE:
        row = D2_STAR_TABLE[m]
        if g in row:
            return row[g]
        # Interpolate or use nearest g
        g_keys = sorted(row.keys())
        if g < g_keys[0]:
            return row[g_keys[0]]
        if g > g_keys[-1]:
            return row[g_keys[-1]]
        for i in range(len(g_keys) - 1):
            if g_keys[i] < g < g_keys[i + 1]:
                lo, hi = g_keys[i], g_keys[i + 1]
                frac = (g - lo) / (hi - lo)
                return row[lo] + frac * (row[hi] - row[lo])
    # Fallback to 1D table (large g approximation)
    return _get_d2_star(m)


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
    collector: ExplanationCollector | None = None,
) -> GageRRResult:
    """Assemble a GageRRResult from variance components."""
    ev = math.sqrt(sigma2_equipment)
    interaction_sigma = math.sqrt(sigma2_interaction) if sigma2_interaction is not None else 0.0
    av = math.sqrt(sigma2_operator + (sigma2_interaction or 0.0))
    grr = math.sqrt(ev**2 + av**2)
    pv = math.sqrt(sigma2_part)
    tv = math.sqrt(grr**2 + pv**2)

    if collector:
        collector.step(
            label="EV (Repeatability)",
            formula_latex=r"\text{EV} = \sqrt{\sigma^2_{\text{equipment}}}",
            substitution_latex=r"\text{EV} = \sqrt{" + str(round(sigma2_equipment, 6)) + r"}",
            result=ev,
        )
        av_sigma2 = sigma2_operator + (sigma2_interaction or 0.0)
        collector.step(
            label="AV (Reproducibility)",
            formula_latex=r"\text{AV} = \sqrt{\sigma^2_{\text{operator}} + \sigma^2_{\text{interaction}}}",
            substitution_latex=r"\text{AV} = \sqrt{" + str(round(av_sigma2, 6)) + r"}",
            result=av,
        )
        collector.step(
            label="GRR (Gage R&R)",
            formula_latex=r"\text{GRR} = \sqrt{\text{EV}^2 + \text{AV}^2}",
            substitution_latex=r"\text{GRR} = \sqrt{" + str(round(ev**2, 6)) + r" + " + str(round(av**2, 6)) + r"}",
            result=grr,
        )
        collector.step(
            label="PV (Part Variation)",
            formula_latex=r"\text{PV} = \sqrt{\sigma^2_{\text{part}}}",
            substitution_latex=r"\text{PV} = \sqrt{" + str(round(sigma2_part, 6)) + r"}",
            result=pv,
        )
        collector.step(
            label="TV (Total Variation)",
            formula_latex=r"\text{TV} = \sqrt{\text{GRR}^2 + \text{PV}^2}",
            substitution_latex=r"\text{TV} = \sqrt{" + str(round(grr**2, 6)) + r" + " + str(round(pv**2, 6)) + r"}",
            result=tv,
        )

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

    if collector:
        collector.step(
            label="%Study GRR",
            formula_latex=r"\%\text{Study GRR} = \frac{\text{GRR}}{\text{TV}} \times 100",
            substitution_latex=r"\%\text{Study GRR} = \frac{" + str(round(grr, 6)) + r"}{" + str(round(tv_safe, 6)) + r"} \times 100",
            result=pct_study_grr,
        )
        collector.step(
            label="%Study EV",
            formula_latex=r"\%\text{Study EV} = \frac{\text{EV}}{\text{TV}} \times 100",
            substitution_latex=r"\%\text{Study EV} = \frac{" + str(round(ev, 6)) + r"}{" + str(round(tv_safe, 6)) + r"} \times 100",
            result=pct_study_ev,
        )
        collector.step(
            label="%Study AV",
            formula_latex=r"\%\text{Study AV} = \frac{\text{AV}}{\text{TV}} \times 100",
            substitution_latex=r"\%\text{Study AV} = \frac{" + str(round(av, 6)) + r"}{" + str(round(tv_safe, 6)) + r"} \times 100",
            result=pct_study_av,
        )

    # %Tolerance
    pct_tolerance_grr: float | None = None
    if tolerance is not None and tolerance > 0:
        pct_tolerance_grr = (5.15 * grr / tolerance) * 100.0
        if collector:
            collector.step(
                label="%Tolerance GRR",
                formula_latex=r"\%\text{Tol GRR} = \frac{5.15 \times \text{GRR}}{\text{USL} - \text{LSL}} \times 100",
                substitution_latex=r"\%\text{Tol GRR} = \frac{5.15 \times " + str(round(grr, 6)) + r"}{" + str(round(tolerance, 6)) + r"} \times 100",
                result=pct_tolerance_grr,
            )

    # Number of distinct categories (ndc >= 1)
    grr_safe = grr if grr > 0 else 1e-30
    ndc = max(1, math.floor(1.41 * pv / grr_safe))

    if collector:
        collector.step(
            label="ndc (Number of Distinct Categories)",
            formula_latex=r"\text{ndc} = \lfloor 1.41 \times \frac{\text{PV}}{\text{GRR}} \rfloor",
            substitution_latex=r"\text{ndc} = \lfloor 1.41 \times \frac{" + str(round(pv, 6)) + r"}{" + str(round(grr_safe, 6)) + r"} \rfloor",
            result=float(ndc),
        )

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
        collector: ExplanationCollector | None = None,
    ) -> GageRRResult:
        """Two-way crossed ANOVA with interaction.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
                All operators measure the same parts.
            tolerance: USL - LSL for %Tolerance calculation.
            collector: Optional explanation collector for Show Your Work.

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

        if collector:
            collector.input("n_operators", n_ops)
            collector.input("n_parts", n_parts)
            collector.input("n_replicates", n_reps)
            collector.input("N_total", n_ops * n_parts * n_reps)

        all_values = _flatten_3d(measurements_3d)
        grand_mean = _mean(all_values)

        if collector:
            collector.step(
                label="Grand Mean",
                formula_latex=r"\bar{x}_{...} = \frac{\sum x_{ijk}}{N}",
                substitution_latex=r"\bar{x}_{...} = \frac{" + str(round(sum(all_values), 6)) + r"}{" + str(len(all_values)) + r"}",
                result=grand_mean,
            )

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

        ss_equipment = max(0.0, ss_total - ss_operator - ss_part - ss_interaction)

        if collector:
            collector.step(
                label="SS_operator",
                formula_latex=r"SS_{\text{operator}} = n_p \cdot n_r \sum_{i} (\bar{x}_{i..} - \bar{x}_{...})^2",
                substitution_latex=str(n_parts) + r" \cdot " + str(n_reps) + r" \cdot \sum (\bar{x}_{i..} - " + str(round(grand_mean, 6)) + r")^2",
                result=ss_operator,
            )
            collector.step(
                label="SS_part",
                formula_latex=r"SS_{\text{part}} = n_o \cdot n_r \sum_{j} (\bar{x}_{.j.} - \bar{x}_{...})^2",
                substitution_latex=str(n_ops) + r" \cdot " + str(n_reps) + r" \cdot \sum (\bar{x}_{.j.} - " + str(round(grand_mean, 6)) + r")^2",
                result=ss_part,
            )
            collector.step(
                label="SS_interaction",
                formula_latex=r"SS_{\text{int}} = n_r \sum_{i,j} (\bar{x}_{ij.} - \bar{x}_{i..} - \bar{x}_{.j.} + \bar{x}_{...})^2",
                substitution_latex=str(n_reps) + r" \cdot \sum_{i,j} (\bar{x}_{ij.} - \bar{x}_{i..} - \bar{x}_{.j.} + " + str(round(grand_mean, 6)) + r")^2",
                result=ss_interaction,
            )
            collector.step(
                label="SS_equipment",
                formula_latex=r"SS_{\text{equip}} = SS_{\text{total}} - SS_{\text{op}} - SS_{\text{part}} - SS_{\text{int}}",
                substitution_latex=str(round(ss_total, 6)) + r" - " + str(round(ss_operator, 6)) + r" - " + str(round(ss_part, 6)) + r" - " + str(round(ss_interaction, 6)),
                result=ss_equipment,
            )

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

        if collector:
            collector.step(
                label="MS_operator",
                formula_latex=r"MS_{\text{operator}} = \frac{SS_{\text{operator}}}{df_{\text{operator}}}",
                substitution_latex=r"\frac{" + str(round(ss_operator, 6)) + r"}{" + str(df_operator) + r"}",
                result=ms_operator,
            )
            collector.step(
                label="MS_part",
                formula_latex=r"MS_{\text{part}} = \frac{SS_{\text{part}}}{df_{\text{part}}}",
                substitution_latex=r"\frac{" + str(round(ss_part, 6)) + r"}{" + str(df_part) + r"}",
                result=ms_part,
            )
            collector.step(
                label="MS_interaction",
                formula_latex=r"MS_{\text{int}} = \frac{SS_{\text{int}}}{df_{\text{int}}}",
                substitution_latex=r"\frac{" + str(round(ss_interaction, 6)) + r"}{" + str(df_interaction) + r"}",
                result=ms_interaction,
            )
            collector.step(
                label="MS_equipment",
                formula_latex=r"MS_{\text{equip}} = \frac{SS_{\text{equip}}}{df_{\text{equip}}}",
                substitution_latex=r"\frac{" + str(round(ss_equipment, 6)) + r"}{" + str(df_equipment) + r"}",
                result=ms_equipment,
            )

        # F-tests
        ms_int_safe = ms_interaction if ms_interaction > 0 else 1e-30
        ms_eq_safe = ms_equipment if ms_equipment > 0 else 1e-30

        f_operator = ms_operator / ms_int_safe
        f_part = ms_part / ms_int_safe
        f_interaction = ms_interaction / ms_eq_safe

        p_operator = float(f_dist.sf(f_operator, df_operator, df_interaction))
        p_part = float(f_dist.sf(f_part, df_part, df_interaction))
        p_interaction = float(f_dist.sf(f_interaction, df_interaction, df_equipment))

        if collector:
            collector.step(
                label="F-stat (Operator)",
                formula_latex=r"F_{\text{operator}} = \frac{MS_{\text{operator}}}{MS_{\text{interaction}}}",
                substitution_latex=r"\frac{" + str(round(ms_operator, 6)) + r"}{" + str(round(ms_int_safe, 6)) + r"}",
                result=f_operator,
                note=f"p = {round(p_operator, 6)}",
            )
            collector.step(
                label="F-stat (Part)",
                formula_latex=r"F_{\text{part}} = \frac{MS_{\text{part}}}{MS_{\text{interaction}}}",
                substitution_latex=r"\frac{" + str(round(ms_part, 6)) + r"}{" + str(round(ms_int_safe, 6)) + r"}",
                result=f_part,
                note=f"p = {round(p_part, 6)}",
            )
            collector.step(
                label="F-stat (Interaction)",
                formula_latex=r"F_{\text{interaction}} = \frac{MS_{\text{interaction}}}{MS_{\text{equipment}}}",
                substitution_latex=r"\frac{" + str(round(ms_interaction, 6)) + r"}{" + str(round(ms_eq_safe, 6)) + r"}",
                result=f_interaction,
                note=f"p = {round(p_interaction, 6)}",
            )

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
            if collector:
                collector.step(
                    label="Variance: sigma2_equipment",
                    formula_latex=r"\sigma^2_{\text{equip}} = MS_{\text{equip}}",
                    substitution_latex=str(round(ms_equipment, 6)),
                    result=sigma2_equipment,
                    note="Interaction significant (p <= 0.25)",
                )
                collector.step(
                    label="Variance: sigma2_interaction",
                    formula_latex=r"\sigma^2_{\text{int}} = \frac{MS_{\text{int}} - MS_{\text{equip}}}{n_r}",
                    substitution_latex=r"\frac{" + str(round(ms_interaction, 6)) + r" - " + str(round(ms_equipment, 6)) + r"}{" + str(n_reps) + r"}",
                    result=sigma2_interaction,
                )
                collector.step(
                    label="Variance: sigma2_operator",
                    formula_latex=r"\sigma^2_{\text{op}} = \frac{MS_{\text{op}} - MS_{\text{int}}}{n_p \cdot n_r}",
                    substitution_latex=r"\frac{" + str(round(ms_operator, 6)) + r" - " + str(round(ms_interaction, 6)) + r"}{" + str(n_parts * n_reps) + r"}",
                    result=sigma2_operator,
                )
                collector.step(
                    label="Variance: sigma2_part",
                    formula_latex=r"\sigma^2_{\text{part}} = \frac{MS_{\text{part}} - MS_{\text{int}}}{n_o \cdot n_r}",
                    substitution_latex=r"\frac{" + str(round(ms_part, 6)) + r" - " + str(round(ms_interaction, 6)) + r"}{" + str(n_ops * n_reps) + r"}",
                    result=sigma2_part,
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
            if collector:
                collector.step(
                    label="Variance: sigma2_equipment (pooled)",
                    formula_latex=r"\sigma^2_{\text{equip}} = MS_{\text{pooled}} = \frac{SS_{\text{int}} + SS_{\text{equip}}}{df_{\text{int}} + df_{\text{equip}}}",
                    substitution_latex=r"\frac{" + str(round(ss_pooled, 6)) + r"}{" + str(df_pooled) + r"}",
                    result=sigma2_equipment,
                    note="Interaction not significant (p > 0.25) — pooled with equipment",
                )
                collector.step(
                    label="Variance: sigma2_operator",
                    formula_latex=r"\sigma^2_{\text{op}} = \frac{MS_{\text{op}} - MS_{\text{pooled}}}{n_p \cdot n_r}",
                    substitution_latex=r"\frac{" + str(round(ms_operator, 6)) + r" - " + str(round(ms_pooled, 6)) + r"}{" + str(n_parts * n_reps) + r"}",
                    result=sigma2_operator,
                )
                collector.step(
                    label="Variance: sigma2_part",
                    formula_latex=r"\sigma^2_{\text{part}} = \frac{MS_{\text{part}} - MS_{\text{pooled}}}{n_o \cdot n_r}",
                    substitution_latex=r"\frac{" + str(round(ms_part, 6)) + r" - " + str(round(ms_pooled, 6)) + r"}{" + str(n_ops * n_reps) + r"}",
                    result=sigma2_part,
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
            collector=collector,
        )

    # ------------------------------------------------------------------
    # Range Method (simplified, AIAG Appendix)
    # ------------------------------------------------------------------

    def calculate_range_method(
        self,
        measurements_3d: list[list[list[float]]],
        tolerance: float | None = None,
        collector: ExplanationCollector | None = None,
    ) -> GageRRResult:
        """Simplified range-based Gage R&R estimator.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
            tolerance: USL - LSL for %Tolerance calculation.
            collector: Optional explanation collector for Show Your Work.

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

        if collector:
            collector.input("n_operators", n_ops)
            collector.input("n_parts", n_parts)
            collector.input("n_replicates", n_reps)

        # Number of ranges (cells) for EV d2* lookup
        g_ev = n_ops * n_parts
        d2_reps = _get_d2_star_2d(n_reps, g_ev)

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

        if collector:
            collector.step(
                label="R-bar (average range)",
                formula_latex=r"\bar{R} = \frac{\sum R_{ij}}{n_o \cdot n_p}",
                substitution_latex=r"\bar{R} = \frac{" + str(round(sum(ranges), 6)) + r"}{" + str(g_ev) + r"}",
                result=r_bar,
            )
            collector.step(
                label="d2* lookup (EV)",
                formula_latex=r"d_2^*(m=" + str(n_reps) + r", g=" + str(g_ev) + r")",
                substitution_latex=str(round(d2_reps, 6)),
                result=d2_reps,
                note=f"AIAG MSA 4th Ed., Appendix C (m={n_reps}, g={g_ev})",
            )
            collector.step(
                label="EV (Repeatability)",
                formula_latex=r"\text{EV} = \frac{\bar{R}}{d_2^*}",
                substitution_latex=r"\frac{" + str(round(r_bar, 6)) + r"}{" + str(round(d2_reps, 6)) + r"}",
                result=ev,
            )

        # --- Appraiser Variation (AV) ---
        # Difference between max and min operator averages
        op_means = []
        for i in range(n_ops):
            vals = [v for part in measurements_3d[i] for v in part]
            op_means.append(_mean(vals))
        x_bar_diff = max(op_means) - min(op_means)

        # K1 uses d2*(m=n_ops, g=1) — single range of operator averages
        d2_ops = _get_d2_star_2d(n_ops, 1)
        k1 = 1.0 / d2_ops
        av_squared = max(0.0, (x_bar_diff * k1) ** 2 - sigma2_equipment / (n_parts * n_reps))
        sigma2_operator = av_squared

        if collector:
            collector.step(
                label="Operator range (X-bar diff)",
                formula_latex=r"\bar{X}_{\text{diff}} = \max(\bar{X}_{i.}) - \min(\bar{X}_{i.})",
                substitution_latex=str(round(max(op_means), 6)) + r" - " + str(round(min(op_means), 6)),
                result=x_bar_diff,
            )
            collector.step(
                label="K1 factor",
                formula_latex=r"K_1 = \frac{1}{d_2^*(m=" + str(n_ops) + r", g=1)}",
                substitution_latex=r"\frac{1}{" + str(round(d2_ops, 6)) + r"}",
                result=k1,
            )
            collector.step(
                label="AV (Reproducibility)",
                formula_latex=r"\text{AV}^2 = (\bar{X}_{\text{diff}} \cdot K_1)^2 - \frac{\text{EV}^2}{n_p \cdot n_r}",
                substitution_latex=r"(" + str(round(x_bar_diff, 6)) + r" \cdot " + str(round(k1, 6)) + r")^2 - \frac{" + str(round(sigma2_equipment, 6)) + r"}{" + str(n_parts * n_reps) + r"}",
                result=math.sqrt(av_squared),
                note="Clamped to 0 if negative" if av_squared == 0.0 and (x_bar_diff * k1) ** 2 - sigma2_equipment / (n_parts * n_reps) < 0 else None,
            )

        # --- Part Variation (PV) ---
        # Range of part averages
        part_means = []
        for j in range(n_parts):
            vals = [measurements_3d[i][j][k] for i in range(n_ops) for k in range(n_reps)]
            part_means.append(_mean(vals))
        rp = max(part_means) - min(part_means)

        # K3 uses d2*(m=n_parts, g=1) — single range of part averages
        d2_parts = _get_d2_star_2d(n_parts, 1)
        k3 = 1.0 / d2_parts
        sigma2_part = (rp * k3) ** 2

        if collector:
            collector.step(
                label="Part range (Rp)",
                formula_latex=r"R_p = \max(\bar{X}_{.j}) - \min(\bar{X}_{.j})",
                substitution_latex=str(round(max(part_means), 6)) + r" - " + str(round(min(part_means), 6)),
                result=rp,
            )
            collector.step(
                label="K3 factor",
                formula_latex=r"K_3 = \frac{1}{d_2^*(m=" + str(n_parts) + r", g=1)}",
                substitution_latex=r"\frac{1}{" + str(round(d2_parts, 6)) + r"}",
                result=k3,
            )
            collector.step(
                label="PV (Part Variation)",
                formula_latex=r"\text{PV} = R_p \times K_3",
                substitution_latex=str(round(rp, 6)) + r" \times " + str(round(k3, 6)),
                result=rp * k3,
            )

        return _build_result(
            method="range",
            sigma2_equipment=sigma2_equipment,
            sigma2_operator=sigma2_operator,
            sigma2_interaction=None,
            sigma2_part=sigma2_part,
            tolerance=tolerance,
            anova_table=None,
            collector=collector,
        )

    # ------------------------------------------------------------------
    # Nested ANOVA (each operator measures different parts)
    # ------------------------------------------------------------------

    def calculate_nested_anova(
        self,
        measurements_3d: list[list[list[float]]],
        tolerance: float | None = None,
        collector: ExplanationCollector | None = None,
    ) -> GageRRResult:
        """Nested ANOVA for destructive or non-reproducible tests.

        Each operator measures different parts (parts are nested within
        operators). The 3D array has the same shape but parts are unique
        per operator.

        Args:
            measurements_3d: ``[operator][part][replicate]`` measurement array.
                Parts for different operators are distinct physical parts.
            tolerance: USL - LSL for %Tolerance calculation.
            collector: Optional explanation collector for Show Your Work.

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

        if collector:
            collector.input("n_operators", n_ops)
            collector.input("n_parts_per_operator", n_parts)
            collector.input("n_replicates", n_reps)

        all_values = _flatten_3d(measurements_3d)
        grand_mean = _mean(all_values)

        if collector:
            collector.step(
                label="Grand Mean",
                formula_latex=r"\bar{x}_{...} = \frac{\sum x_{ijk}}{N}",
                substitution_latex=r"\bar{x}_{...} = \frac{" + str(round(sum(all_values), 6)) + r"}{" + str(len(all_values)) + r"}",
                result=grand_mean,
            )

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

        if collector:
            collector.step(
                label="SS_within (repeatability)",
                formula_latex=r"SS_{\text{within}} = \sum_{i,j} \sum_k (x_{ijk} - \bar{x}_{ij.})^2",
                substitution_latex=r"SS_{\text{within}} = " + str(round(ss_within, 6)) + r", \quad df = " + str(df_within),
                result=ss_within,
            )
            collector.step(
                label="MS_within",
                formula_latex=r"MS_{\text{within}} = \frac{SS_{\text{within}}}{df_{\text{within}}}",
                substitution_latex=r"\frac{" + str(round(ss_within, 6)) + r"}{" + str(df_within) + r"}",
                result=ms_within,
            )

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

        if collector:
            collector.step(
                label="SS_parts(within operators)",
                formula_latex=r"SS_{\text{parts(op)}} = n_r \sum_{i,j} (\bar{x}_{ij.} - \bar{x}_{i..})^2",
                substitution_latex=r"SS_{\text{parts(op)}} = " + str(round(ss_parts_within_ops, 6)) + r", \quad df = " + str(df_parts_within_ops),
                result=ss_parts_within_ops,
            )
            collector.step(
                label="MS_parts(within operators)",
                formula_latex=r"MS_{\text{parts}} = \frac{SS_{\text{parts(op)}}}{df_{\text{parts(op)}}}",
                substitution_latex=r"\frac{" + str(round(ss_parts_within_ops, 6)) + r"}{" + str(df_parts_within_ops) + r"}",
                result=ms_parts,
            )

        # --- Between-operator variance ---
        ss_operator = n_parts * n_reps * sum(
            (om - grand_mean) ** 2 for om in op_means
        )
        df_operator = n_ops - 1
        ms_operator = ss_operator / df_operator if df_operator > 0 else 0.0
        sigma2_operator = max(
            0.0, (ms_operator - ms_parts) / (n_parts * n_reps)
        )

        if collector:
            collector.step(
                label="SS_operator",
                formula_latex=r"SS_{\text{op}} = n_p \cdot n_r \sum_{i} (\bar{x}_{i..} - \bar{x}_{...})^2",
                substitution_latex=str(n_parts) + r" \cdot " + str(n_reps) + r" \cdot \sum (\bar{x}_{i..} - " + str(round(grand_mean, 6)) + r")^2",
                result=ss_operator,
            )
            collector.step(
                label="MS_operator",
                formula_latex=r"MS_{\text{op}} = \frac{SS_{\text{op}}}{df_{\text{op}}}",
                substitution_latex=r"\frac{" + str(round(ss_operator, 6)) + r"}{" + str(df_operator) + r"}",
                result=ms_operator,
            )
            collector.step(
                label="Variance: sigma2_equipment",
                formula_latex=r"\sigma^2_{\text{equip}} = MS_{\text{within}}",
                substitution_latex=str(round(ms_within, 6)),
                result=sigma2_equipment,
            )
            collector.step(
                label="Variance: sigma2_part",
                formula_latex=r"\sigma^2_{\text{part}} = \frac{MS_{\text{parts}} - MS_{\text{within}}}{n_r}",
                substitution_latex=r"\frac{" + str(round(ms_parts, 6)) + r" - " + str(round(ms_within, 6)) + r"}{" + str(n_reps) + r"}",
                result=sigma2_part,
            )
            collector.step(
                label="Variance: sigma2_operator",
                formula_latex=r"\sigma^2_{\text{op}} = \frac{MS_{\text{op}} - MS_{\text{parts}}}{n_p \cdot n_r}",
                substitution_latex=r"\frac{" + str(round(ms_operator, 6)) + r" - " + str(round(ms_parts, 6)) + r"}{" + str(n_parts * n_reps) + r"}",
                result=sigma2_operator,
            )

        return _build_result(
            method="nested_anova",
            sigma2_equipment=sigma2_equipment,
            sigma2_operator=sigma2_operator,
            sigma2_interaction=None,
            sigma2_part=sigma2_part,
            tolerance=tolerance,
            anova_table=None,
            collector=collector,
        )
