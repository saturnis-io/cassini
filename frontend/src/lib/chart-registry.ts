/**
 * Chart Type Registry - Extensible system for SPC chart types.
 * Provides chart definitions, compatibility checking, and recommendations.
 */

import type { ChartTypeDefinition, ChartTypeId, ChartCategory } from '@/types/charts'

/**
 * Registry of all available chart types.
 */
export const chartTypeRegistry: Record<ChartTypeId, ChartTypeDefinition> = {
  // Current default - X-bar only
  'xbar': {
    id: 'xbar',
    name: 'X-bar Chart',
    shortName: 'X-bar',
    category: 'variable',
    description: 'Monitors the process mean over time. Plots subgroup averages.',
    requiresSubgroupSize: true,
    minSubgroupSize: 2,
    maxSubgroupSize: null,
    dataType: 'continuous',
    isDualChart: false,
    controlLimitMethod: 'rbar-d2',
    helpKey: 'chart-type-xbar',
  },

  // X-bar with Range chart
  'xbar-r': {
    id: 'xbar-r',
    name: 'X-bar and Range Chart',
    shortName: 'X-bar R',
    category: 'variable',
    description: 'X-bar chart paired with Range chart. Best for subgroups of 2-10 observations.',
    requiresSubgroupSize: true,
    minSubgroupSize: 2,
    maxSubgroupSize: 10,
    recommendedSubgroupRange: [2, 10],
    dataType: 'continuous',
    isDualChart: true,
    primaryChartLabel: 'X-bar (Averages)',
    secondaryChartLabel: 'R (Range)',
    controlLimitMethod: 'rbar-d2',
    helpKey: 'chart-type-xbar-r',
  },

  // X-bar with S chart
  'xbar-s': {
    id: 'xbar-s',
    name: 'X-bar and S Chart',
    shortName: 'X-bar S',
    category: 'variable',
    description: 'X-bar chart paired with Standard Deviation chart. Preferred for subgroups > 10.',
    requiresSubgroupSize: true,
    minSubgroupSize: 2,
    maxSubgroupSize: null,
    recommendedSubgroupRange: [10, 25],
    dataType: 'continuous',
    isDualChart: true,
    primaryChartLabel: 'X-bar (Averages)',
    secondaryChartLabel: 'S (Std Dev)',
    controlLimitMethod: 'sbar-c4',
    helpKey: 'chart-type-xbar-s',
  },

  // Individuals and Moving Range
  'i-mr': {
    id: 'i-mr',
    name: 'Individuals and Moving Range',
    shortName: 'I-MR',
    category: 'variable',
    description: 'For individual measurements (n=1). Pairs individual values with moving range.',
    requiresSubgroupSize: false,
    minSubgroupSize: 1,
    maxSubgroupSize: 1,
    dataType: 'continuous',
    isDualChart: true,
    primaryChartLabel: 'I (Individuals)',
    secondaryChartLabel: 'MR (Moving Range)',
    controlLimitMethod: 'mr-d2',
    helpKey: 'chart-type-i-mr',
  },

  // Attribute charts - p chart
  'p': {
    id: 'p',
    name: 'P Chart (Proportion Defective)',
    shortName: 'p',
    category: 'attribute',
    description: 'Monitors proportion of defective items. Use when sample size varies.',
    requiresSubgroupSize: true,
    minSubgroupSize: 1,
    maxSubgroupSize: null,
    dataType: 'attribute',
    attributeType: 'defective',
    isDualChart: false,
    controlLimitMethod: 'attribute-binomial',
    helpKey: 'chart-type-p',
  },

  // np chart
  'np': {
    id: 'np',
    name: 'NP Chart (Number Defective)',
    shortName: 'np',
    category: 'attribute',
    description: 'Monitors count of defective items. Use when sample size is constant.',
    requiresSubgroupSize: true,
    minSubgroupSize: 1,
    maxSubgroupSize: null,
    dataType: 'attribute',
    attributeType: 'defective',
    isDualChart: false,
    controlLimitMethod: 'attribute-binomial',
    helpKey: 'chart-type-np',
  },

  // c chart
  'c': {
    id: 'c',
    name: 'C Chart (Defects per Unit)',
    shortName: 'c',
    category: 'attribute',
    description: 'Monitors count of defects per inspection unit. Constant area of opportunity.',
    requiresSubgroupSize: true,
    minSubgroupSize: 1,
    maxSubgroupSize: null,
    dataType: 'attribute',
    attributeType: 'defects',
    isDualChart: false,
    controlLimitMethod: 'attribute-poisson',
    helpKey: 'chart-type-c',
  },

  // u chart
  'u': {
    id: 'u',
    name: 'U Chart (Defects per Unit - Variable)',
    shortName: 'u',
    category: 'attribute',
    description: 'Monitors defects per unit with variable area of opportunity.',
    requiresSubgroupSize: true,
    minSubgroupSize: 1,
    maxSubgroupSize: null,
    dataType: 'attribute',
    attributeType: 'defects',
    isDualChart: false,
    controlLimitMethod: 'attribute-poisson',
    helpKey: 'chart-type-u',
  },

  // Pareto chart
  'pareto': {
    id: 'pareto',
    name: 'Pareto Chart',
    shortName: 'Pareto',
    category: 'analysis',
    description: 'Displays defect categories sorted by frequency with cumulative percentage line.',
    requiresSubgroupSize: false,
    minSubgroupSize: 1,
    maxSubgroupSize: null,
    dataType: 'attribute',
    isDualChart: false,
    controlLimitMethod: null,
    helpKey: 'chart-type-pareto',
  },

  // Box and Whisker
  'box-whisker': {
    id: 'box-whisker',
    name: 'Box and Whisker Plot',
    shortName: 'Box Plot',
    category: 'analysis',
    description: 'Shows measurement distribution per sample. Requires n≥2.',
    requiresSubgroupSize: true,
    minSubgroupSize: 2,  // Need at least 2 measurements to show distribution
    maxSubgroupSize: null,
    dataType: 'continuous',
    isDualChart: false,
    controlLimitMethod: null,
    helpKey: 'chart-type-box-whisker',
  },
}

/**
 * Get a chart type definition by ID.
 */
export function getChartType(id: ChartTypeId): ChartTypeDefinition {
  return chartTypeRegistry[id]
}

/**
 * Get all chart types in a category.
 */
export function getChartTypesByCategory(category: ChartCategory): ChartTypeDefinition[] {
  return Object.values(chartTypeRegistry).filter((ct) => ct.category === category)
}

/**
 * Get chart types grouped by category.
 */
export function getChartTypesGrouped(): Record<ChartCategory, ChartTypeDefinition[]> {
  return {
    variable: getChartTypesByCategory('variable'),
    attribute: getChartTypesByCategory('attribute'),
    analysis: getChartTypesByCategory('analysis'),
  }
}

/**
 * Recommend a chart type based on subgroup size.
 */
export function recommendChartType(subgroupSize: number): ChartTypeId {
  if (subgroupSize === 1) {
    return 'i-mr'
  }
  if (subgroupSize >= 2 && subgroupSize <= 10) {
    return 'xbar-r'
  }
  // For n > 10, X-bar S is generally preferred
  return 'xbar-s'
}

/**
 * Check if a chart type is compatible with a given subgroup size.
 */
export function isChartTypeCompatible(
  chartTypeId: ChartTypeId,
  subgroupSize: number
): boolean {
  const chartType = chartTypeRegistry[chartTypeId]

  if (subgroupSize < chartType.minSubgroupSize) {
    return false
  }

  if (chartType.maxSubgroupSize !== null && subgroupSize > chartType.maxSubgroupSize) {
    return false
  }

  return true
}

/**
 * Get compatible chart types for a given subgroup size.
 */
export function getCompatibleChartTypes(
  subgroupSize: number,
  dataType: 'continuous' | 'attribute' = 'continuous'
): ChartTypeDefinition[] {
  return Object.values(chartTypeRegistry).filter((ct) => {
    // Filter by data type
    if (ct.dataType !== dataType && ct.category !== 'analysis') {
      return false
    }

    // Check subgroup compatibility
    return isChartTypeCompatible(ct.id, subgroupSize)
  })
}

/**
 * Variable data chart types (for filtering in selector).
 */
export const VARIABLE_CHART_TYPES: ChartTypeId[] = ['xbar', 'xbar-r', 'xbar-s', 'i-mr']

/**
 * Attribute chart types.
 */
export const ATTRIBUTE_CHART_TYPES: ChartTypeId[] = ['p', 'np', 'c', 'u']

/**
 * Analysis chart types.
 */
export const ANALYSIS_CHART_TYPES: ChartTypeId[] = ['pareto', 'box-whisker']

/**
 * Dual chart types that show two synchronized charts.
 */
export const DUAL_CHART_TYPES: ChartTypeId[] = ['xbar-r', 'xbar-s', 'i-mr']
