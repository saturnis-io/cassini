import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { calculateSharedYAxisDomain } from '@/lib/chart-domain'
import { ControlChart } from './ControlChart'
import { AttributeChart } from './AttributeChart'
import { CUSUMChart } from './CUSUMChart'
import { EWMAChart } from './EWMAChart'
import { ParetoChart } from './ParetoChart'
import { DistributionHistogram } from './DistributionHistogram'
import { ErrorBoundary } from './ErrorBoundary'
import { useChartData } from '@/api/hooks'
import type { HistogramPosition } from '@/stores/dashboardStore'
import type { ChartTypeId } from '@/types/charts'
import type { RegionSelection } from '@/components/RegionActionModal'

interface ChartPanelProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  /** User-selected chart type — overrides backend chart_type for routing */
  chartType?: ChartTypeId
  label?: 'Primary' | 'Secondary'
  histogramPosition: HistogramPosition
  showSpecLimits?: boolean
  className?: string
  /** Initial width for vertical histogram panel (default 280px) */
  defaultHistogramWidth?: number
  /** Initial height for horizontal histogram panel (default 192px) */
  defaultHistogramHeight?: number
  /** Callback when a data point is clicked for point annotation creation */
  onPointAnnotation?: (sampleId: number) => void
  /** Callback when a region is drag-selected on the chart */
  onRegionSelect?: (info: RegionSelection) => void
  /** Highlight a specific sample on the chart (e.g. the inspected violation) */
  highlightSampleId?: number
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
  chartType,
  label,
  histogramPosition,
  showSpecLimits = true,
  className,
  defaultHistogramWidth = 280,
  defaultHistogramHeight = 192,
  onPointAnnotation,
  onRegionSelect,
  highlightSampleId,
}: ChartPanelProps) {
  const isRightPosition = histogramPosition === 'right'
  const isBelowPosition = histogramPosition === 'below'

  // State for cross-chart highlighting (bidirectional)
  // hoveredValue: from X-bar chart hover -> highlights histogram bar
  // hoveredBinRange: from histogram bar hover -> highlights X-bar points
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [hoveredBinRange, setHoveredBinRange] = useState<[number, number] | null>(null)

  // State and refs for resizable histogram panels
  const [histogramWidth, setHistogramWidth] = useState(defaultHistogramWidth)
  const [histogramHeight, setHistogramHeight] = useState(defaultHistogramHeight)
  const isDraggingX = useRef(false)
  const isDraggingY = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startWidth = useRef(0)
  const startHeight = useRef(0)

  // Handle mouse events for horizontal drag-to-resize (vertical histogram width)
  const handleMouseDownX = useCallback(
    (e: React.MouseEvent) => {
      isDraggingX.current = true
      startX.current = e.clientX
      startWidth.current = histogramWidth
      e.preventDefault()
    },
    [histogramWidth],
  )

  // Handle mouse events for vertical drag-to-resize (horizontal histogram height)
  const handleMouseDownY = useCallback(
    (e: React.MouseEvent) => {
      isDraggingY.current = true
      startY.current = e.clientY
      startHeight.current = histogramHeight
      e.preventDefault()
    },
    [histogramHeight],
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingX.current) {
        // Dragging left (decreasing X) should increase width (panel expands left)
        const delta = startX.current - e.clientX
        const newWidth = Math.min(Math.max(startWidth.current + delta, 200), 500)
        setHistogramWidth(newWidth)
      }
      if (isDraggingY.current) {
        // Dragging up (decreasing Y) should increase height (panel expands up)
        const delta = startY.current - e.clientY
        const newHeight = Math.min(Math.max(startHeight.current + delta, 120), 400)
        setHistogramHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      isDraggingX.current = false
      isDraggingY.current = false
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

  // Histogram only applies to standard Shewhart charts (not CUSUM/EWMA/attribute)
  const isHistogramApplicable =
    chartData?.data_type !== 'attribute' &&
    chartType !== 'cusum' && chartData?.chart_type !== 'cusum' &&
    chartType !== 'ewma' && chartData?.chart_type !== 'ewma'
  const showHistogram = histogramPosition !== 'hidden' && isHistogramApplicable

  // Shared domain keeps histogram + control chart Y-axes aligned
  const yAxisDomain = useMemo(
    () => calculateSharedYAxisDomain(chartData, showSpecLimits),
    [chartData, showSpecLimits],
  )

  return (
    <div
      className={cn(
        'h-full',
        isRightPosition ? 'flex flex-row gap-2' : 'flex h-full flex-col gap-3',
        className,
      )}
    >
      {/* Control Chart, Attribute Chart, CUSUM Chart, or EWMA Chart */}
      <div className={cn(isRightPosition ? 'min-w-0 flex-1' : 'min-h-0 flex-1')}>
        <ErrorBoundary>
          {/* Route by user-selected chart type first, then fall back to backend metadata */}
          {chartType === 'pareto' ? (
            <ParetoChart characteristicId={characteristicId} chartOptions={chartOptions} />
          ) : chartData?.data_type === 'attribute' ? (
            <AttributeChart characteristicId={characteristicId} chartOptions={chartOptions} onPointAnnotation={onPointAnnotation} highlightSampleId={highlightSampleId} />
          ) : (chartType === 'cusum' || chartData?.chart_type === 'cusum') &&
            chartData?.cusum_data_points?.length ? (
            <CUSUMChart characteristicId={characteristicId} chartOptions={chartOptions} onPointAnnotation={onPointAnnotation} highlightSampleId={highlightSampleId} />
          ) : (chartType === 'ewma' || chartData?.chart_type === 'ewma') &&
            chartData?.ewma_data_points?.length ? (
            <EWMAChart characteristicId={characteristicId} chartOptions={chartOptions} onPointAnnotation={onPointAnnotation} highlightSampleId={highlightSampleId} />
          ) : (
            <ControlChart
              characteristicId={characteristicId}
              chartOptions={chartOptions}
              label={label}
              showSpecLimits={showSpecLimits}
              colorScheme={colorScheme}
              yAxisDomain={showHistogram ? yAxisDomain : undefined}
              onHoverValue={showHistogram ? setHoveredValue : undefined}
              highlightedRange={hoveredBinRange}
              onPointAnnotation={onPointAnnotation}
              onRegionSelect={onRegionSelect}
              highlightSampleId={highlightSampleId}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* Histogram */}
      {showHistogram && (
        <div
          className={cn('relative flex-shrink-0', isRightPosition ? 'h-full' : 'w-full')}
          style={isRightPosition ? { width: histogramWidth } : { height: histogramHeight }}
        >
          {/* Drag handle for resizing vertical histogram (left edge) */}
          {isRightPosition && (
            <div
              onMouseDown={handleMouseDownX}
              className="group absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize"
              title="Drag to resize"
            >
              {/* Visual indicator line */}
              <div className="bg-border group-hover:bg-primary/50 absolute top-1/2 left-0.5 h-16 w-0.5 -translate-y-1/2 rounded-full transition-colors" />
            </div>
          )}
          {/* Drag handle for resizing horizontal histogram (top edge) */}
          {isBelowPosition && (
            <div
              onMouseDown={handleMouseDownY}
              className="group absolute -top-1 right-0 left-0 z-10 h-2 cursor-ns-resize"
              title="Drag to resize"
            >
              {/* Visual indicator line */}
              <div className="bg-border group-hover:bg-primary/50 absolute top-0.5 left-1/2 h-0.5 w-16 -translate-x-1/2 rounded-full transition-colors" />
            </div>
          )}
          <DistributionHistogram
            characteristicId={characteristicId}
            orientation={isRightPosition ? 'vertical' : 'horizontal'}
            label={label}
            colorScheme={colorScheme}
            chartOptions={chartOptions}
            yAxisDomain={yAxisDomain}
            highlightedValue={hoveredValue}
            onHoverBin={setHoveredBinRange}
            showSpecLimits={showSpecLimits}
          />
        </div>
      )}
    </div>
  )
}
