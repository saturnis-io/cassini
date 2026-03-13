import type { ChartData } from '@/types'

/**
 * Extract measurement values from chart data regardless of chart type.
 * CUSUM/EWMA charts return data in separate arrays with a `measurement` field
 * rather than the standard `data_points[].mean`.
 */
export function getChartMeasurements(chartData: ChartData): number[] {
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    return chartData.cusum_data_points
      .filter((p) => !p.excluded)
      .map((p) => p.measurement)
  }
  if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    return chartData.ewma_data_points
      .filter((p) => !p.excluded)
      .map((p) => p.measurement)
  }
  return chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
}

/** Check whether chart data has any renderable points (any chart type). */
export function hasChartPoints(chartData: ChartData): boolean {
  return (
    chartData.data_points.length > 0 ||
    (chartData.cusum_data_points?.length ?? 0) > 0 ||
    (chartData.ewma_data_points?.length ?? 0) > 0
  )
}

export function calculateStatistics(chartData: ChartData) {
  const values = getChartMeasurements(chartData)
  if (values.length === 0) {
    return { mean: null, stdDev: null, range: null, oocCount: 0, inControlPct: 100 }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const range = Math.max(...values) - Math.min(...values)

  // Count OOC from whichever data array is populated
  let oocCount = 0
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    oocCount = chartData.cusum_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    oocCount = chartData.ewma_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else {
    oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  }
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  return { mean, stdDev, range, oocCount, inControlPct }
}
