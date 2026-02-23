/**
 * Shared Y-axis domain calculation for chart panels.
 *
 * Used by ChartPanel (single chart) and DualChartPanel (X-bar + Range)
 * to compute a shared domain that keeps the histogram and control chart
 * Y-axes aligned. Mirrors ControlChart's own standalone domain logic
 * so toggling the histogram doesn't shift the view.
 */
import type { ChartData } from '@/types'

/**
 * Calculate a Y-axis domain [min, max] that fits the chart data,
 * control limits, and (optionally) spec limits with consistent padding.
 *
 * Returns undefined when there's no data.
 */
export function calculateSharedYAxisDomain(
  chartData: ChartData | undefined,
  showSpecLimits: boolean,
): [number, number] | undefined {
  if (!chartData?.data_points?.length) return undefined

  const { control_limits, spec_limits, subgroup_mode, data_points } = chartData
  const isModeA = subgroup_mode === 'STANDARDIZED'
  const isStandardizedShortRun = chartData.short_run_mode === 'standardized'

  if (isModeA || isStandardizedShortRun) {
    // Use display_value (Z-scores) — p.mean is the raw engineering value
    const zValues = data_points
      .map((p) => p.display_value ?? (isModeA ? p.z_score : null))
      .filter((v): v is number => v != null)
    if (zValues.length === 0) return [-4, 4]

    const allZLimits = [...zValues, 3, -3]
    const zMin = Math.min(...allZLimits)
    const zMax = Math.max(...allZLimits)
    const zPadding = (zMax - zMin) * 0.2
    return [zMin - zPadding, zMax + zPadding]
  }

  // Mode B/C: display_value carries transformed values (deviation mode etc.)
  const values = data_points.map((p) => p.display_value ?? p.mean)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)

  const allLimits = [minVal, maxVal]

  // Control limits — always include
  if (control_limits.ucl != null) allLimits.push(control_limits.ucl)
  if (control_limits.lcl != null) allLimits.push(control_limits.lcl)

  // Spec limits — only when visible, matching ControlChart's standalone logic
  if (showSpecLimits) {
    if (spec_limits.usl != null) allLimits.push(spec_limits.usl)
    if (spec_limits.lsl != null) allLimits.push(spec_limits.lsl)
  }

  const domainMin = Math.min(...allLimits)
  const domainMax = Math.max(...allLimits)
  const padding = (domainMax - domainMin) * 0.2

  return [domainMin - padding, domainMax + padding]
}
