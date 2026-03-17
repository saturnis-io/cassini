/**
 * Chart type definitions for comprehensive SPC chart support.
 * Based on architecture design document.
 */

export type ChartCategory = 'variable' | 'attribute' | 'analysis'

export type ChartTypeId =
  | 'xbar' // X-bar only (current default)
  | 'xbar-r' // X-bar and Range
  | 'xbar-s' // X-bar and S (Standard Deviation)
  | 'i-mr' // Individuals and Moving Range
  | 'cusum' // CUSUM (Cumulative Sum)
  | 'ewma' // EWMA (Exponentially Weighted Moving Average)
  | 'p' // Proportion defective
  | 'np' // Number defective
  | 'c' // Defects per unit
  | 'u' // Defects per unit (variable sample)
  | 'pareto' // Pareto analysis
  | 'box-whisker' // Box and whisker plot

export type ControlLimitMethod =
  | 'rbar-d2' // R-bar / d2 method (X-bar R)
  | 'sbar-c4' // S-bar / c4 method (X-bar S)
  | 'mr-d2' // Moving Range / d2 method (I-MR)
  | 'attribute-binomial' // Binomial (p, np charts)
  | 'attribute-poisson' // Poisson (c, u charts)

export interface ChartTypeDefinition {
  id: ChartTypeId
  name: string
  shortName: string
  category: ChartCategory
  description: string

  // Configuration requirements
  requiresSubgroupSize: boolean
  minSubgroupSize: number
  maxSubgroupSize: number | null
  recommendedSubgroupRange?: [number, number]

  // Data type requirements
  dataType: 'continuous' | 'attribute' | 'any'
  attributeType?: 'defective' | 'defects'

  // Layout configuration
  isDualChart: boolean
  primaryChartLabel?: string
  secondaryChartLabel?: string

  // Control limit method
  controlLimitMethod: ControlLimitMethod | null

  // Help key for HelpTooltip
  helpKey?: string
}

/**
 * Data for the secondary chart in dual-chart layouts.
 */
export interface SecondaryChartData {
  label: string
  dataPoints: SecondaryChartDataPoint[]
  controlLimits: {
    ucl: number | null
    lcl: number | null
    centerLine: number | null
  }
}

export interface SecondaryChartDataPoint {
  index: number
  value: number
  timestamp: string
  hasViolation: boolean
  violationRules: number[]
}

/**
 * Extended chart data response with secondary chart support.
 */
export interface DualChartData {
  chartType: ChartTypeId
  primary: {
    label: string
    // Uses existing ChartDataPoint structure
  }
  secondary?: SecondaryChartData
}

/**
 * Constants for control chart calculations.
 * Based on ASTM E2587-16, AIAG SPC Manual 2nd Ed., and Montgomery (2019).
 * Complete tables for subgroup sizes n=2 through n=25, matching the
 * authoritative backend constants in utils/constants.py.
 */
export const SPC_CONSTANTS = {
  // d2 constants for estimating sigma from R-bar
  // d2 = E[R] / sigma
  d2: {
    2: 1.128,
    3: 1.693,
    4: 2.059,
    5: 2.326,
    6: 2.534,
    7: 2.704,
    8: 2.847,
    9: 2.970,
    10: 3.078,
    11: 3.173,
    12: 3.258,
    13: 3.336,
    14: 3.407,
    15: 3.472,
    16: 3.532,
    17: 3.588,
    18: 3.640,
    19: 3.689,
    20: 3.735,
    21: 3.778,
    22: 3.819,
    23: 3.858,
    24: 3.895,
    25: 3.931,
  } as Record<number, number>,

  // D3 constants for LCL of R chart
  // LCL_R = D3 * R-bar
  D3: {
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0.076,
    8: 0.136,
    9: 0.184,
    10: 0.223,
    11: 0.256,
    12: 0.283,
    13: 0.307,
    14: 0.328,
    15: 0.347,
    16: 0.363,
    17: 0.378,
    18: 0.391,
    19: 0.403,
    20: 0.415,
    21: 0.425,
    22: 0.434,
    23: 0.443,
    24: 0.451,
    25: 0.459,
  } as Record<number, number>,

  // D4 constants for UCL of R chart
  // UCL_R = D4 * R-bar
  D4: {
    2: 3.267,
    3: 2.574,
    4: 2.282,
    5: 2.114,
    6: 2.004,
    7: 1.924,
    8: 1.864,
    9: 1.816,
    10: 1.777,
    11: 1.744,
    12: 1.717,
    13: 1.693,
    14: 1.672,
    15: 1.653,
    16: 1.637,
    17: 1.622,
    18: 1.608,
    19: 1.597,
    20: 1.585,
    21: 1.575,
    22: 1.566,
    23: 1.557,
    24: 1.548,
    25: 1.541,
  } as Record<number, number>,

  // A2 constants for X-bar chart limits (using R-bar)
  // UCL/LCL = X-double-bar +/- A2 * R-bar
  A2: {
    2: 1.880,
    3: 1.023,
    4: 0.729,
    5: 0.577,
    6: 0.483,
    7: 0.419,
    8: 0.373,
    9: 0.337,
    10: 0.308,
    11: 0.285,
    12: 0.266,
    13: 0.249,
    14: 0.235,
    15: 0.223,
    16: 0.212,
    17: 0.203,
    18: 0.194,
    19: 0.187,
    20: 0.180,
    21: 0.173,
    22: 0.167,
    23: 0.162,
    24: 0.157,
    25: 0.153,
  } as Record<number, number>,

  // c4 constants for estimating sigma from S-bar
  // c4 = E[S] / sigma
  c4: {
    2: 0.7979,
    3: 0.8862,
    4: 0.9213,
    5: 0.9400,
    6: 0.9515,
    7: 0.9594,
    8: 0.9650,
    9: 0.9693,
    10: 0.9727,
    11: 0.9754,
    12: 0.9776,
    13: 0.9794,
    14: 0.9810,
    15: 0.9823,
    16: 0.9835,
    17: 0.9845,
    18: 0.9854,
    19: 0.9862,
    20: 0.9869,
    21: 0.9876,
    22: 0.9882,
    23: 0.9887,
    24: 0.9892,
    25: 0.9896,
  } as Record<number, number>,

  // B3 constants for LCL of S chart
  // LCL_S = B3 * S-bar
  B3: {
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0.030,
    7: 0.118,
    8: 0.185,
    9: 0.239,
    10: 0.284,
    11: 0.321,
    12: 0.354,
    13: 0.382,
    14: 0.406,
    15: 0.428,
    16: 0.448,
    17: 0.466,
    18: 0.482,
    19: 0.497,
    20: 0.510,
    21: 0.523,
    22: 0.534,
    23: 0.545,
    24: 0.555,
    25: 0.565,
  } as Record<number, number>,

  // B4 constants for UCL of S chart
  // UCL_S = B4 * S-bar
  B4: {
    2: 3.267,
    3: 2.568,
    4: 2.266,
    5: 2.089,
    6: 1.970,
    7: 1.882,
    8: 1.815,
    9: 1.761,
    10: 1.716,
    11: 1.679,
    12: 1.646,
    13: 1.618,
    14: 1.594,
    15: 1.572,
    16: 1.552,
    17: 1.534,
    18: 1.518,
    19: 1.503,
    20: 1.490,
    21: 1.477,
    22: 1.466,
    23: 1.455,
    24: 1.445,
    25: 1.435,
  } as Record<number, number>,

  // A3 constants for X-bar chart limits (using S-bar)
  // UCL/LCL = X-double-bar +/- A3 * S-bar
  // A3 = 3 / (c4 * sqrt(n))
  A3: {
    2: 2.659,
    3: 1.954,
    4: 1.628,
    5: 1.427,
    6: 1.287,
    7: 1.182,
    8: 1.099,
    9: 1.032,
    10: 0.975,
    11: 0.927,
    12: 0.886,
    13: 0.850,
    14: 0.817,
    15: 0.789,
    16: 0.763,
    17: 0.739,
    18: 0.718,
    19: 0.698,
    20: 0.680,
    21: 0.663,
    22: 0.647,
    23: 0.633,
    24: 0.619,
    25: 0.606,
  } as Record<number, number>,

  // E2 constant for Individuals chart (using MR-bar)
  E2: 2.66, // For MR of 2 consecutive observations
}

/**
 * Get the SPC constant for a given subgroup size.
 * Returns the exact value if the subgroup size exists in the table,
 * or undefined if it does not. Never silently falls back to a different n.
 */
export function getSPCConstant(
  constantTable: Record<number, number>,
  n: number,
): number | undefined {
  return constantTable[n]
}
