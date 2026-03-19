/**
 * Builds ECharts line series for control limit lines (UCL, CL, LCL).
 *
 * In non-standardized modes, control limits are rendered as separate line
 * series rather than markLines to work around an ECharts rendering bug where
 * markLine yAxis values snap to the series mean instead of the specified
 * coordinate.
 */

import type { ChartPoint } from '@/components/PinnedChartTooltip'

interface ControlLimits {
  ucl: number | null
  lcl: number | null
  center_line: number | null
  source?: string | null
}

interface BuildControlLimitSeriesParams {
  isModeA: boolean | undefined
  control_limits: ControlLimits
  data: ChartPoint[]
  useTimeCoords: boolean
  chartColors: {
    uclLine: string
    centerLine: string
    lclLine: string
  }
  formatVal: (value: number | null | undefined) => string
}

export function buildControlLimitSeries({
  isModeA,
  control_limits,
  data,
  useTimeCoords,
  chartColors,
  formatVal,
}: BuildControlLimitSeriesParams): Record<string, unknown>[] {
  const series: Record<string, unknown>[] = []

  if (isModeA) return series

  const isTrial = control_limits.source === 'trial'
  const trialSuffix = isTrial ? ' (trial)' : ''
  const limitDash = isTrial ? [4, 4] : [6, 3]
  const limitWidth = isTrial ? 1 : 1.5
  const centerDash = isTrial ? [4, 4] : undefined
  const centerWidth = isTrial ? 1.5 : 2.5

  if (control_limits.ucl != null) {
    const uclData = useTimeCoords
      ? data.map((p) => [p.timestampMs, control_limits.ucl])
      : data.map(() => control_limits.ucl)
    series.push({
      type: 'line',
      data: uclData,
      lineStyle: { color: chartColors.uclLine, type: limitDash, width: limitWidth },
      symbol: 'none',
      showSymbol: false,
      silent: true,
      z: 4,
      endLabel: {
        show: true,
        formatter: `UCL: ${formatVal(control_limits.ucl)}${trialSuffix}`,
        color: chartColors.uclLine,
        fontSize: 11,
        fontWeight: 500,
      },
    })
  }
  if (control_limits.center_line != null) {
    const clData = useTimeCoords
      ? data.map((p) => [p.timestampMs, control_limits.center_line])
      : data.map(() => control_limits.center_line)
    series.push({
      type: 'line',
      data: clData,
      lineStyle: { color: chartColors.centerLine, type: centerDash, width: centerWidth },
      symbol: 'none',
      showSymbol: false,
      silent: true,
      z: 4,
      endLabel: {
        show: true,
        formatter: `CL: ${formatVal(control_limits.center_line)}${trialSuffix}`,
        color: chartColors.centerLine,
        fontSize: 11,
        fontWeight: 600,
      },
    })
  }
  if (control_limits.lcl != null) {
    const lclData = useTimeCoords
      ? data.map((p) => [p.timestampMs, control_limits.lcl])
      : data.map(() => control_limits.lcl)
    series.push({
      type: 'line',
      data: lclData,
      lineStyle: { color: chartColors.lclLine, type: limitDash, width: limitWidth },
      symbol: 'none',
      showSymbol: false,
      silent: true,
      z: 4,
      endLabel: {
        show: true,
        formatter: `LCL: ${formatVal(control_limits.lcl)}${trialSuffix}`,
        color: chartColors.lclLine,
        fontSize: 11,
        fontWeight: 500,
      },
    })
  }

  return series
}
