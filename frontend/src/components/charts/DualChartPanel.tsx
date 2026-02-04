/**
 * DualChartPanel - Renders synchronized dual control charts.
 * Used for X-bar/Range, X-bar/S, and I-MR chart combinations.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ControlChart } from '@/components/ControlChart'
import { DistributionHistogram } from '@/components/DistributionHistogram'
import { RangeChart } from './RangeChart'
import { useChartData } from '@/api/hooks'
import type { ChartTypeId } from '@/types/charts'
import type { HistogramPosition } from '@/stores/dashboardStore'

interface DualChartPanelProps {
  characteristicId: number
  chartType: ChartTypeId
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  label?: 'Primary' | 'Secondary'
  histogramPosition: HistogramPosition
  showSpecLimits?: boolean
  className?: string
  /** Default height ratio for primary chart (0-1, default 0.6) */
  defaultPrimaryRatio?: number
}

/**
 * Map chart type to secondary chart type.
 */
function getSecondaryChartType(chartType: ChartTypeId): 'range' | 'stddev' | 'mr' | null {
  switch (chartType) {
    case 'xbar-r':
      return 'range'
    case 'xbar-s':
      return 'stddev'
    case 'i-mr':
      return 'mr'
    default:
      return null
  }
}

export function DualChartPanel({
  characteristicId,
  chartType,
  chartOptions,
  label,
  histogramPosition,
  showSpecLimits = true,
  className,
  defaultPrimaryRatio = 0.6,
}: DualChartPanelProps) {
  const secondaryChartType = getSecondaryChartType(chartType)
  const isRightPosition = histogramPosition === 'right'
  const showHistogram = histogramPosition !== 'hidden'

  // State for cross-chart highlighting
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [hoveredBinRange, setHoveredBinRange] = useState<[number, number] | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // State for resizable divider
  const [primaryRatio, setPrimaryRatio] = useState(defaultPrimaryRatio)
  const [histogramWidth, setHistogramWidth] = useState(280)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingDivider = useRef(false)
  const isDraggingHistogram = useRef(false)
  const startY = useRef(0)
  const startX = useRef(0)
  const startRatio = useRef(0)
  const startWidth = useRef(0)

  // Color scheme
  const colorScheme = label === 'Secondary' ? 'secondary' : 'primary'

  // Fetch chart data for Y-axis domain calculation
  const { data: chartData } = useChartData(characteristicId, chartOptions ?? { limit: 50 })

  // Calculate shared Y-axis domain
  const yAxisDomain = useMemo((): [number, number] | undefined => {
    if (!chartData?.data_points?.length) return undefined

    const { control_limits, spec_limits, subgroup_mode, data_points } = chartData
    const isModeA = subgroup_mode === 'STANDARDIZED'

    if (isModeA) {
      return [-4, 4]
    }

    const values = data_points.map((p) => p.mean)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)

    const allLimits = [minVal, maxVal]
    if (control_limits.ucl != null) allLimits.push(control_limits.ucl)
    if (control_limits.lcl != null) allLimits.push(control_limits.lcl)
    if (spec_limits.usl != null) allLimits.push(spec_limits.usl)
    if (spec_limits.lsl != null) allLimits.push(spec_limits.lsl)

    const domainMin = Math.min(...allLimits)
    const domainMax = Math.max(...allLimits)
    const padding = (domainMax - domainMin) * 0.1

    return [domainMin - padding, domainMax + padding]
  }, [chartData])

  // Handle vertical divider drag (between primary and secondary charts)
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingDivider.current = true
    startY.current = e.clientY
    startRatio.current = primaryRatio
    e.preventDefault()
  }, [primaryRatio])

  // Handle horizontal histogram resize
  const handleHistogramMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingHistogram.current = true
    startX.current = e.clientX
    startWidth.current = histogramWidth
    e.preventDefault()
  }, [histogramWidth])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingDivider.current && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect()
        const containerHeight = containerRect.height
        const delta = e.clientY - startY.current
        const deltaRatio = delta / containerHeight
        const newRatio = Math.min(Math.max(startRatio.current + deltaRatio, 0.3), 0.7)
        setPrimaryRatio(newRatio)
      }

      if (isDraggingHistogram.current) {
        const delta = startX.current - e.clientX
        const newWidth = Math.min(Math.max(startWidth.current + delta, 200), 500)
        setHistogramWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      isDraggingDivider.current = false
      isDraggingHistogram.current = false
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // If no secondary chart, fall back to single chart layout
  if (!secondaryChartType) {
    return (
      <div className={cn('h-full flex', isRightPosition ? 'flex-row gap-2' : 'flex-col', className)}>
        <div className={cn(isRightPosition ? 'flex-1 min-w-0' : 'flex-1 min-h-0')}>
          <ControlChart
            characteristicId={characteristicId}
            chartOptions={chartOptions}
            label={label}
            showSpecLimits={showSpecLimits}
            colorScheme={colorScheme}
            yAxisDomain={isRightPosition ? yAxisDomain : undefined}
            onHoverValue={showHistogram ? setHoveredValue : undefined}
            highlightedRange={hoveredBinRange}
          />
        </div>
        {showHistogram && (
          <div
            className={cn('flex-shrink-0 relative', isRightPosition ? 'h-full' : 'w-full')}
            style={isRightPosition ? { width: histogramWidth } : { height: 192 }}
          >
            {isRightPosition && (
              <div
                onMouseDown={handleHistogramMouseDown}
                className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize z-10 group"
                title="Drag to resize"
              >
                <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
              </div>
            )}
            <DistributionHistogram
              characteristicId={characteristicId}
              orientation={isRightPosition ? 'vertical' : 'horizontal'}
              label={label}
              colorScheme={colorScheme}
              chartOptions={chartOptions}
              yAxisDomain={isRightPosition ? yAxisDomain : undefined}
              highlightedValue={hoveredValue}
              onHoverBin={setHoveredBinRange}
            />
          </div>
        )}
      </div>
    )
  }

  // Dual chart layout
  return (
    <div
      ref={containerRef}
      className={cn('h-full flex', isRightPosition ? 'flex-row gap-2' : 'flex-col', className)}
    >
      {/* Charts container (primary + secondary stacked) */}
      <div className={cn('flex flex-col gap-1', isRightPosition ? 'flex-1 min-w-0' : 'flex-1 min-h-0')}>
        {/* Primary Chart (X-bar or Individuals) */}
        <div style={{ height: `calc(${primaryRatio * 100}% - 6px)` }}>
          <ControlChart
            characteristicId={characteristicId}
            chartOptions={chartOptions}
            label={label}
            showSpecLimits={showSpecLimits}
            colorScheme={colorScheme}
            yAxisDomain={isRightPosition ? yAxisDomain : undefined}
            onHoverValue={showHistogram ? setHoveredValue : undefined}
            highlightedRange={hoveredBinRange}
          />
        </div>

        {/* Resizable divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="h-3 flex items-center justify-center cursor-ns-resize group flex-shrink-0"
          title="Drag to resize charts"
        >
          <div className="w-16 h-1 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
        </div>

        {/* Secondary Chart (Range, S, or MR) */}
        <div style={{ height: `calc(${(1 - primaryRatio) * 100}% - 6px)` }}>
          <RangeChart
            characteristicId={characteristicId}
            chartOptions={chartOptions}
            chartType={secondaryChartType}
            colorScheme={colorScheme}
            onHoverIndex={setHoveredIndex}
            highlightedIndex={hoveredIndex}
          />
        </div>
      </div>

      {/* Histogram (optional, only for primary chart values) */}
      {showHistogram && (
        <div
          className={cn('flex-shrink-0 relative', isRightPosition ? 'h-full' : 'w-full')}
          style={isRightPosition ? { width: histogramWidth } : { height: 192 }}
        >
          {isRightPosition && (
            <div
              onMouseDown={handleHistogramMouseDown}
              className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize z-10 group"
              title="Drag to resize"
            >
              <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
            </div>
          )}
          <DistributionHistogram
            characteristicId={characteristicId}
            orientation={isRightPosition ? 'vertical' : 'horizontal'}
            label={label}
            colorScheme={colorScheme}
            chartOptions={chartOptions}
            yAxisDomain={isRightPosition ? yAxisDomain : undefined}
            highlightedValue={hoveredValue}
            onHoverBin={setHoveredBinRange}
          />
        </div>
      )}
    </div>
  )
}

export default DualChartPanel
