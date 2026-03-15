/**
 * Shared statistical utility functions.
 *
 * normalQuantile extracted from DOEResidualsPanel so it can be reused
 * in report sections (probability plots) and other statistical views.
 */

/**
 * Normal quantile function (inverse CDF) using the rational approximation
 * algorithm by Peter J. Acklam.
 *
 * Given a probability p in (0, 1), returns the z-value such that
 * P(Z <= z) = p for a standard normal distribution.
 *
 * Accuracy: |relative error| < 1.15e-9 across full range.
 */
export function normalQuantile(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ]
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ]
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ]
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ]

  const pLow = 0.02425
  const pHigh = 1 - pLow

  let q: number
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  } else if (p <= pHigh) {
    q = p - 0.5
    const r = q * q
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    )
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )
  }
}

/**
 * Compute Blom plotting positions for Q-Q / probability plots.
 *
 * Returns an array of theoretical normal quantiles corresponding to
 * the ordered observations using the Blom formula:
 *   p_i = (i - 0.375) / (n + 0.25)
 *
 * This matches R's qqnorm() and Minitab's probability plot.
 */
export function blomQuantiles(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const p = (i + 1 - 0.375) / (n + 0.25)
    return normalQuantile(p)
  })
}
