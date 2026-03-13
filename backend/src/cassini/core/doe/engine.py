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
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.core.doe.analysis import (
    compute_anova,
    compute_interactions,
    compute_main_effects,
    compute_regression,
)
from cassini.core.doe.designs import (
    DesignResult,
    box_behnken,
    central_composite,
    coded_to_actual,
    fractional_factorial,
    full_factorial,
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
    "central_composite": "central_composite",
    "ccd": "central_composite",
    "box_behnken": "box_behnken",
}

# Design types that support RSM (quadratic regression)
_RSM_DESIGNS = {"central_composite", "ccd", "box_behnken"}


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

        # Call the appropriate generator
        design_result = self._call_generator(
            design_type, n_factors, study.resolution, seed
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

            run = DOERun(
                study_id=study_id,
                run_order=design_result.run_order[row_idx],
                standard_order=design_result.standard_order[row_idx],
                factor_values=json.dumps(fv),
                factor_actuals=json.dumps(fa),
                is_center_point=design_result.is_center_point[row_idx],
                replicate=1,
            )
            runs.append(run)
            run_dicts.append({
                "run_order": run.run_order,
                "standard_order": run.standard_order,
                "factor_values": fv,
                "is_center_point": run.is_center_point,
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

        # Validate all runs have response values
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

        # Compute full-model MSE once (main effects + two-factor interactions)
        # so that both compute_main_effects and compute_interactions use the
        # same denominator for their t-tests, making p-values comparable.
        _n_obs = design_matrix.shape[0]
        _k = design_matrix.shape[1]
        _int_pairs = list(combinations(range(_k), 2))
        _cols = [np.ones(_n_obs)]
        for _c in range(_k):
            _cols.append(design_matrix[:, _c])
        for _i, _j in _int_pairs:
            _cols.append(design_matrix[:, _i] * design_matrix[:, _j])
        _X_full = np.column_stack(_cols)
        _p_full = _X_full.shape[1]
        _df_resid_full = _n_obs - _p_full

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
        interactions = compute_interactions(
            design_matrix, response_arr, factor_names,
            mse_override=_mse_full,
            df_resid_override=_df_resid_full,
        )
        anova = compute_anova(design_matrix, response_arr, factor_names)

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
            "anova": [
                {
                    "source": row.source,
                    "df": row.df,
                    "sum_of_squares": row.sum_of_squares,
                    "mean_square": row.mean_square,
                    "f_value": row.f_value,
                    "p_value": row.p_value,
                }
                for row in anova.rows
            ],
            "r_squared": anova.r_squared,
            "adj_r_squared": anova.adj_r_squared,
        }

        # RSM regression for CCD and Box-Behnken designs
        regression_json: str | None = None
        optimal_json: str | None = None
        design_type = study.design_type.lower()

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

        # Persist analysis
        analysis_repo = DOEAnalysisRepository(session)
        analysis = DOEAnalysis(
            study_id=study_id,
            anova_table=json.dumps(result["anova"]),
            effects=json.dumps(result["effects"]),
            interactions=json.dumps(result["interactions"]),
            r_squared=result["r_squared"],
            adj_r_squared=result["adj_r_squared"],
            grand_mean=result["grand_mean"],
            regression_model=regression_json,
            optimal_settings=optimal_json,
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

    @staticmethod
    def _call_generator(
        design_type: str,
        n_factors: int,
        resolution: int | None,
        seed: int | None,
    ) -> DesignResult:
        """Dispatch to the correct design generator function."""
        if design_type == "full_factorial":
            return full_factorial(n_factors, seed=seed)
        elif design_type == "fractional_factorial":
            if resolution is None:
                resolution = 4
            return fractional_factorial(n_factors, resolution=resolution, seed=seed)
        elif design_type in ("central_composite", "ccd"):
            return central_composite(n_factors, seed=seed)
        elif design_type == "box_behnken":
            return box_behnken(n_factors, seed=seed)
        else:
            raise ValueError(f"Unknown design type: {design_type}")
