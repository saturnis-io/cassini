import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
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
  /** Initial width for vertical histogram panel (default 280px) */
  defaultHistogramWidth?: number
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
  defaultHistogramWidth = 280,
}: ChartPanelProps) {
  const isRightPosition = histogramPosition === 'right'
  const showHistogram = histogramPosition !== 'hidden'

  // State for cross-chart highlighting
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)

  // State and refs for resizable vertical histogram panel
  const [histogramWidth, setHistogramWidth] = useState(defaultHistogramWidth)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  // Handle mouse events for drag-to-resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    startX.current = e.clientX
    startWidth.current = histogramWidth
    e.preventDefault()
  }, [histogramWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      // Dragging left (decreasing X) should increase width (panel expands left)
      const delta = startX.current - e.clientX
      const newWidth = Math.min(Math.max(startWidth.current + delta, 200), 500)
      setHistogramWidth(newWidth)
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Color scheme based on label for comparison mode
  const colorScheme = label === 'Secondary' ? 'secondary' : 'primary'

  // Fetch chart data to calculate shared Y-axis domain for alignment
  const { data: chartData } = useChartData(characteristicId, chartOptions ?? { limit: 50 })

  // Calculate shared Y-axis domain for BOTH charts to ensure perfect alignment
  // ALWAYS includes UCL, LCL, USL, LSL so all limits are visible
  const yAxisDomain = useMemo((): [number, number] | undefined => {
    if (!chartData?.data_points?.length) return undefined

    const { control_limits, spec_limits, subgroup_mode, data_points } = chartData
    const isModeA = subgroup_mode === 'STANDARDIZED'

    if (isModeA) {
      // Fixed domain for Z-scores
      return [-4, 4]
    }

    // Mode B/C: Dynamic domain based on values AND all limits
    const values = data_points.map((p) => p.mean)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)

    // ALWAYS include ALL limits (UCL, LCL, USL, LSL) regardless of display settings
    // This ensures both charts have the same domain and limits are always visible
    const allLimits = [minVal, maxVal]

    // Control limits
    if (control_limits.ucl != null) allLimits.push(control_limits.ucl)
    if (control_limits.lcl != null) allLimits.push(control_limits.lcl)

    // Spec limits - always include so they're visible on both charts
    if (spec_limits.usl != null) allLimits.push(spec_limits.usl)
    if (spec_limits.lsl != null) allLimits.push(spec_limits.lsl)

    const domainMin = Math.min(...allLimits)
    const domainMax = Math.max(...allLimits)
    const padding = (domainMax - domainMin) * 0.1

    return [domainMin - padding, domainMax + padding]
  }, [chartData])

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
          yAxisDomain={isRightPosition ? yAxisDomain : undefined}
          onHoverValue={showHistogram ? setHoveredValue : undefined}
        />
      </div>

      {/* Histogram */}
      {showHistogram && (
        <div
          className={cn(
            'flex-shrink-0 relative',
            isRightPosition ? 'h-full' : 'h-48 w-full'
          )}
          style={isRightPosition ? { width: histogramWidth } : undefined}
        >
          {/* Drag handle for resizing vertical histogram */}
          {isRightPosition && (
            <div
              onMouseDown={handleMouseDown}
              className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize z-10 group"
              title="Drag to resize"
            >
              {/* Visual indicator line */}
              <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
            </div>
          )}
          <DistributionHistogram
            characteristicId={characteristicId}
            orientation={isRightPosition ? 'vertical' : 'horizontal'}
            label={label}
            colorScheme={colorScheme}
            yAxisDomain={isRightPosition ? yAxisDomain : undefined}
            highlightedValue={hoveredValue}
          />
        </div>
      )}
    </div>
  )
}
