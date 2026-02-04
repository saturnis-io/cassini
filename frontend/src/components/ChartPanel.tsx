import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ControlChart } from './ControlChart'
import { DistributionHistogram } from './DistributionHistogram'
import { useChartData } from '@/api/hooks'
import type { HistogramPosition } from '@/stores/dashboardStore'

interface ChartPanelProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  label?: 'Primary' | 'Secondary'
  histogramPosition: HistogramPosition
  showSpecLimits?: boolean
  className?: string
}

/**
 * ChartPanel - Unified control chart + histogram component
 *
 * Renders a control chart with an optional histogram that can be positioned:
 * - 'below': Traditional horizontal histogram below the chart
 * - 'right': Vertical histogram aligned with the Y-axis
 * - 'hidden': No histogram shown
 */
export function ChartPanel({
  characteristicId,
  chartOptions,
  label,
  histogramPosition,
  showSpecLimits = true,
  className,
}: ChartPanelProps) {
  const isRightPosition = histogramPosition === 'right'
  const showHistogram = histogramPosition !== 'hidden'

  // Color scheme based on label for comparison mode
  const colorScheme = label === 'Secondary' ? 'secondary' : 'primary'

  // Fetch chart data to calculate shared Y-axis domain for alignment
  const { data: chartData } = useChartData(characteristicId, chartOptions ?? { limit: 50 })

  // Calculate Y-axis domain to share between chart and histogram
  const yAxisDomain = useMemo((): [number, number] | undefined => {
    if (!chartData?.data_points?.length) return undefined

    const { control_limits, spec_limits, subgroup_mode, data_points } = chartData
    const isModeA = subgroup_mode === 'STANDARDIZED'

    if (isModeA) {
      // Fixed domain for Z-scores
      return [-4, 4]
    }

    // Mode B/C: Dynamic domain based on values, control limits, and spec limits
    const values = data_points.map((p) => p.mean)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)

    // Include control limits
    const ucl = control_limits.ucl ?? maxVal
    const lcl = control_limits.lcl ?? minVal

    // Also include spec limits if showing them
    const allLimits = [minVal, maxVal, ucl, lcl]
    if (showSpecLimits && spec_limits.usl != null) allLimits.push(spec_limits.usl)
    if (showSpecLimits && spec_limits.lsl != null) allLimits.push(spec_limits.lsl)

    const domainMin = Math.min(...allLimits)
    const domainMax = Math.max(...allLimits)
    const padding = (domainMax - domainMin) * 0.15

    return [domainMin - padding, domainMax + padding]
  }, [chartData, showSpecLimits])

  return (
    <div
      className={cn(
        'h-full',
        isRightPosition ? 'flex flex-row gap-2' : 'flex flex-col h-full',
        className
      )}
    >
      {/* Control Chart */}
      <div className={cn(
        isRightPosition ? 'flex-1 min-w-0' : 'flex-1 min-h-0',
      )}>
        <ControlChart
          characteristicId={characteristicId}
          chartOptions={chartOptions}
          label={label}
          showSpecLimits={showSpecLimits}
          colorScheme={colorScheme}
        />
      </div>

      {/* Histogram */}
      {showHistogram && (
        <div className={cn(
          'flex-shrink-0',
          isRightPosition
            ? 'w-44 h-full'  // Fixed width for side histogram
            : 'h-48 w-full'  // Fixed height for bottom histogram
        )}>
          <DistributionHistogram
            characteristicId={characteristicId}
            orientation={isRightPosition ? 'vertical' : 'horizontal'}
            label={label}
            colorScheme={colorScheme}
            yAxisDomain={isRightPosition ? yAxisDomain : undefined}
          />
        </div>
      )}
    </div>
  )
}
