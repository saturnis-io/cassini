import { cn } from '@/lib/utils'
import { ControlChart } from './ControlChart'
import { DistributionHistogram } from './DistributionHistogram'
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
          />
        </div>
      )}
    </div>
  )
}
