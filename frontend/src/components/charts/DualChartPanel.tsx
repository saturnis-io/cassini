/**
 * DualChartPanel - Renders synchronized dual control charts.
 * Used for X-bar/Range, X-bar/S, and I-MR chart combinations.
 *
 * Layout: The histogram (when positioned right) aligns ONLY with the primary chart,
 * not the full height of both charts, ensuring visual alignment.
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
  /** Callback when a data point is clicked for point annotation creation */
  onPointAnnotation?: (sampleId: number) => void
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
  onPointAnnotation,
}: DualChartPanelProps) {
  const secondaryChartType = getSecondaryChartType(chartType)
  const isRightPosition = histogramPosition === 'right'
  const isBelowPosition = histogramPosition === 'below'
  const showHistogram = histogramPosition !== 'hidden'

  // State for cross-chart highlighting
  const [hoveredValue, setHoveredValue] = useState<number | null>(null)
  const [hoveredBinRange, setHoveredBinRange] = useState<[number, number] | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // State for resizable divider
  const [primaryRatio, setPrimaryRatio] = useState(defaultPrimaryRatio)
  const [histogramWidth, setHistogramWidth] = useState(280)
  const [histogramHeight, setHistogramHeight] = useState(160)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingDivider = useRef(false)
  const isDraggingHistogramX = useRef(false)
  const isDraggingHistogramY = useRef(false)
  const startY = useRef(0)
  const startX = useRef(0)
  const startRatio = useRef(0)
  const startWidth = useRef(0)
  const startHeight = useRef(0)

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
      // Dynamic domain for Z-scores: fit actual data + ±3 control limits
      const zValues = data_points
        .filter((p) => p.z_score != null)
        .map((p) => p.z_score!)
      if (zValues.length === 0) return [-4, 4]

      const allZLimits = [...zValues, 3, -3]
      const zMin = Math.min(...allZLimits)
      const zMax = Math.max(...allZLimits)
      const zPadding = (zMax - zMin) * 0.1
      return [zMin - zPadding, zMax + zPadding]
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

  // Handle horizontal histogram resize (width)
  const handleHistogramMouseDownX = useCallback((e: React.MouseEvent) => {
    isDraggingHistogramX.current = true
    startX.current = e.clientX
    startWidth.current = histogramWidth
    e.preventDefault()
  }, [histogramWidth])

  // Handle vertical histogram resize (height for below position)
  const handleHistogramMouseDownY = useCallback((e: React.MouseEvent) => {
    isDraggingHistogramY.current = true
    startY.current = e.clientY
    startHeight.current = histogramHeight
    e.preventDefault()
  }, [histogramHeight])

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

      if (isDraggingHistogramX.current) {
        const delta = startX.current - e.clientX
        const newWidth = Math.min(Math.max(startWidth.current + delta, 200), 500)
        setHistogramWidth(newWidth)
      }

      if (isDraggingHistogramY.current) {
        const delta = startY.current - e.clientY
        const newHeight = Math.min(Math.max(startHeight.current + delta, 100), 300)
        setHistogramHeight(newHeight)
      }
    }

    const handleMouseUp = () => {
      isDraggingDivider.current = false
      isDraggingHistogramX.current = false
      isDraggingHistogramY.current = false
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
            yAxisDomain={showHistogram ? yAxisDomain : undefined}
            onHoverValue={showHistogram ? setHoveredValue : undefined}
            highlightedRange={hoveredBinRange}
            onPointAnnotation={onPointAnnotation}
          />
        </div>
        {showHistogram && (
          <div
            className={cn('flex-shrink-0 relative', isRightPosition ? 'h-full' : 'w-full')}
            style={isRightPosition ? { width: histogramWidth } : { height: 192 }}
          >
            {isRightPosition && (
              <div
                onMouseDown={handleHistogramMouseDownX}
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

  // Dual chart layout - histogram aligns ONLY with primary chart
  return (
    <div
      ref={containerRef}
      className={cn('h-full flex flex-col', className)}
    >
      {/* Primary Chart Row: X-bar + Histogram (aligned) */}
      <div
        className="flex gap-2"
        style={{ height: `calc(${primaryRatio * 100}% - 6px)` }}
      >
        {/* Primary Chart (X-bar or Individuals) */}
        <div className="flex-1 min-w-0 h-full">
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
          />
        </div>

        {/* Vertical Histogram - aligned with primary chart only */}
        {isRightPosition && showHistogram && (
          <div
            className="flex-shrink-0 relative h-full"
            style={{ width: histogramWidth }}
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleHistogramMouseDownX}
              className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize z-10 group"
              title="Drag to resize"
            >
              <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-16 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
            </div>
            <DistributionHistogram
              characteristicId={characteristicId}
              orientation="vertical"
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

      {/* Resizable divider between primary and secondary */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="h-3 flex items-center justify-center cursor-ns-resize group flex-shrink-0"
        title="Drag to resize charts"
      >
        <div className="w-16 h-1 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
      </div>

      {/* Secondary Chart Row: Range/S/MR (no histogram) */}
      <div
        className="flex-1 min-h-0"
        style={{ height: `calc(${(1 - primaryRatio) * 100}% - 6px)` }}
      >
        <RangeChart
          characteristicId={characteristicId}
          chartOptions={chartOptions}
          chartType={secondaryChartType}
          colorScheme={colorScheme}
          onHoverIndex={setHoveredIndex}
          highlightedIndex={hoveredIndex}
        />
      </div>

      {/* Horizontal Histogram - below both charts */}
      {isBelowPosition && showHistogram && (
        <div
          className="flex-shrink-0 relative w-full"
          style={{ height: histogramHeight }}
        >
          {/* Resize handle */}
          <div
            onMouseDown={handleHistogramMouseDownY}
            className="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-10 group"
            title="Drag to resize"
          >
            <div className="absolute top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-16 bg-border rounded-full group-hover:bg-primary/50 transition-colors" />
          </div>
          <DistributionHistogram
            characteristicId={characteristicId}
            orientation="horizontal"
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

export default DualChartPanel
