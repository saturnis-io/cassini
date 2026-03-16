"""DOE study lifecycle management engine.

Orchestrates design generation, run creation, and statistical analysis
for Design of Experiments studies.  All methods are async and operate
within a SQLAlchemy async session.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from itertools import combinations
from typing import Any

import numpy as np
from scipy import stats as sp_stats
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.core.doe.analysis import (
    DesirabilityConfig,
    compute_anova,
    compute_block_ss,
    compute_individual_desirability,
    compute_interactions,
    compute_main_effects,
    compute_overall_desirability,
    compute_regression,
)
from cassini.core.doe.designs import (
    DesignResult,
    box_behnken,
    central_composite,
    coded_to_actual,
    fractional_factorial,
    full_factorial,
    plackett_burman,
)
from cassini.core.doe.optimal import d_optimal
from cassini.core.doe.taguchi import (
    ANOMResult,
    compute_anom,
    taguchi,
)
from cassini.db.models.doe import DOEAnalysis, DOEFactor, DOERun, DOEStudy
from cassini.db.repositories.doe_repo import (
    DOEAnalysisRepository,
    DOERunRepository,
    DOEStudyRepository,
)

logger = logging.getLogger(__name__)

# Maps study.design_type values to generator functions and kwargs
_DESIGN_DISPATCH: dict[str, str] = {
    "full_factorial": "full_factorial",
    "fractional_factorial": "fractional_factorial",
    "plackett_burman": "plackett_burman",
    "central_composite": "central_composite",
    "ccd": "central_composite",
    "box_behnken": "box_behnken",
    "d_optimal": "d_optimal",
    "taguchi": "taguchi",
}

# Design types that support RSM (quadratic regression)
_RSM_DESIGNS = {"central_composite", "ccd", "box_behnken"}

# Design types where interaction estimation is unreliable (Resolution III
# screening designs — main effects are partially confounded with 2FIs)
_NO_INTERACTION_DESIGNS = {"plackett_burman"}

# Design types that use Taguchi ANOM analysis instead of standard ANOVA
_TAGUCHI_DESIGNS = {"taguchi"}


class DOEEngine:
    """Manages the DOE study lifecycle: design generation and analysis.

    All methods accept an ``AsyncSession`` and operate within the caller's
    transaction boundary (no commit — the caller controls the session).
    """

    async def generate_design(
        self,
        session: AsyncSession,
        study_id: int,
        seed: int | None = None,
    ) -> list[dict[str, Any]]:
        """Generate the experimental design and create DOERun rows.

        Loads the study and its factors, calls the appropriate design
        generator, converts coded values to actual factor levels, deletes
        any existing runs (supporting re-generation), creates new DOERun
        rows, and advances the study status to ``'collecting'``.

        Args:
            session: Active async database session.
            study_id: Primary key of the DOE study.
            seed: Optional random seed for run-order randomization.

        Returns:
            List of dicts representing the created runs, each with keys:
            ``run_order``, ``standard_order``, ``factor_values`` (actual),
            ``is_center_point``.

        Raises:
            ValueError: If the study is not found, has no factors, or the
                        design type is unsupported.
        """
        repo = DOEStudyRepository(session)
        study = await repo.get_with_details(study_id)

        if study is None:
            raise ValueError(f"DOE study {study_id} not found")

        if not study.factors:
            raise ValueError(
                f"DOE study {study_id} has no factors defined"
            )

        factors = sorted(study.factors, key=lambda f: f.display_order)
        n_factors = len(factors)
        design_type = study.design_type.lower()

        if design_type not in _DESIGN_DISPATCH:
            raise ValueError(
                f"Unsupported design type '{study.design_type}'. "
                f"Supported: {', '.join(sorted(_DESIGN_DISPATCH.keys()))}"
            )

        # Build factor ranges for D-optimal (coded: -1 to +1)
        factor_ranges: list[tuple[float, float]] | None = None
        if design_type == "d_optimal":
            factor_ranges = [(-1.0, 1.0)] * n_factors

        # Parse n_blocks from study config (stored in notes or separate field)
        n_blocks: int | None = getattr(study, "n_blocks", None)

        # Call the appropriate generator
        design_result = self._call_generator(
            design_type, n_factors, study.resolution, seed,
            n_runs=study.n_runs,
            model_order=study.model_order,
            factor_ranges=factor_ranges,
            n_blocks=n_blocks,
        )

        # Convert coded to actual values
        factor_defs = [
            {
                "name": f.name,
                "low_level": f.low_level,
                "high_level": f.high_level,
                "center_point": f.center_point,
            }
            for f in factors
        ]
        actual_matrix = coded_to_actual(design_result.coded_matrix, factor_defs)

        # Delete existing runs (regeneration support)
        run_repo = DOERunRepository(session)
        await session.execute(
            delete(DOERun).where(DOERun.study_id == study_id)
        )

        # Create DOERun rows
        factor_names = [f.name for f in factors]
        runs: list[DOERun] = []
        run_dicts: list[dict[str, Any]] = []

        for row_idx in range(design_result.n_runs):
            # Build factor_values dict (actual values)
            fv = {
                factor_names[col]: float(actual_matrix[row_idx, col])
                for col in range(n_factors)
            }
            # factor_actuals starts as copy of designed values
            fa = dict(fv)

            # Block assignment (if blocking is active)
            blk: int | None = None
            if design_result.block_assignments is not None:
                blk = design_result.block_assignments[row_idx]

            run = DOERun(
                study_id=study_id,
                run_order=design_result.run_order[row_idx],
                standard_order=design_result.standard_order[row_idx],
                factor_values=json.dumps(fv),
                factor_actuals=json.dumps(fa),
                is_center_point=design_result.is_center_point[row_idx],
                replicate=1,
                block=blk,
            )
            runs.append(run)
            run_dicts.append({
                "run_order": run.run_order,
                "standard_order": run.standard_order,
                "factor_values": fv,
                "is_center_point": run.is_center_point,
                "block": blk,
            })

        await run_repo.bulk_create(runs)

        # Advance study status
        study.status = "collecting"
        study.updated_at = datetime.now(timezone.utc)
        await session.flush()

        logger.info(
            "Generated %s design for study %d: %d runs, %d factors",
            design_type, study_id, design_result.n_runs, n_factors,
        )

        return run_dicts

    async def analyze(
        self,
        session: AsyncSession,
        study_id: int,
    ) -> dict[str, Any]:
        """Run ANOVA and regression analysis on a completed DOE study.

        Loads the study with factors and runs, validates that all runs
        have response values, builds the design matrix and response
        array, computes effects/interactions/ANOVA, and for RSM designs
        also fits a quadratic regression model.

        Persists a :class:`DOEAnalysis` row and advances the study
        status to ``'analyzed'``.

        Args:
            session: Active async database session.
            study_id: Primary key of the DOE study.

        Returns:
            Dict with keys: ``effects``, ``interactions``, ``anova``,
            ``r_squared``, ``adj_r_squared``, and optionally
            ``regression`` and ``optimal_settings``.

        Raises:
            ValueError: If the study is not found, has no runs, or any
                        run is missing a response value.
        """
        repo = DOEStudyRepository(session)
        study = await repo.get_with_details(study_id)

        if study is None:
            raise ValueError(f"DOE study {study_id} not found")

        if not study.runs:
            raise ValueError(
                f"DOE study {study_id} has no experimental runs"
            )

        # Parse response columns config for multi-response desirability
        response_configs: list[DesirabilityConfig] | None = None
        if study.response_columns:
            try:
                rc_list = json.loads(study.response_columns)
                response_configs = [
                    DesirabilityConfig(
                        name=rc["name"],
                        direction=rc["direction"],
                        lower=rc["lower"],
                        target=rc["target"],
                        upper=rc["upper"],
                        weight=rc.get("weight", 1.0),
                        shape=rc.get("shape", 1.0),
                        shape_upper=rc.get("shape_upper"),
                    )
                    for rc in rc_list
                ]
            except (json.JSONDecodeError, KeyError, TypeError):
                logger.warning(
                    "Failed to parse response_columns for study %d",
                    study_id,
                )

        # Validate all runs have response values
        # For multi-response: check response_values JSON
        if response_configs:
            config_names = {rc.name for rc in response_configs}
            missing_runs: list[int] = []
            for r in study.runs:
                if r.response_values:
                    try:
                        rv = json.loads(r.response_values)
                        if not config_names.issubset(rv.keys()):
                            missing_runs.append(r.run_order)
                    except (json.JSONDecodeError, TypeError):
                        missing_runs.append(r.run_order)
                elif r.response_value is None:
                    missing_runs.append(r.run_order)
            if missing_runs:
                raise ValueError(
                    f"Runs missing response values (run_order): {missing_runs}"
                )
        else:
            missing = [
                r.run_order for r in study.runs if r.response_value is None
            ]
            if missing:
                raise ValueError(
                    f"Runs missing response values (run_order): {missing}"
                )

        factors = sorted(study.factors, key=lambda f: f.display_order)
        factor_names = [f.name for f in factors]
        n_factors = len(factors)
        design_type = study.design_type.lower()

        # Sort runs by standard_order for consistent matrix construction
        sorted_runs = sorted(study.runs, key=lambda r: r.standard_order)

        # Build design matrix from actual factor values
        # We need the coded matrix for analysis, so reconstruct from actuals
        factor_defs = [
            {
                "name": f.name,
                "low_level": f.low_level,
                "high_level": f.high_level,
                "center_point": f.center_point,
            }
            for f in factors
        ]

        design_matrix = np.zeros((len(sorted_runs), n_factors), dtype=float)
        response_arr = np.zeros(len(sorted_runs), dtype=float)

        for row_idx, run in enumerate(sorted_runs):
            fv = json.loads(run.factor_values)
            for col_idx, fdef in enumerate(factor_defs):
                # Convert actual back to coded
                low = fdef["low_level"]
                high = fdef["high_level"]
                center = fdef.get("center_point") or (low + high) / 2.0
                half_range = (high - low) / 2.0
                if half_range > 0:
                    actual_val = fv.get(fdef["name"], center)
                    design_matrix[row_idx, col_idx] = (
                        (actual_val - center) / half_range
                    )
                else:
                    design_matrix[row_idx, col_idx] = 0.0

            response_arr[row_idx] = run.response_value  # type: ignore[assignment]

        # Grand mean of all response values
        grand_mean = float(np.mean(response_arr))

        # -------------------------------------------------------------------
        # Taguchi designs use ANOM (Analysis of Means) instead of ANOVA
        # -------------------------------------------------------------------
        if design_type in _TAGUCHI_DESIGNS:
            return await self._analyze_taguchi(
                session, study, design_matrix, response_arr,
                factor_names, grand_mean,
            )

        # Check if this design type supports interaction estimation
        skip_interactions = design_type in _NO_INTERACTION_DESIGNS

        # Compute full-model MSE once (main effects + two-factor interactions)
        # so that both compute_main_effects and compute_interactions use the
        # same denominator for their t-tests, making p-values comparable.
        # For PB designs, use main-effects-only model (no interactions).
        _n_obs = design_matrix.shape[0]
        _k = design_matrix.shape[1]
        _cols = [np.ones(_n_obs)]
        for _c in range(_k):
            _cols.append(design_matrix[:, _c])

        if not skip_interactions:
            _int_pairs = list(combinations(range(_k), 2))
            for _i, _j in _int_pairs:
                _cols.append(design_matrix[:, _i] * design_matrix[:, _j])

        _X_full = np.column_stack(_cols)
        _p_full = _X_full.shape[1]
        _df_resid_full = _n_obs - _p_full

        _beta: np.ndarray | None = None
        try:
            _beta = np.linalg.lstsq(_X_full, response_arr, rcond=None)[0]
            _resid = response_arr - _X_full @ _beta
            _ss_resid = float(np.sum(_resid ** 2))
        except np.linalg.LinAlgError:
            _ss_resid = float(np.sum((response_arr - grand_mean) ** 2))

        if _df_resid_full > 0:
            _mse_full = _ss_resid / _df_resid_full
        else:
            _mse_full = max(_ss_resid, 1e-30)

        # Compute effects and interactions with consistent MSE
        effects = compute_main_effects(
            design_matrix, response_arr, factor_names,
            mse_override=_mse_full,
            df_resid_override=_df_resid_full,
        )

        if skip_interactions:
            interactions: list = []
        else:
            interactions = compute_interactions(
                design_matrix, response_arr, factor_names,
                mse_override=_mse_full,
                df_resid_override=_df_resid_full,
            )
        anova = compute_anova(design_matrix, response_arr, factor_names)

        # Blocking: compute block SS and insert into ANOVA table
        block_arr = np.array([
            r.block if r.block is not None else 0
            for r in sorted_runs
        ])
        has_blocks = np.any(block_arr > 0)

        anova_rows_dicts = [
            {
                "source": row.source,
                "df": row.df,
                "sum_of_squares": row.sum_of_squares,
                "mean_square": row.mean_square,
                "f_value": row.f_value,
                "p_value": row.p_value,
            }
            for row in anova.rows
        ]

        if has_blocks:
            ss_block, df_block = compute_block_ss(response_arr, block_arr)
            ms_block = ss_block / max(df_block, 1)
            # Insert block row before the Residual row
            block_row = {
                "source": "Blocks",
                "df": df_block,
                "sum_of_squares": float(ss_block),
                "mean_square": float(ms_block),
                "f_value": None,  # F-test optional for blocks
                "p_value": None,
            }
            # Insert before 'Residual' (second-to-last row)
            insert_idx = len(anova_rows_dicts) - 2
            if insert_idx < 0:
                insert_idx = 0
            anova_rows_dicts.insert(insert_idx, block_row)

        # Build result dict
        result: dict[str, Any] = {
            "grand_mean": grand_mean,
            "effects": [
                {
                    "factor_name": e.factor_name,
                    "effect": e.effect,
                    "coefficient": e.coefficient,
                    "sum_of_squares": e.sum_of_squares,
                    "t_statistic": e.t_statistic,
                    "p_value": e.p_value,
                    "significant": e.significant,
                }
                for e in effects
            ],
            "interactions": [
                {
                    "factors": list(ix.factors),
                    "effect": ix.effect,
                    "coefficient": ix.coefficient,
                    "sum_of_squares": ix.sum_of_squares,
                    "t_statistic": ix.t_statistic,
                    "p_value": ix.p_value,
                    "significant": ix.significant,
                }
                for ix in interactions
            ],
            "anova": anova_rows_dicts,
            "r_squared": anova.r_squared,
            "adj_r_squared": anova.adj_r_squared,
            "pred_r_squared": anova.pred_r_squared,
            "lack_of_fit_f": anova.lack_of_fit_f,
            "lack_of_fit_p": anova.lack_of_fit_p,
        }

        # Add warning for designs that cannot estimate interactions
        if skip_interactions:
            result["warnings"] = [
                "Plackett-Burman designs are Resolution III — main effects "
                "are partially confounded with two-factor interactions. "
                "Interaction estimates are not available. Use a higher-"
                "resolution design (e.g., fractional factorial Res IV+) "
                "if interaction estimation is needed."
            ]

        # Compute and store (X'X)^-1 for prediction intervals
        # (used by confirmation runs)
        xtx_inv_json: str | None = None
        try:
            _XtX = _X_full.T @ _X_full
            _XtX_inv = np.linalg.inv(_XtX)
            xtx_inv_json = json.dumps(_XtX_inv.tolist())
        except np.linalg.LinAlgError:
            logger.warning(
                "Could not compute (X'X)^-1 for study %d — "
                "confirmation run prediction intervals unavailable",
                study_id,
            )

        # RSM regression for CCD and Box-Behnken designs
        regression_json: str | None = None
        optimal_json: str | None = None

        if design_type in _RSM_DESIGNS:
            reg = compute_regression(
                design_matrix, response_arr, factor_names,
                include_squares=True, include_interactions=True,
            )
            result["regression"] = {
                "coefficients": reg.coefficients,
                "intercept": reg.intercept,
                "r_squared": reg.r_squared,
                "adj_r_squared": reg.adj_r_squared,
            }
            regression_json = json.dumps(reg.coefficients)

            if reg.optimal_settings is not None:
                result["optimal_settings"] = reg.optimal_settings
                optimal_json = json.dumps(reg.optimal_settings)

            # Use regression R^2 for RSM designs (more complete model)
            result["r_squared"] = reg.r_squared
            result["adj_r_squared"] = reg.adj_r_squared

        # Compute residual diagnostics
        if design_type in _RSM_DESIGNS:
            # Use regression model residuals (more complete model)
            residual_arr = np.asarray(reg.residuals, dtype=float)
            fitted_arr = np.asarray(reg.predicted, dtype=float)
        elif _beta is not None:
            # Use full-model OLS residuals (main effects + interactions)
            fitted_arr = _X_full @ _beta
            residual_arr = response_arr - fitted_arr
        else:
            # Fallback: residuals from grand mean (lstsq failed)
            fitted_arr = np.full_like(response_arr, grand_mean)
            residual_arr = response_arr - grand_mean

        result["residuals"] = [float(r) for r in residual_arr]
        result["fitted_values"] = [float(f) for f in fitted_arr]

        # Normality test (Shapiro-Wilk, requires n >= 3)
        if len(residual_arr) >= 3:
            try:
                stat, p_value = sp_stats.shapiro(residual_arr)
                result["normality_test"] = {
                    "statistic": float(stat),
                    "p_value": float(p_value),
                    "method": "shapiro-wilk",
                }
            except Exception:
                logger.warning(
                    "Shapiro-Wilk test failed for study %d", study_id,
                )

        # Outlier detection (|residual| > 3 * residual standard error)
        # Use residual df if available, fallback to ddof=1
        if _df_resid_full > 0:
            residual_std = float(np.sqrt(np.sum(residual_arr**2) / _df_resid_full))
        else:
            residual_std = float(np.std(residual_arr, ddof=1)) if len(residual_arr) > 1 else 0.0
        if residual_std > 1e-30:
            result["outlier_indices"] = [
                int(i) for i, r in enumerate(residual_arr)
                if abs(r) > 3 * residual_std
            ]
        else:
            result["outlier_indices"] = []

        # Residual statistics
        result["residual_stats"] = {
            "mean": float(np.mean(residual_arr)),
            "std": float(residual_std),
            "min": float(np.min(residual_arr)),
            "max": float(np.max(residual_arr)),
        }

        # Multi-response desirability
        desirability_json: str | None = None
        if response_configs:
            # Compute desirability for each run using the optimal settings
            # For each run, compute individual + overall desirability
            run_desirabilities: list[dict[str, Any]] = []
            for run in sorted_runs:
                rv: dict[str, float] = {}
                if run.response_values:
                    try:
                        rv = json.loads(run.response_values)
                    except (json.JSONDecodeError, TypeError):
                        pass
                # Fallback: single response
                if not rv and run.response_value is not None:
                    rv = {study.response_name: run.response_value}

                dr = compute_overall_desirability(rv, response_configs)
                run_desirabilities.append({
                    "run_order": run.run_order,
                    "individual": dr.individual_desirabilities,
                    "overall": dr.overall_desirability,
                })

            # Find the run with the highest overall desirability
            best_run = max(
                run_desirabilities,
                key=lambda rd: rd["overall"],
            )

            result["desirability"] = {
                "configs": [
                    {
                        "name": rc.name,
                        "direction": rc.direction,
                        "lower": rc.lower,
                        "target": rc.target,
                        "upper": rc.upper,
                        "weight": rc.weight,
                        "shape": rc.shape,
                    }
                    for rc in response_configs
                ],
                "per_run": run_desirabilities,
                "best_run_order": best_run["run_order"],
                "best_overall_desirability": best_run["overall"],
            }
            desirability_json = json.dumps(result["desirability"])

        # Persist analysis
        analysis_repo = DOEAnalysisRepository(session)
        analysis = DOEAnalysis(
            study_id=study_id,
            anova_table=json.dumps(result["anova"]),
            effects=json.dumps(result["effects"]),
            interactions=json.dumps(result["interactions"]),
            r_squared=result["r_squared"],
            adj_r_squared=result["adj_r_squared"],
            pred_r_squared=result.get("pred_r_squared"),
            lack_of_fit_f=result.get("lack_of_fit_f"),
            lack_of_fit_p=result.get("lack_of_fit_p"),
            grand_mean=result["grand_mean"],
            regression_model=regression_json,
            optimal_settings=optimal_json,
            residuals_json=json.dumps(result.get("residuals")),
            fitted_values_json=json.dumps(result.get("fitted_values")),
            normality_test_json=json.dumps(result.get("normality_test")),
            outlier_indices_json=json.dumps(result.get("outlier_indices")),
            residual_stats_json=json.dumps(result.get("residual_stats")),
            desirability_json=desirability_json,
            regression_xtx_inv=xtx_inv_json,
        )
        session.add(analysis)

        # Advance study status
        study.status = "analyzed"
        study.updated_at = datetime.now(timezone.utc)
        await session.flush()

        logger.info(
            "Analyzed DOE study %d: R²=%.4f, %d effects, %d interactions",
            study_id, result["r_squared"],
            len(result["effects"]), len(result["interactions"]),
        )

        return result

    async def _analyze_taguchi(
        self,
        session: AsyncSession,
        study: DOEStudy,
        design_matrix: np.ndarray,
        response_arr: np.ndarray,
        factor_names: list[str],
        grand_mean: float,
    ) -> dict[str, Any]:
        """Run Taguchi ANOM analysis with S/N ratios.

        This is a SEPARATE analysis path from the standard ANOVA pipeline.
        Computes S/N ratios for each run, then performs Analysis of Means
        (ANOM) to rank factors and determine optimal settings.
        """
        sn_type = getattr(study, "sn_type", None) or "smaller_is_better"

        anom_result = compute_anom(
            design_matrix, response_arr, factor_names, sn_type,
        )

        # Build response table for persistence and API
        response_table: list[dict[str, Any]] = []
        for fr in anom_result.factors:
            response_table.append({
                "factor_name": fr.factor_name,
                "level_means": fr.level_means,
                "best_level": fr.best_level,
                "best_level_value": fr.best_level_value,
                "range": fr.range,
                "rank": fr.rank,
            })

        # Build effects-like entries from ANOM for display compatibility
        effects_list: list[dict[str, Any]] = []
        for fr in anom_result.factors:
            effects_list.append({
                "factor_name": fr.factor_name,
                "effect": fr.range,
                "coefficient": fr.range / 2.0,
                "sum_of_squares": 0.0,
                "t_statistic": 0.0,
                "p_value": None,
                "significant": None,
            })

        result: dict[str, Any] = {
            "grand_mean": grand_mean,
            "effects": effects_list,
            "interactions": [],
            "anova": [],
            "r_squared": 0.0,
            "adj_r_squared": 0.0,
            "pred_r_squared": None,
            "lack_of_fit_f": None,
            "lack_of_fit_p": None,
            "taguchi_anom": {
                "sn_type": sn_type,
                "response_table": response_table,
                "optimal_settings": anom_result.optimal_settings,
                "sn_ratios": anom_result.sn_ratios,
            },
            "warnings": anom_result.warnings,
        }

        # Compute simple residuals from grand mean for diagnostics
        residual_arr = response_arr - grand_mean
        fitted_arr = np.full_like(response_arr, grand_mean)

        result["residuals"] = [float(r) for r in residual_arr]
        result["fitted_values"] = [float(f) for f in fitted_arr]
        result["outlier_indices"] = []
        result["residual_stats"] = {
            "mean": float(np.mean(residual_arr)),
            "std": float(np.std(residual_arr, ddof=1)) if len(residual_arr) > 1 else 0.0,
            "min": float(np.min(residual_arr)),
            "max": float(np.max(residual_arr)),
        }

        # Persist analysis
        analysis_repo = DOEAnalysisRepository(session)
        analysis = DOEAnalysis(
            study_id=study.id,
            anova_table=json.dumps(result["anova"]),
            effects=json.dumps(result["effects"]),
            interactions=json.dumps(result["interactions"]),
            r_squared=result["r_squared"],
            adj_r_squared=result["adj_r_squared"],
            pred_r_squared=result.get("pred_r_squared"),
            lack_of_fit_f=result.get("lack_of_fit_f"),
            lack_of_fit_p=result.get("lack_of_fit_p"),
            grand_mean=result["grand_mean"],
            regression_model=None,
            optimal_settings=json.dumps(anom_result.optimal_settings),
            residuals_json=json.dumps(result.get("residuals")),
            fitted_values_json=json.dumps(result.get("fitted_values")),
            normality_test_json=None,
            outlier_indices_json=json.dumps(result.get("outlier_indices")),
            residual_stats_json=json.dumps(result.get("residual_stats")),
            taguchi_anom_json=json.dumps(result.get("taguchi_anom")),
        )
        session.add(analysis)

        # Advance study status
        study.status = "analyzed"
        study.updated_at = datetime.now(timezone.utc)
        await session.flush()

        logger.info(
            "Analyzed Taguchi DOE study %d: S/N type=%s, %d factors ranked",
            study.id, sn_type, len(anom_result.factors),
        )

        return result

    @staticmethod
    def _call_generator(
        design_type: str,
        n_factors: int,
        resolution: int | None,
        seed: int | None,
        *,
        n_runs: int | None = None,
        model_order: str | None = None,
        factor_ranges: list[tuple[float, float]] | None = None,
        n_blocks: int | None = None,
    ) -> DesignResult:
        """Dispatch to the correct design generator function."""
        if design_type == "full_factorial":
            return full_factorial(n_factors, seed=seed, n_blocks=n_blocks)
        elif design_type == "fractional_factorial":
            if resolution is None:
                resolution = 4
            return fractional_factorial(
                n_factors, resolution=resolution, seed=seed,
                n_blocks=n_blocks,
            )
        elif design_type == "plackett_burman":
            return plackett_burman(n_factors, seed=seed)
        elif design_type in ("central_composite", "ccd"):
            return central_composite(n_factors, seed=seed)
        elif design_type == "box_behnken":
            return box_behnken(n_factors, seed=seed)
        elif design_type == "d_optimal":
            if n_runs is None:
                raise ValueError(
                    "D-optimal design requires n_runs to be specified"
                )
            return d_optimal(
                n_factors=n_factors,
                n_runs=n_runs,
                factor_ranges=factor_ranges,
                model_order=model_order or "linear",
                seed=seed,
            )
        elif design_type == "taguchi":
            n_levels = 2  # Default; could be extended via study config
            return taguchi(n_factors, n_levels=n_levels, seed=seed)
        else:
            raise ValueError(f"Unknown design type: {design_type}")

    # ------------------------------------------------------------------
    # Confirmation runs
    # ------------------------------------------------------------------

    async def create_confirmation_study(
        self,
        session: AsyncSession,
        parent_study_id: int,
        n_runs: int = 3,
        created_by: int | None = None,
    ) -> DOEStudy:
        """Create a confirmation study linked to an analyzed parent.

        Pre-populates *n_runs* confirmation runs at the parent's optimal
        factor settings.  The new study is set to ``'collecting'`` status
        immediately (no design generation needed).

        Args:
            session: Active async database session.
            parent_study_id: PK of the parent (analyzed) study.
            n_runs: Number of confirmation runs (default 3, max 10).
            created_by: User ID of the creator (optional).

        Returns:
            The newly created confirmation :class:`DOEStudy`.

        Raises:
            ValueError: If the parent is not found, not analyzed, or has
                        no optimal settings.
        """
        if n_runs < 1 or n_runs > 10:
            raise ValueError("n_runs must be between 1 and 10")

        repo = DOEStudyRepository(session)
        parent = await repo.get_with_details(parent_study_id)

        if parent is None:
            raise ValueError(f"Parent study {parent_study_id} not found")

        if parent.status != "analyzed":
            raise ValueError(
                f"Parent study must be in 'analyzed' status, "
                f"got '{parent.status}'"
            )

        # Get latest analysis with optimal settings
        analysis_repo = DOEAnalysisRepository(session)
        analysis = await analysis_repo.get_latest(parent_study_id)
        if analysis is None:
            raise ValueError("Parent study has no analysis results")

        if not analysis.optimal_settings:
            raise ValueError(
                "Parent study has no optimal settings — "
                "confirmation runs require a model with optimal settings"
            )

        optimal = json.loads(analysis.optimal_settings)

        # Create the confirmation study
        conf_study = DOEStudy(
            plant_id=parent.plant_id,
            name=f"{parent.name} — Confirmation",
            design_type=parent.design_type,
            resolution=parent.resolution,
            n_runs=n_runs,
            sn_type=getattr(parent, "sn_type", None),
            status="collecting",
            response_name=parent.response_name,
            response_unit=parent.response_unit,
            is_confirmation=True,
            parent_study_id=parent.id,
            created_by=created_by,
            notes=(
                f"Confirmation runs for '{parent.name}'. "
                f"{n_runs} runs at optimal settings."
            ),
        )
        session.add(conf_study)
        await session.flush()  # get conf_study.id

        # Copy factor definitions from parent
        parent_factors = sorted(parent.factors, key=lambda f: f.display_order)
        for f in parent_factors:
            new_factor = DOEFactor(
                study_id=conf_study.id,
                name=f.name,
                low_level=f.low_level,
                high_level=f.high_level,
                center_point=f.center_point,
                unit=f.unit,
                display_order=f.display_order,
            )
            session.add(new_factor)
        await session.flush()

        # Build factor values at optimal settings (coded → actual)
        factor_values: dict[str, float] = {}
        for f in parent_factors:
            coded_val = optimal.get(f.name, 0.0)
            center = (
                f.center_point
                if f.center_point is not None
                else (f.low_level + f.high_level) / 2.0
            )
            half_range = (f.high_level - f.low_level) / 2.0
            actual_val = center + coded_val * half_range
            factor_values[f.name] = actual_val

        # Create confirmation runs
        run_repo = DOERunRepository(session)
        runs: list[DOERun] = []
        for i in range(n_runs):
            run = DOERun(
                study_id=conf_study.id,
                run_order=i + 1,
                standard_order=i + 1,
                factor_values=json.dumps(factor_values),
                factor_actuals=json.dumps(factor_values),
                is_center_point=False,
                replicate=i + 1,
            )
            runs.append(run)
        await run_repo.bulk_create(runs)

        logger.info(
            "Created confirmation study %d for parent %d: %d runs",
            conf_study.id, parent_study_id, n_runs,
        )

        return conf_study

    async def analyze_confirmation(
        self,
        session: AsyncSession,
        study_id: int,
        alpha: float = 0.05,
    ) -> dict[str, Any]:
        """Analyze a confirmation study against its parent's model.

        Computes prediction intervals (PI) and confidence intervals (CI)
        for each confirmation run using the parent's regression model and
        (X'X)^-1 matrix, then returns a verdict.

        PI = y_hat(x0) +/- t_{alpha/2, df_resid} * sqrt(MSE * (1 + x0'(X'X)^-1 x0))
        CI = y_hat(x0) +/- t_{alpha/2, df_resid} * sqrt(MSE * x0'(X'X)^-1 x0)

        Reference: Montgomery, "Design and Analysis of Experiments",
        Ch. 11: Confirmation experiments.

        Args:
            session: Active async database session.
            study_id: PK of the confirmation study.
            alpha: Significance level for intervals (default 0.05).

        Returns:
            Dict with confirmation analysis results including predicted
            value, PI/CI bounds, actual values, and verdict.

        Raises:
            ValueError: If study is not a confirmation study, parent
                        analysis is missing, or runs lack response values.
        """
        repo = DOEStudyRepository(session)
        study = await repo.get_with_details(study_id)

        if study is None:
            raise ValueError(f"Study {study_id} not found")

        if not study.is_confirmation:
            raise ValueError(f"Study {study_id} is not a confirmation study")

        if study.parent_study_id is None:
            raise ValueError(
                f"Confirmation study {study_id} has no parent study"
            )

        # Validate all runs have response values
        if not study.runs:
            raise ValueError(f"Study {study_id} has no runs")

        missing = [
            r.run_order for r in study.runs if r.response_value is None
        ]
        if missing:
            raise ValueError(
                f"Runs missing response values (run_order): {missing}"
            )

        # Load parent analysis
        analysis_repo = DOEAnalysisRepository(session)
        parent_analysis = await analysis_repo.get_latest(study.parent_study_id)
        if parent_analysis is None:
            raise ValueError(
                f"Parent study {study.parent_study_id} has no analysis"
            )

        # Load parent study for factor definitions
        parent_repo = DOEStudyRepository(session)
        parent = await parent_repo.get_with_details(study.parent_study_id)
        if parent is None:
            raise ValueError(
                f"Parent study {study.parent_study_id} not found"
            )

        # Reconstruct parent model information
        if not parent_analysis.regression_xtx_inv:
            raise ValueError(
                "Parent analysis has no (X'X)^-1 matrix — "
                "cannot compute prediction intervals"
            )

        xtx_inv = np.array(
            json.loads(parent_analysis.regression_xtx_inv), dtype=float
        )

        # Get parent model coefficients (beta)
        # Reconstruct the parent's full-model design matrix info
        parent_factors = sorted(
            parent.factors, key=lambda f: f.display_order
        )
        factor_names = [f.name for f in parent_factors]
        n_factors = len(factor_names)

        # Get the beta vector from the parent's full model
        # We need to reconstruct it from the parent analysis
        parent_sorted_runs = sorted(
            parent.runs, key=lambda r: r.standard_order
        )
        parent_factor_defs = [
            {
                "name": f.name,
                "low_level": f.low_level,
                "high_level": f.high_level,
                "center_point": f.center_point,
            }
            for f in parent_factors
        ]

        # Build the parent design matrix
        n_parent_runs = len(parent_sorted_runs)
        parent_design = np.zeros(
            (n_parent_runs, n_factors), dtype=float
        )
        parent_response = np.zeros(n_parent_runs, dtype=float)

        for row_idx, run in enumerate(parent_sorted_runs):
            fv = json.loads(run.factor_values)
            for col_idx, fdef in enumerate(parent_factor_defs):
                low = fdef["low_level"]
                high = fdef["high_level"]
                center = (
                    fdef.get("center_point") or (low + high) / 2.0
                )
                half_range = (high - low) / 2.0
                if half_range > 0:
                    actual_val = fv.get(fdef["name"], center)
                    parent_design[row_idx, col_idx] = (
                        (actual_val - center) / half_range
                    )
                else:
                    parent_design[row_idx, col_idx] = 0.0
            parent_response[row_idx] = run.response_value  # type: ignore

        # Build parent full model matrix (intercept + main + interactions)
        parent_design_type = parent.design_type.lower()
        skip_interactions = parent_design_type in _NO_INTERACTION_DESIGNS

        _cols_p = [np.ones(n_parent_runs)]
        for c in range(n_factors):
            _cols_p.append(parent_design[:, c])
        if not skip_interactions:
            for i, j in combinations(range(n_factors), 2):
                _cols_p.append(
                    parent_design[:, i] * parent_design[:, j]
                )
        X_parent = np.column_stack(_cols_p)
        n_params = X_parent.shape[1]
        df_resid = n_parent_runs - n_params

        # Fit the parent model to get beta and MSE
        beta = np.linalg.lstsq(X_parent, parent_response, rcond=None)[0]
        resid = parent_response - X_parent @ beta
        ss_resid = float(np.sum(resid ** 2))
        mse = ss_resid / max(df_resid, 1)

        # Get optimal coded values from parent analysis
        optimal = json.loads(parent_analysis.optimal_settings)

        # Build the x0 vector (model space) at the optimal point
        x0_coded = np.array([
            optimal.get(name, 0.0) for name in factor_names
        ], dtype=float)

        x0_model = [1.0]  # intercept
        for c in range(n_factors):
            x0_model.append(x0_coded[c])
        if not skip_interactions:
            for i, j in combinations(range(n_factors), 2):
                x0_model.append(x0_coded[i] * x0_coded[j])
        x0 = np.array(x0_model, dtype=float)

        # Predicted response at optimal
        y_hat = float(x0 @ beta)

        # x0' (X'X)^-1 x0
        x0_xtx_inv_x0 = float(x0 @ xtx_inv @ x0)

        # t critical value
        t_crit = float(
            sp_stats.t.ppf(1.0 - alpha / 2.0, max(df_resid, 1))
        )

        # Prediction interval (for individual observations)
        pi_half_width = t_crit * np.sqrt(mse * (1.0 + x0_xtx_inv_x0))
        pi_lower = y_hat - pi_half_width
        pi_upper = y_hat + pi_half_width

        # Confidence interval (for the mean response)
        ci_half_width = t_crit * np.sqrt(mse * x0_xtx_inv_x0)
        ci_lower = y_hat - ci_half_width
        ci_upper = y_hat + ci_half_width

        # Evaluate confirmation runs
        sorted_runs = sorted(study.runs, key=lambda r: r.run_order)
        actual_values = [
            float(r.response_value) for r in sorted_runs  # type: ignore
        ]
        mean_actual = float(np.mean(actual_values))

        # Per-run PI check
        run_results: list[dict[str, Any]] = []
        warnings_list: list[str] = []
        for r in sorted_runs:
            val = float(r.response_value)  # type: ignore
            within_pi = pi_lower <= val <= pi_upper
            if not within_pi:
                warnings_list.append(
                    f"Warning: run {r.run_order} ({val:.4f}) is outside "
                    f"the prediction interval [{pi_lower:.4f}, {pi_upper:.4f}]"
                )
            run_results.append({
                "run_order": r.run_order,
                "actual_value": val,
                "within_pi": within_pi,
            })

        # Mean CI check
        mean_within_ci = ci_lower <= mean_actual <= ci_upper
        all_within_pi = all(rr["within_pi"] for rr in run_results)

        # Verdict
        if all_within_pi and mean_within_ci:
            verdict = "Confirmed — model validated"
        elif mean_within_ci:
            verdict = "Confirmed"
        else:
            verdict = "Not confirmed — mean outside confidence interval"

        result: dict[str, Any] = {
            "parent_study_id": study.parent_study_id,
            "predicted_value": y_hat,
            "mse": mse,
            "df_residual": df_resid,
            "t_critical": t_crit,
            "alpha": alpha,
            "prediction_interval": {
                "lower": float(pi_lower),
                "upper": float(pi_upper),
            },
            "confidence_interval": {
                "lower": float(ci_lower),
                "upper": float(ci_upper),
            },
            "mean_actual": mean_actual,
            "mean_within_ci": mean_within_ci,
            "all_within_pi": all_within_pi,
            "runs": run_results,
            "warnings": warnings_list,
            "verdict": verdict,
        }

        # Persist confirmation analysis
        confirmation_analysis = DOEAnalysis(
            study_id=study_id,
            anova_table=json.dumps([]),
            effects=json.dumps([]),
            interactions=json.dumps([]),
            r_squared=0.0,
            adj_r_squared=0.0,
            grand_mean=mean_actual,
            optimal_settings=json.dumps(optimal),
            residuals_json=json.dumps([
                val - y_hat for val in actual_values
            ]),
            fitted_values_json=json.dumps([y_hat] * len(actual_values)),
            regression_xtx_inv=parent_analysis.regression_xtx_inv,
        )
        session.add(confirmation_analysis)

        # Advance study status
        study.status = "analyzed"
        study.updated_at = datetime.now(timezone.utc)
        await session.flush()

        logger.info(
            "Analyzed confirmation study %d: verdict=%s, "
            "predicted=%.4f, mean_actual=%.4f",
            study_id, verdict, y_hat, mean_actual,
        )

        return result
