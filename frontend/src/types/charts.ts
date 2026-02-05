/**
 * Chart type definitions for comprehensive SPC chart support.
 * Based on architecture design document.
 */

export type ChartCategory = 'variable' | 'attribute' | 'analysis'

export type ChartTypeId =
  | 'xbar'       // X-bar only (current default)
  | 'xbar-r'     // X-bar and Range
  | 'xbar-s'     // X-bar and S (Standard Deviation)
  | 'i-mr'       // Individuals and Moving Range
  | 'p'          // Proportion defective
  | 'np'         // Number defective
  | 'c'          // Defects per unit
  | 'u'          // Defects per unit (variable sample)
  | 'pareto'     // Pareto analysis
  | 'box-whisker' // Box and whisker plot

export type ControlLimitMethod =
  | 'rbar-d2'            // R-bar / d2 method (X-bar R)
  | 'sbar-c4'            // S-bar / c4 method (X-bar S)
  | 'mr-d2'              // Moving Range / d2 method (I-MR)
  | 'attribute-binomial' // Binomial (p, np charts)
  | 'attribute-poisson'  // Poisson (c, u charts)

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
  dataType: 'continuous' | 'attribute'
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
 * Based on standard SPC tables.
 */
export const SPC_CONSTANTS = {
  // d2 constants for estimating sigma from R-bar
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
  } as Record<number, number>,

  // D3 constants for LCL of R chart
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
  } as Record<number, number>,

  // D4 constants for UCL of R chart
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
  } as Record<number, number>,

  // A2 constants for X-bar chart limits (using R-bar)
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
  } as Record<number, number>,

  // c4 constants for estimating sigma from S-bar
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
    15: 0.9823,
    20: 0.9869,
    25: 0.9896,
  } as Record<number, number>,

  // B3 constants for LCL of S chart
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
    15: 0.428,
    20: 0.510,
    25: 0.565,
  } as Record<number, number>,

  // B4 constants for UCL of S chart
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
    15: 1.572,
    20: 1.490,
    25: 1.435,
  } as Record<number, number>,

  // A3 constants for X-bar chart limits (using S-bar)
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
    15: 0.789,
    20: 0.680,
    25: 0.606,
  } as Record<number, number>,

  // E2 constant for Individuals chart (using MR-bar)
  E2: 2.660, // For MR of 2 consecutive observations
}

/**
 * Get the appropriate constant for a given subgroup size.
 * Falls back to closest available if exact match not found.
 */
export function getSPCConstant(
  constantTable: Record<number, number>,
  n: number
): number | null {
  if (constantTable[n] !== undefined) {
    return constantTable[n]
  }

  // For larger n, use the largest available
  const keys = Object.keys(constantTable).map(Number).sort((a, b) => a - b)
  const maxKey = keys[keys.length - 1]

  if (n > maxKey) {
    return constantTable[maxKey]
  }

  return null
}
