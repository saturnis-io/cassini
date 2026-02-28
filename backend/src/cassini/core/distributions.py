"""Non-normal distribution fitting and capability analysis.

Supports Box-Cox transformation, percentile method, and distribution fitting
(normal, lognormal, weibull, gamma, Johnson SU/SB) with auto-cascade selection.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import math
from typing import Optional

import numpy as np
from scipy import stats as scipy_stats
from scipy.stats import boxcox


@dataclass
class DistributionFitResult:
    """Result of fitting a single distribution family."""

    family: str  # "normal", "lognormal", "weibull", "gamma", "johnson_su", "johnson_sb"
    parameters: dict[str, float]  # Family-specific params
    ad_statistic: float  # Anderson-Darling test statistic
    ad_p_value: float | None  # p-value (None if not available)
    aic: float  # Akaike Information Criterion (lower = better)
    is_adequate_fit: bool  # True if p-value >= 0.05 or AD below critical


@dataclass
class NonNormalCapabilityResult:
    """Result of non-normal process capability calculation."""

    cp: float | None
    cpk: float | None
    pp: float | None
    ppk: float | None
    cpm: float | None
    method: str  # "normal", "box_cox", "percentile", "distribution_fit", "auto"
    method_detail: str  # Human-readable: "Box-Cox (lambda=0.32)" or "Weibull (shape=1.5)"
    normality_p_value: float | None
    normality_test: str
    is_normal: bool
    fitted_distribution: DistributionFitResult | None
    percentile_pp: float | None
    percentile_ppk: float | None
    p0_135: float | None
    p50: float | None
    p99_865: float | None
    sample_count: int
    calculated_at: datetime


def _round_or_none(value: float | None, decimals: int = 4) -> float | None:
    """Round a value to the specified decimals, or return None."""
    if value is None:
        return None
    if not math.isfinite(value):
        return None
    return round(value, decimals)


def _compute_aic(n: int, k: int, log_likelihood: float) -> float:
    """Compute Akaike Information Criterion."""
    return 2 * k - 2 * log_likelihood


def _log_likelihood(dist, params, data: np.ndarray) -> float:
    """Compute log-likelihood for a fitted distribution."""
    try:
        ll = np.sum(dist.logpdf(data, *params))
        if not math.isfinite(ll):
            return -1e18
        return float(ll)
    except Exception:
        return -1e18


def _anderson_darling_test(
    dist, params, data: np.ndarray
) -> tuple[float, float | None, bool]:
    """Run Anderson-Darling goodness-of-fit test.

    Returns (ad_statistic, p_value, is_adequate_fit).
    For distributions where scipy provides AD critical values, use those.
    Otherwise fall back to Kolmogorov-Smirnov.
    """
    try:
        # For normal distribution, scipy has a dedicated AD test
        if dist == scipy_stats.norm:
            try:
                # scipy >= 1.17: use method parameter for p-value
                from scipy.stats import MonteCarloMethod
                result = scipy_stats.anderson(data, dist="norm", method="interpolate")
                ad_stat = float(result.statistic)
                p_value = float(result.pvalue) if hasattr(result, 'pvalue') else None
                is_adequate = p_value >= 0.05 if p_value is not None else ad_stat < 0.787
                return ad_stat, p_value, is_adequate
            except (ImportError, TypeError):
                # scipy < 1.17: legacy interface with critical_values
                result = scipy_stats.anderson(data, dist="norm")
                ad_stat = float(result.statistic)
                critical_5pct = result.critical_values[2] if len(result.critical_values) > 2 else result.critical_values[-1]
                sig_levels = result.significance_level
                p_value = None
                for i, sl in enumerate(sig_levels):
                    if ad_stat < result.critical_values[i]:
                        p_value = sl / 100.0
                        break
                if p_value is None:
                    p_value = 0.001
                is_adequate = ad_stat < critical_5pct
                return ad_stat, p_value, is_adequate

        # For other distributions, use KS test as fallback
        ks_stat, ks_p = scipy_stats.kstest(data, dist.cdf, args=params)
        return float(ks_stat), float(ks_p), ks_p >= 0.05

    except Exception:
        return 999.0, None, False


class DistributionFitter:
    """Fits data to multiple distribution families and ranks them."""

    # Distribution families to try: (name, scipy_dist, min_params)
    FAMILIES = [
        ("normal", scipy_stats.norm, 2),
        ("lognormal", scipy_stats.lognorm, 3),
        ("weibull", scipy_stats.weibull_min, 3),
        ("gamma", scipy_stats.gamma, 3),
        ("johnson_su", scipy_stats.johnsonsu, 4),
        ("johnson_sb", scipy_stats.johnsonsb, 4),
    ]

    # Families that require strictly positive data
    POSITIVE_ONLY = {"lognormal", "weibull", "gamma"}

    @staticmethod
    def fit_all(values: np.ndarray) -> list[DistributionFitResult]:
        """Fit data to all candidate distribution families.

        Args:
            values: 1D array of measurement values. Requires n >= 8.

        Returns:
            List of DistributionFitResult sorted by AIC (best first).
        """
        if len(values) < 8:
            return []

        has_nonpositive = np.any(values <= 0)
        results: list[DistributionFitResult] = []

        for name, dist, n_params in DistributionFitter.FAMILIES:
            # Skip positive-only families if data has non-positive values
            if name in DistributionFitter.POSITIVE_ONLY and has_nonpositive:
                continue

            try:
                # MLE fit
                params = dist.fit(values)

                # Goodness-of-fit test
                ad_stat, ad_p, is_adequate = _anderson_darling_test(
                    dist, params, values
                )

                # Log-likelihood and AIC
                ll = _log_likelihood(dist, params, values)
                aic = _compute_aic(len(values), n_params, ll)

                # Build parameter dict
                param_dict = _params_to_dict(name, params)

                results.append(
                    DistributionFitResult(
                        family=name,
                        parameters=param_dict,
                        ad_statistic=round(ad_stat, 6),
                        ad_p_value=_round_or_none(ad_p, 6),
                        aic=round(aic, 2),
                        is_adequate_fit=is_adequate,
                    )
                )
            except Exception:
                continue

        # Sort by AIC (lower is better)
        results.sort(key=lambda r: r.aic)
        return results

    @staticmethod
    def fit_box_cox(values: np.ndarray) -> tuple[np.ndarray, float] | None:
        """Apply Box-Cox transformation.

        Args:
            values: 1D array of measurement values. All must be > 0.

        Returns:
            Tuple of (transformed_values, lambda) or None if not applicable.
        """
        if np.any(values <= 0):
            return None

        try:
            transformed, lmbda = boxcox(values)
            lmbda = float(lmbda)

            # Reject extreme lambda values
            if abs(lmbda) > 5:
                return None

            return transformed, lmbda
        except Exception:
            return None

    @staticmethod
    def best_fit(values: np.ndarray) -> DistributionFitResult | None:
        """Return the best-fitting distribution (lowest AIC).

        Args:
            values: 1D array of measurement values.

        Returns:
            Best DistributionFitResult or None if fitting fails.
        """
        fits = DistributionFitter.fit_all(values)
        return fits[0] if fits else None


def _params_to_dict(family: str, params: tuple) -> dict[str, float]:
    """Convert scipy distribution parameters to a named dict."""
    if family == "normal":
        return {"loc": float(params[0]), "scale": float(params[1])}
    elif family == "lognormal":
        return {"s": float(params[0]), "loc": float(params[1]), "scale": float(params[2])}
    elif family == "weibull":
        return {"c": float(params[0]), "loc": float(params[1]), "scale": float(params[2])}
    elif family == "gamma":
        return {"a": float(params[0]), "loc": float(params[1]), "scale": float(params[2])}
    elif family == "johnson_su":
        return {
            "a": float(params[0]),
            "b": float(params[1]),
            "loc": float(params[2]),
            "scale": float(params[3]),
        }
    elif family == "johnson_sb":
        return {
            "a": float(params[0]),
            "b": float(params[1]),
            "loc": float(params[2]),
            "scale": float(params[3]),
        }
    else:
        return {f"p{i}": float(p) for i, p in enumerate(params)}


def _dict_to_params(family: str, param_dict: dict[str, float]) -> tuple:
    """Convert a named param dict back to scipy tuple ordering."""
    if family == "normal":
        return (param_dict["loc"], param_dict["scale"])
    elif family == "lognormal":
        return (param_dict["s"], param_dict["loc"], param_dict["scale"])
    elif family == "weibull":
        return (param_dict["c"], param_dict["loc"], param_dict["scale"])
    elif family == "gamma":
        return (param_dict["a"], param_dict["loc"], param_dict["scale"])
    elif family in ("johnson_su", "johnson_sb"):
        return (param_dict["a"], param_dict["b"], param_dict["loc"], param_dict["scale"])
    else:
        return tuple(param_dict.values())


def _get_scipy_dist(family: str):
    """Get scipy distribution object by family name."""
    mapping = {
        "normal": scipy_stats.norm,
        "lognormal": scipy_stats.lognorm,
        "weibull": scipy_stats.weibull_min,
        "gamma": scipy_stats.gamma,
        "johnson_su": scipy_stats.johnsonsu,
        "johnson_sb": scipy_stats.johnsonsb,
    }
    return mapping.get(family)


def compute_qq_points(
    sorted_data: list[float],
    family: str,
    parameters: dict[str, float],
) -> dict[str, list[float]] | None:
    """Compute Q-Q plot points using Blom plotting positions.

    Uses the Blom formula p_i = (i - 3/8) / (n + 1/4) for i = 1..n,
    which is recommended for normal probability plots and generalizes
    well to other distributions.

    Args:
        sorted_data: Sample values sorted in ascending order.
        family: Distribution family name (e.g., "normal", "weibull").
        parameters: Fitted distribution parameters (family-specific dict).

    Returns:
        Dict with "sample_quantiles" and "theoretical_quantiles" lists,
        or None if computation fails.
    """
    dist = _get_scipy_dist(family)
    if dist is None:
        return None

    params = _dict_to_params(family, parameters)
    n = len(sorted_data)
    if n < 2:
        return None

    try:
        # Blom plotting positions: p_i = (i - 3/8) / (n + 1/4)
        positions = [(i - 0.375) / (n + 0.25) for i in range(1, n + 1)]
        theoretical = [float(dist.ppf(p, *params)) for p in positions]

        # Validate: no infinities or NaNs
        if any(not math.isfinite(t) for t in theoretical):
            return None

        return {
            "sample_quantiles": sorted_data,
            "theoretical_quantiles": theoretical,
        }
    except Exception:
        return None


def calculate_percentile_capability(
    values: np.ndarray,
    usl: float | None,
    lsl: float | None,
) -> tuple[float | None, float | None, float, float, float]:
    """Calculate capability using the percentile method.

    Uses P0.135, P50, P99.865 percentiles (equivalent to +/-3 sigma for normal).

    Args:
        values: 1D array of measurement values.
        usl: Upper specification limit (None if one-sided).
        lsl: Lower specification limit (None if one-sided).

    Returns:
        Tuple of (Pp, Ppk, p0_135, p50, p99_865).
    """
    p0_135 = float(np.percentile(values, 0.135))
    p50 = float(np.percentile(values, 50.0))
    p99_865 = float(np.percentile(values, 99.865))

    spread = p99_865 - p0_135
    pp: float | None = None
    ppk: float | None = None

    if spread <= 0:
        return None, None, p0_135, p50, p99_865

    # Pp: both limits required
    if usl is not None and lsl is not None:
        pp = (usl - lsl) / spread

    # Ppk: asymmetric half-spreads for skewed distributions
    # Upper half-spread = P99.865 - P50, lower half-spread = P50 - P0.135
    upper_half = p99_865 - p50
    lower_half = p50 - p0_135
    ppk_values = []
    if usl is not None and upper_half > 0:
        ppk_values.append((usl - p50) / upper_half)
    if lsl is not None and lower_half > 0:
        ppk_values.append((p50 - lsl) / lower_half)

    if ppk_values:
        ppk = min(ppk_values)

    return (
        _round_or_none(pp),
        _round_or_none(ppk),
        round(p0_135, 6),
        round(p50, 6),
        round(p99_865, 6),
    )


def _box_cox_capability(
    transformed: np.ndarray,
    lmbda: float,
    usl: float | None,
    lsl: float | None,
    target: float | None,
    sigma_within: float | None,
) -> tuple[float | None, float | None, float | None, float | None, float | None]:
    """Calculate capability indices on Box-Cox transformed data and spec limits.

    Returns (cp, cpk, pp, ppk, cpm).
    """
    # Transform spec limits
    def transform_limit(val: float) -> float | None:
        if val <= 0:
            return None
        if abs(lmbda) < 1e-10:
            return math.log(val)
        return (val**lmbda - 1.0) / lmbda

    usl_t = transform_limit(usl) if usl is not None else None
    lsl_t = transform_limit(lsl) if lsl is not None else None

    # If transformation of limits failed, can't compute
    if usl is not None and usl_t is None:
        return None, None, None, None, None
    if lsl is not None and lsl_t is None:
        return None, None, None, None, None

    mean_t = float(np.mean(transformed))
    sigma_overall_t = float(np.std(transformed, ddof=1))

    cp: float | None = None
    cpk: float | None = None
    cpm: float | None = None
    pp: float | None = None
    ppk: float | None = None

    # Pp / Ppk (overall)
    if sigma_overall_t > 0:
        if usl_t is not None and lsl_t is not None:
            pp = (usl_t - lsl_t) / (6.0 * sigma_overall_t)

        ppk_values = []
        if usl_t is not None:
            ppk_values.append((usl_t - mean_t) / (3.0 * sigma_overall_t))
        if lsl_t is not None:
            ppk_values.append((mean_t - lsl_t) / (3.0 * sigma_overall_t))
        if ppk_values:
            ppk = min(ppk_values)

    # Cp / Cpk (within) — use delta method to transform sigma_within
    # The derivative of the Box-Cox transform y(x) at the original mean x̄ is:
    #   dy/dx = x̄^(λ-1)  (for λ != 0)
    #   dy/dx = 1/x̄       (for λ ≈ 0, i.e. log transform)
    # So σ_within_transformed ≈ σ_within * |x̄^(λ-1)|
    if sigma_within is not None and sigma_within > 0:
        # Recover original mean from transformed data's inverse
        # Since we have the transformed array but need original mean for the derivative,
        # compute it from the inverse Box-Cox. However, we also receive the original
        # array indirectly through the calling context. Use the simpler approach:
        # the mean of the transformed data came from data whose original mean x̄ we can
        # approximate by inverting the transform at mean_t.
        if abs(lmbda) < 1e-10:
            x_bar_orig = math.exp(mean_t)
            deriv = 1.0 / x_bar_orig if x_bar_orig > 0 else 0.0
        else:
            x_bar_orig = (lmbda * mean_t + 1.0) ** (1.0 / lmbda) if (lmbda * mean_t + 1.0) > 0 else 0.0
            deriv = abs(x_bar_orig ** (lmbda - 1.0)) if x_bar_orig > 0 else 0.0

        sigma_within_t = sigma_within * deriv if deriv > 0 else 0.0

        if sigma_within_t > 0:
            if usl_t is not None and lsl_t is not None:
                cp = (usl_t - lsl_t) / (6.0 * sigma_within_t)

            cpk_values = []
            if usl_t is not None:
                cpk_values.append((usl_t - mean_t) / (3.0 * sigma_within_t))
            if lsl_t is not None:
                cpk_values.append((mean_t - lsl_t) / (3.0 * sigma_within_t))
            if cpk_values:
                cpk = min(cpk_values)

    # Cpm — uses sigma_within per AIAG definition
    if cp is not None and target is not None:
        target_t = transform_limit(target) if target > 0 else None
        if target_t is not None and sigma_within_t is not None and sigma_within_t > 0:
            tau = math.sqrt(sigma_within_t**2 + (mean_t - target_t) ** 2)
            if tau > 0 and usl_t is not None and lsl_t is not None:
                cpm = (usl_t - lsl_t) / (6.0 * tau)

    return (
        _round_or_none(cp),
        _round_or_none(cpk),
        _round_or_none(pp),
        _round_or_none(ppk),
        _round_or_none(cpm),
    )


def _distribution_fit_capability(
    fit_result: DistributionFitResult,
    usl: float | None,
    lsl: float | None,
) -> tuple[float | None, float | None]:
    """Calculate Pp/Ppk from a fitted distribution using Z-score method.

    z_USL = Phi^(-1)(F_D(USL; theta))
    z_LSL = Phi^(-1)(F_D(LSL; theta))
    Pp = (z_USL - z_LSL) / 6
    Ppk = min(z_USL / 3, -z_LSL / 3)

    Returns (pp, ppk).
    """
    dist = _get_scipy_dist(fit_result.family)
    if dist is None:
        return None, None

    params = _dict_to_params(fit_result.family, fit_result.parameters)

    z_usl: float | None = None
    z_lsl: float | None = None

    try:
        if usl is not None:
            p_usl = dist.cdf(usl, *params)
            p_usl = max(1e-15, min(1 - 1e-15, p_usl))
            z_usl = float(scipy_stats.norm.ppf(p_usl))

        if lsl is not None:
            p_lsl = dist.cdf(lsl, *params)
            p_lsl = max(1e-15, min(1 - 1e-15, p_lsl))
            z_lsl = float(scipy_stats.norm.ppf(p_lsl))
    except Exception:
        return None, None

    pp: float | None = None
    ppk: float | None = None

    if z_usl is not None and z_lsl is not None:
        pp = (z_usl - z_lsl) / 6.0

    ppk_values = []
    if z_usl is not None:
        ppk_values.append(z_usl / 3.0)
    if z_lsl is not None:
        ppk_values.append(-z_lsl / 3.0)
    if ppk_values:
        ppk = min(ppk_values)

    return _round_or_none(pp), _round_or_none(ppk)


def calculate_capability_nonnormal(
    values: list[float],
    usl: float | None,
    lsl: float | None,
    target: float | None = None,
    sigma_within: float | None = None,
    method: str = "auto",
    distribution_params: dict[str, str | float] | None = None,
) -> NonNormalCapabilityResult:
    """Calculate process capability using non-normal methods.

    Auto-cascade order:
    1. Shapiro-Wilk normality test (p >= 0.05 -> use normal method)
    2. Box-Cox transformation
    3. Distribution fitting (best AIC)
    4. Percentile fallback

    Args:
        values: Individual measurement values.
        usl: Upper specification limit. None if one-sided.
        lsl: Lower specification limit. None if one-sided.
        target: Process target value.
        sigma_within: Within-subgroup sigma.
        method: "auto", "normal", "box_cox", "percentile", or "distribution_fit".
        distribution_params: Optional dict to force a specific family (e.g., {"family": "weibull"}).

    Returns:
        NonNormalCapabilityResult with all computed indices.

    Raises:
        ValueError: If fewer than 2 values or both limits are None.
    """
    if len(values) < 2:
        raise ValueError(f"Need at least 2 values, got {len(values)}")

    if usl is None and lsl is None:
        raise ValueError("At least one specification limit (USL or LSL) must be provided")

    if usl is not None and lsl is not None and usl <= lsl:
        raise ValueError(f"USL ({usl}) must be greater than LSL ({lsl})")

    arr = np.asarray(values, dtype=np.float64)
    n = len(values)
    now = datetime.now(timezone.utc)

    # Default target to midpoint
    if target is None and usl is not None and lsl is not None:
        target = (usl + lsl) / 2.0

    # All values identical -> can't compute meaningful capability
    if np.std(arr) == 0:
        pct_pp, pct_ppk, p0, p50, p99 = calculate_percentile_capability(arr, usl, lsl)
        return NonNormalCapabilityResult(
            cp=None, cpk=None, pp=None, ppk=None, cpm=None,
            method=method, method_detail="Constant data (sigma=0)",
            normality_p_value=None, normality_test="skipped", is_normal=False,
            fitted_distribution=None,
            percentile_pp=pct_pp, percentile_ppk=pct_ppk,
            p0_135=p0, p50=p50, p99_865=p99,
            sample_count=n, calculated_at=now,
        )

    # Normality test (Shapiro-Wilk, max 5000 samples)
    normality_p: float | None = None
    normality_test = "shapiro_wilk"
    is_normal = False
    if n >= 3:
        # Shapiro-Wilk limit is 5000 samples; use random subset to avoid bias
        if n > 5000:
            rng = np.random.default_rng(42)
            test_sample = rng.choice(arr, size=5000, replace=False)
        else:
            test_sample = arr
        try:
            result = scipy_stats.shapiro(test_sample)
            normality_p = float(result.pvalue)
            is_normal = normality_p >= 0.05
        except Exception:
            normality_test = "failed"

    # Always compute percentile for comparison
    pct_pp, pct_ppk, p0_135, p50, p99_865 = calculate_percentile_capability(arr, usl, lsl)

    # ---- Method selection ----
    cp: float | None = None
    cpk: float | None = None
    pp: float | None = None
    ppk: float | None = None
    cpm: float | None = None
    method_detail = ""
    fitted_dist: DistributionFitResult | None = None

    if method == "normal" or (method == "auto" and is_normal):
        # Use standard normal capability
        from cassini.core.capability import calculate_capability

        normal_result = calculate_capability(values, usl, lsl, target, sigma_within)
        return NonNormalCapabilityResult(
            cp=normal_result.cp, cpk=normal_result.cpk,
            pp=normal_result.pp, ppk=normal_result.ppk,
            cpm=normal_result.cpm,
            method="normal", method_detail="Normal (Shapiro-Wilk passed)",
            normality_p_value=_round_or_none(normality_p, 6),
            normality_test=normality_test, is_normal=is_normal,
            fitted_distribution=None,
            percentile_pp=pct_pp, percentile_ppk=pct_ppk,
            p0_135=p0_135, p50=p50, p99_865=p99_865,
            sample_count=n, calculated_at=now,
        )

    if method == "box_cox" or (method == "auto" and not is_normal):
        bc_result = DistributionFitter.fit_box_cox(arr)
        if bc_result is not None:
            transformed, lmbda = bc_result
            cp, cpk, pp, ppk, cpm = _box_cox_capability(
                transformed, lmbda, usl, lsl, target, sigma_within
            )
            if pp is not None or ppk is not None:
                method_detail = f"Box-Cox (lambda={lmbda:.4f})"
                return NonNormalCapabilityResult(
                    cp=cp, cpk=cpk, pp=pp, ppk=ppk, cpm=cpm,
                    method="box_cox", method_detail=method_detail,
                    normality_p_value=_round_or_none(normality_p, 6),
                    normality_test=normality_test, is_normal=is_normal,
                    fitted_distribution=None,
                    percentile_pp=pct_pp, percentile_ppk=pct_ppk,
                    p0_135=p0_135, p50=p50, p99_865=p99_865,
                    sample_count=n, calculated_at=now,
                )

        # Box-Cox failed or was not requested as the sole method
        if method == "box_cox":
            # Fall through to percentile if box_cox specifically requested but failed
            return NonNormalCapabilityResult(
                cp=None, cpk=None, pp=pct_pp, ppk=pct_ppk, cpm=None,
                method="percentile",
                method_detail="Percentile (Box-Cox failed, data may have non-positive values)",
                normality_p_value=_round_or_none(normality_p, 6),
                normality_test=normality_test, is_normal=is_normal,
                fitted_distribution=None,
                percentile_pp=pct_pp, percentile_ppk=pct_ppk,
                p0_135=p0_135, p50=p50, p99_865=p99_865,
                sample_count=n, calculated_at=now,
            )

    if method == "distribution_fit" or (method == "auto" and not is_normal):
        # If the user explicitly saved a specific family (e.g., {"family": "weibull"}), 
        # force the fit to that exact family, ignoring AIC ranking for others.
        target_family = distribution_params.get("family") if distribution_params else None

        if n >= 8:
            requested_fits = []
            if target_family:
                # Force fit only the requested family
                for name, dist, n_params in DistributionFitter.FAMILIES:
                    if name == target_family:
                        try:
                            # MLE fit
                            params = dist.fit(arr)
                            ad_stat, ad_p, is_adequate = _anderson_darling_test(dist, params, arr)
                            ll = _log_likelihood(dist, params, arr)
                            aic = _compute_aic(len(arr), n_params, ll)
                            param_dict = _params_to_dict(name, params)
                            
                            forced_fit = DistributionFitResult(
                                family=name,
                                parameters=param_dict,
                                ad_statistic=round(ad_stat, 6),
                                ad_p_value=_round_or_none(ad_p, 6),
                                aic=round(aic, 2),
                                is_adequate_fit=is_adequate,
                            )
                            requested_fits.append(forced_fit)
                        except Exception:
                            pass
                        break
                best = requested_fits[0] if requested_fits else None
            else:
                # Normal auto-cascade (pick best by AIC)
                best = DistributionFitter.best_fit(arr)

            if best is not None:
                fitted_dist = best
                pp, ppk = _distribution_fit_capability(best, usl, lsl)
                if pp is not None or ppk is not None:
                    # Provide clearer detail if a fit was explicitly forced vs auto-selected
                    prefix = "Forced" if target_family else "Auto-selected"
                    method_detail = f"{prefix} {best.family.replace('_', ' ').title()} fit (AIC={best.aic:.1f})"
                    return NonNormalCapabilityResult(
                        cp=None, cpk=None, pp=pp, ppk=ppk, cpm=None,
                        method="distribution_fit", method_detail=method_detail,
                        normality_p_value=_round_or_none(normality_p, 6),
                        normality_test=normality_test, is_normal=is_normal,
                        fitted_distribution=fitted_dist,
                        percentile_pp=pct_pp, percentile_ppk=pct_ppk,
                        p0_135=p0_135, p50=p50, p99_865=p99_865,
                        sample_count=n, calculated_at=now,
                    )

        if method == "distribution_fit":
            # Specifically requested but no fit could be generated
            reason = f"for requested family '{target_family}'" if target_family else "found"
            return NonNormalCapabilityResult(
                cp=None, cpk=None, pp=pct_pp, ppk=pct_ppk, cpm=None,
                method="percentile",
                method_detail=f"Percentile (no adequate distribution fit {reason})",
                normality_p_value=_round_or_none(normality_p, 6),
                normality_test=normality_test, is_normal=is_normal,
                fitted_distribution=fitted_dist,
                percentile_pp=pct_pp, percentile_ppk=pct_ppk,
                p0_135=p0_135, p50=p50, p99_865=p99_865,
                sample_count=n, calculated_at=now,
            )

    # Percentile fallback (method == "percentile" or auto cascade exhausted)
    return NonNormalCapabilityResult(
        cp=None, cpk=None, pp=pct_pp, ppk=pct_ppk, cpm=None,
        method="percentile", method_detail="Percentile (P0.135 / P99.865)",
        normality_p_value=_round_or_none(normality_p, 6),
        normality_test=normality_test, is_normal=is_normal,
        fitted_distribution=fitted_dist,
        percentile_pp=pct_pp, percentile_ppk=pct_ppk,
        p0_135=p0_135, p50=p50, p99_865=p99_865,
        sample_count=n, calculated_at=now,
    )
