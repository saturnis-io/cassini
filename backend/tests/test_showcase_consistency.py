"""Validate that seeded showcase data is internally consistent.

Catches the class of bug where stored results_json values diverge from
what the engine actually computes from the stored measurements.  Any
"Show Your Work" explain endpoint that recalculates will expose the
mismatch at runtime — this test catches it at seed time.

Run:
    cd apps/cassini/backend
    python -m pytest tests/test_showcase_consistency.py -v
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pytest

from cassini.core.doe.analysis import (
    compute_anova,
    compute_interactions,
    compute_main_effects,
)
from cassini.core.msa.attribute_msa import AttributeMSAEngine
from cassini.core.msa.engine import GageRREngine

SEED_SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "seed_showcase.py"
TOLERANCE = 1e-6  # Allow tiny floating-point drift


@pytest.fixture(scope="module")
def showcase_db(tmp_path_factory: pytest.TempPathFactory) -> sqlite3.Connection:
    """Seed a fresh showcase DB and return an open connection."""
    db_path = tmp_path_factory.mktemp("showcase") / "showcase.db"
    result = subprocess.run(
        [sys.executable, str(SEED_SCRIPT), "--db-path", str(db_path), "--force"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Seed failed:\n{result.stderr}"
    conn = sqlite3.connect(str(db_path))
    yield conn
    conn.close()


# ── Helpers ──────────────────────────────────────────────────────────────


def _load_variable_msa_data(
    cur: sqlite3.Cursor, study_id: int, n_ops: int, n_parts: int, n_reps: int
) -> list[list[list[float]]]:
    """Rebuild the 3D measurement array from DB rows."""
    cur.execute(
        "SELECT id FROM msa_operator WHERE study_id=? ORDER BY sequence_order",
        (study_id,),
    )
    op_ids = [r[0] for r in cur.fetchall()]

    cur.execute(
        "SELECT id FROM msa_part WHERE study_id=? ORDER BY sequence_order",
        (study_id,),
    )
    part_ids = [r[0] for r in cur.fetchall()]

    op_index = {oid: i for i, oid in enumerate(op_ids)}
    part_index = {pid: i for i, pid in enumerate(part_ids)}

    data_3d: list[list[list[float | None]]] = [
        [[None] * n_reps for _ in range(n_parts)] for _ in range(n_ops)
    ]
    cur.execute(
        "SELECT operator_id, part_id, replicate_num, value "
        "FROM msa_measurement WHERE study_id=?",
        (study_id,),
    )
    for oid, pid, rep, val in cur.fetchall():
        oi = op_index.get(oid)
        pi = part_index.get(pid)
        if oi is not None and pi is not None:
            data_3d[oi][pi][rep - 1] = val

    # Verify completeness
    for i in range(n_ops):
        for j in range(n_parts):
            for k in range(n_reps):
                assert data_3d[i][j][k] is not None, (
                    f"Missing measurement: op={i} part={j} rep={k}"
                )

    return data_3d  # type: ignore[return-value]


def _load_attribute_msa_data(
    cur: sqlite3.Cursor, study_id: int, n_ops: int, n_parts: int, n_reps: int
) -> tuple[list[list[list[str]]], list[str]]:
    """Rebuild attribute 3D array and operator names from DB rows."""
    cur.execute(
        "SELECT id, name FROM msa_operator WHERE study_id=? ORDER BY sequence_order",
        (study_id,),
    )
    ops = cur.fetchall()
    op_ids = [r[0] for r in ops]
    op_names = [r[1] for r in ops]

    cur.execute(
        "SELECT id FROM msa_part WHERE study_id=? ORDER BY sequence_order",
        (study_id,),
    )
    part_ids = [r[0] for r in cur.fetchall()]

    op_index = {oid: i for i, oid in enumerate(op_ids)}
    part_index = {pid: i for i, pid in enumerate(part_ids)}

    attr_3d: list[list[list[str | None]]] = [
        [[None] * n_reps for _ in range(n_parts)] for _ in range(n_ops)
    ]
    cur.execute(
        "SELECT operator_id, part_id, replicate_num, attribute_value "
        "FROM msa_measurement WHERE study_id=?",
        (study_id,),
    )
    for oid, pid, rep, val in cur.fetchall():
        oi = op_index.get(oid)
        pi = part_index.get(pid)
        if oi is not None and pi is not None:
            attr_3d[oi][pi][rep - 1] = val

    return attr_3d, op_names  # type: ignore[return-value]


# ── MSA Tests ────────────────────────────────────────────────────────────


class TestMSAConsistency:
    """Every MSA study's stored results must match engine recalculation."""

    def test_variable_studies_match(self, showcase_db: sqlite3.Connection) -> None:
        """All variable MSA studies: stored results == engine output."""
        cur = showcase_db.cursor()
        cur.execute(
            "SELECT id, name, study_type, num_operators, num_parts, "
            "num_replicates, tolerance, results_json "
            "FROM msa_study WHERE status='complete' "
            "AND study_type IN ('crossed_anova', 'range_method', 'nested_anova')"
        )
        studies = cur.fetchall()
        assert len(studies) > 0, "No completed variable MSA studies found in seed data"

        engine = GageRREngine()
        failures: list[str] = []

        for sid, name, stype, n_ops, n_parts, n_reps, tol, rj in studies:
            stored = json.loads(rj)
            data_3d = _load_variable_msa_data(cur, sid, n_ops, n_parts, n_reps)

            if stype == "crossed_anova":
                result = engine.calculate_crossed_anova(data_3d, tol)
            elif stype == "range_method":
                result = engine.calculate_range_method(data_3d, tol)
            else:
                result = engine.calculate_nested_anova(data_3d, tol)

            computed = asdict(result)

            # Compare every numeric field
            for key in computed:
                sv = stored.get(key)
                cv = computed[key]

                # Skip non-numeric / nested structures compared separately
                if key == "anova_table":
                    if sv is not None and cv is not None:
                        self._compare_anova_tables(
                            sv, cv, f"Study '{name}' (id={sid})", failures
                        )
                    continue

                if sv is None and cv is None:
                    continue
                if sv is None or cv is None:
                    failures.append(
                        f"Study '{name}' (id={sid}): {key} — "
                        f"stored={sv}, computed={cv}"
                    )
                    continue

                if isinstance(cv, (int, float)) and isinstance(sv, (int, float)):
                    if abs(cv - sv) > TOLERANCE:
                        failures.append(
                            f"Study '{name}' (id={sid}): {key} — "
                            f"stored={sv}, computed={cv}, "
                            f"diff={abs(cv - sv):.10f}"
                        )

        assert not failures, (
            "MSA stored results diverge from engine computation:\n"
            + "\n".join(f"  - {f}" for f in failures)
        )

    def test_attribute_studies_match(self, showcase_db: sqlite3.Connection) -> None:
        """All attribute MSA studies: stored results == engine output."""
        cur = showcase_db.cursor()
        cur.execute(
            "SELECT id, name, num_operators, num_parts, num_replicates, results_json "
            "FROM msa_study WHERE status='complete' "
            "AND study_type='attribute_agreement'"
        )
        studies = cur.fetchall()
        assert len(studies) > 0, "No completed attribute MSA studies in seed data"

        attr_engine = AttributeMSAEngine()
        failures: list[str] = []

        for sid, name, n_ops, n_parts, n_reps, rj in studies:
            stored = json.loads(rj)
            attr_3d, op_names = _load_attribute_msa_data(
                cur, sid, n_ops, n_parts, n_reps
            )
            result = attr_engine.calculate(attr_3d, operator_names=op_names)
            computed = asdict(result)

            for key in computed:
                sv = stored.get(key)
                cv = computed[key]

                if isinstance(cv, dict) and isinstance(sv, dict):
                    for subkey in set(list(cv.keys()) + list(sv.keys())):
                        s_sub = sv.get(subkey)
                        c_sub = cv.get(subkey)
                        if (
                            isinstance(c_sub, (int, float))
                            and isinstance(s_sub, (int, float))
                            and abs(c_sub - s_sub) > TOLERANCE
                        ):
                            failures.append(
                                f"Study '{name}': {key}.{subkey} — "
                                f"stored={s_sub}, computed={c_sub}"
                            )
                    continue

                if sv is None and cv is None:
                    continue
                if isinstance(cv, (int, float)) and isinstance(sv, (int, float)):
                    if abs(cv - sv) > TOLERANCE:
                        failures.append(
                            f"Study '{name}': {key} — "
                            f"stored={sv}, computed={cv}"
                        )
                elif isinstance(cv, str) and isinstance(sv, str):
                    if cv != sv:
                        failures.append(
                            f"Study '{name}': {key} — "
                            f"stored={sv!r}, computed={cv!r}"
                        )

        assert not failures, (
            "Attribute MSA stored results diverge from engine computation:\n"
            + "\n".join(f"  - {f}" for f in failures)
        )

    @staticmethod
    def _compare_anova_tables(
        stored: dict | list,
        computed: dict | list,
        label: str,
        failures: list[str],
    ) -> None:
        """Compare ANOVA table entries (may be dict-of-dicts or list-of-dicts)."""
        # Normalize to list-of-dicts for comparison
        if isinstance(stored, dict):
            stored_rows = [
                {"source": k, **v} for k, v in stored.items()
            ]
        else:
            stored_rows = stored

        if isinstance(computed, dict):
            computed_rows = [
                {"source": k, **v} for k, v in computed.items()
            ]
        else:
            computed_rows = computed

        stored_by_source = {r.get("source", r.get("Source")): r for r in stored_rows}
        computed_by_source = {r.get("source", r.get("Source")): r for r in computed_rows}

        for source in set(list(stored_by_source.keys()) + list(computed_by_source.keys())):
            sr = stored_by_source.get(source, {})
            cr = computed_by_source.get(source, {})
            for field in ("SS", "df", "MS", "F", "p", "sum_of_squares",
                          "mean_square", "f_value", "p_value"):
                sv = sr.get(field)
                cv = cr.get(field)
                if sv is None or cv is None:
                    continue
                if isinstance(sv, (int, float)) and isinstance(cv, (int, float)):
                    if abs(sv - cv) > TOLERANCE:
                        failures.append(
                            f"{label}: ANOVA[{source}].{field} — "
                            f"stored={sv}, computed={cv}"
                        )


# ── DOE Tests ────────────────────────────────────────────────────────────


class TestDOEConsistency:
    """DOE analysis stored results must match recomputation from runs."""

    def test_doe_analysis_matches(self, showcase_db: sqlite3.Connection) -> None:
        """All DOE analyses: stored ANOVA/effects/interactions == recomputed."""
        cur = showcase_db.cursor()

        # Find studies that have both runs and analysis
        cur.execute(
            "SELECT a.id, a.study_id, a.anova_table, a.effects, "
            "a.interactions, a.r_squared, a.adj_r_squared, "
            "a.regression_model, a.grand_mean "
            "FROM doe_analysis a"
        )
        analyses = cur.fetchall()
        if not analyses:
            pytest.skip("No DOE analyses in seed data")

        failures: list[str] = []

        for (
            aid, study_id, anova_json, effects_json, interactions_json,
            stored_r2, stored_adj_r2, regression_json, stored_grand_mean,
        ) in analyses:
            # Load factor definitions
            cur.execute(
                "SELECT name, low_level, high_level, center_point "
                "FROM doe_factor WHERE study_id=? ORDER BY display_order",
                (study_id,),
            )
            factor_rows = cur.fetchall()
            if not factor_rows:
                continue
            factor_names = [r[0] for r in factor_rows]
            factor_defs = [
                {"name": r[0], "low_level": r[1], "high_level": r[2],
                 "center_point": r[3]}
                for r in factor_rows
            ]

            # Load runs (actual factor values + response)
            cur.execute(
                "SELECT factor_values, response_value FROM doe_run "
                "WHERE study_id=? AND response_value IS NOT NULL "
                "ORDER BY standard_order",
                (study_id,),
            )
            runs = cur.fetchall()
            if not runs:
                continue

            # Build design matrix by converting actual → coded
            # (mirrors DOEEngine.analyze)
            design_rows = []
            response_vals = []
            for fv_json, resp in runs:
                fv = json.loads(fv_json)
                row = []
                for fdef in factor_defs:
                    low = fdef["low_level"]
                    high = fdef["high_level"]
                    center = fdef["center_point"] or (low + high) / 2.0
                    half_range = (high - low) / 2.0
                    if half_range > 0:
                        actual_val = fv.get(fdef["name"], center)
                        row.append((actual_val - center) / half_range)
                    else:
                        row.append(0.0)
                design_rows.append(row)
                response_vals.append(float(resp))

            design = np.array(design_rows)
            response = np.array(response_vals)

            label = f"DOE study_id={study_id} analysis_id={aid}"

            # Compute full-model MSE (must match finalize_calculations)
            from itertools import combinations
            n_obs, k = design.shape
            int_pairs = list(combinations(range(k), 2))
            cols = [np.ones(n_obs)]
            for c in range(k):
                cols.append(design[:, c])
            for i, j in int_pairs:
                cols.append(design[:, i] * design[:, j])
            X_full = np.column_stack(cols)
            df_resid_full = n_obs - X_full.shape[1]
            beta = np.linalg.lstsq(X_full, response, rcond=None)[0]
            resid = response - X_full @ beta
            ss_resid = float(np.sum(resid ** 2))
            mse_full = ss_resid / df_resid_full if df_resid_full > 0 else max(ss_resid, 1e-30)

            # Recompute ANOVA
            if anova_json:
                stored_anova = json.loads(anova_json)
                computed_anova = compute_anova(design, response, factor_names)

                # Compare r_squared and adj_r_squared
                if stored_r2 is not None:
                    if abs(stored_r2 - computed_anova.r_squared) > TOLERANCE:
                        failures.append(
                            f"{label}: r_squared — "
                            f"stored={stored_r2}, computed={computed_anova.r_squared}"
                        )
                if stored_adj_r2 is not None:
                    if abs(stored_adj_r2 - computed_anova.adj_r_squared) > TOLERANCE:
                        failures.append(
                            f"{label}: adj_r_squared — "
                            f"stored={stored_adj_r2}, "
                            f"computed={computed_anova.adj_r_squared}"
                        )

                # Compare ANOVA rows
                stored_by_src = {r["source"]: r for r in stored_anova}
                computed_by_src = {r.source: r for r in computed_anova.rows}

                for src in set(list(stored_by_src.keys()) + list(computed_by_src.keys())):
                    sr = stored_by_src.get(src)
                    cr = computed_by_src.get(src)
                    if sr is None or cr is None:
                        continue
                    for field, attr in [
                        ("sum_of_squares", "sum_of_squares"),
                        ("mean_square", "mean_square"),
                        ("f_value", "f_value"),
                        ("p_value", "p_value"),
                        ("df", "df"),
                    ]:
                        sv = sr.get(field)
                        cv = getattr(cr, attr, None)
                        if sv is None or cv is None:
                            continue
                        if abs(sv - cv) > TOLERANCE:
                            failures.append(
                                f"{label}: ANOVA[{src}].{field} — "
                                f"stored={sv}, computed={cv}"
                            )

            # Recompute main effects (with same MSE override as finalize_calculations)
            if effects_json:
                stored_effects = json.loads(effects_json)
                computed_effects = compute_main_effects(
                    design, response, factor_names,
                    mse_override=mse_full, df_resid_override=df_resid_full,
                )
                stored_by_name = {e["factor_name"]: e for e in stored_effects}
                computed_by_name = {e.factor_name: e for e in computed_effects}

                for fn in factor_names:
                    se = stored_by_name.get(fn)
                    ce = computed_by_name.get(fn)
                    if se is None or ce is None:
                        continue
                    for field in ("effect", "coefficient", "sum_of_squares",
                                  "t_statistic", "p_value", "significant"):
                        sv = se.get(field)
                        cv = getattr(ce, field, None)
                        if sv is not None and cv is not None:
                            if isinstance(cv, bool):
                                if sv != cv:
                                    failures.append(
                                        f"{label}: effect[{fn}].{field} — "
                                        f"stored={sv}, computed={cv}"
                                    )
                            elif abs(sv - cv) > TOLERANCE:
                                failures.append(
                                    f"{label}: effect[{fn}].{field} — "
                                    f"stored={sv}, computed={cv}"
                                )

            # Recompute interactions (with same MSE override as finalize_calculations)
            if interactions_json:
                stored_interactions = json.loads(interactions_json)
                computed_interactions = compute_interactions(
                    design, response, factor_names,
                    mse_override=mse_full, df_resid_override=df_resid_full,
                )
                stored_by_pair = {
                    tuple(ix["factors"]): ix for ix in stored_interactions
                }
                computed_by_pair = {
                    ix.factors: ix for ix in computed_interactions
                }

                for pair in stored_by_pair:
                    si = stored_by_pair[pair]
                    ci = computed_by_pair.get(pair) or computed_by_pair.get(
                        tuple(reversed(pair))
                    )
                    if ci is None:
                        continue
                    for field in ("effect", "coefficient", "sum_of_squares",
                                  "t_statistic", "p_value", "significant"):
                        sv = si.get(field)
                        cv = getattr(ci, field, None)
                        if sv is not None and cv is not None:
                            if isinstance(cv, bool):
                                if sv != cv:
                                    failures.append(
                                        f"{label}: interaction{list(pair)}.{field} — "
                                        f"stored={sv}, computed={cv}"
                                    )
                            elif abs(sv - cv) > TOLERANCE:
                                failures.append(
                                    f"{label}: interaction{list(pair)}.{field} — "
                                    f"stored={sv}, computed={cv}"
                                )

        assert not failures, (
            "DOE stored results diverge from engine computation:\n"
            + "\n".join(f"  - {f}" for f in failures)
        )


# ── Control Limits Tests ──────────────────────────────────────────────


class TestControlLimitsConsistency:
    """Stored UCL/LCL must match recomputation from stored_sigma/center_line."""

    def test_variable_chart_limits_match(self, showcase_db: sqlite3.Connection) -> None:
        """All variable Shewhart charts: stored UCL/LCL == center ± 3σ/√n."""
        import math

        cur = showcase_db.cursor()
        cur.execute(
            "SELECT id, name, subgroup_size, ucl, lcl, "
            "stored_sigma, stored_center_line, chart_type "
            "FROM characteristic "
            "WHERE stored_sigma IS NOT NULL AND stored_center_line IS NOT NULL "
            "AND data_type='variable'"
        )
        chars = cur.fetchall()
        assert len(chars) > 0, "No variable characteristics with stored limits"

        failures: list[str] = []

        for cid, name, n, ucl, lcl, sigma, center, chart_type in chars:
            if chart_type in ("cusum", "ewma"):
                continue
            if ucl is None or lcl is None:
                continue

            n = n or 1
            sigma_lim = sigma / math.sqrt(n) if n > 1 else sigma
            expected_ucl = center + 3 * sigma_lim
            expected_lcl = center - 3 * sigma_lim

            if abs(ucl - expected_ucl) > TOLERANCE:
                failures.append(
                    f"'{name}' (id={cid}, n={n}): UCL — "
                    f"stored={ucl}, expected={expected_ucl}, "
                    f"diff={abs(ucl - expected_ucl):.10f}"
                )
            if abs(lcl - expected_lcl) > TOLERANCE:
                failures.append(
                    f"'{name}' (id={cid}, n={n}): LCL — "
                    f"stored={lcl}, expected={expected_lcl}, "
                    f"diff={abs(lcl - expected_lcl):.10f}"
                )

        assert not failures, (
            "Control limits diverge from stored_sigma/center_line computation "
            "(Show Your Work will display different values):\n"
            + "\n".join(f"  - {f}" for f in failures)
        )
