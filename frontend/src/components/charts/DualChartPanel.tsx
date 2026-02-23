/**
 * DualChartPanel - Renders synchronized dual control charts.
 * Used for X-bar/Range, X-bar/S, and I-MR chart combinations.
 *
 * Layout: The histogram (when positioned right) aligns with the primary chart.
 * A summary stats panel of matching width sits beside the secondary chart
 * so both rows share the same column widths.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { calculateSharedYAxisDomain } from '@/lib/chart-domain'
import { ControlChart } from '@/components/ControlChart'
import { DistributionHistogram } from '@/components/DistributionHistogram'
import { RangeChart } from './RangeChart'
import { useChartData } from '@/api/hooks'
import { SPC_CONSTANTS, getSPCConstant } from '@/types/charts'
import type { ChartTypeId } from '@/types/charts'
import type { HistogramPosition } from '@/stores/dashboardStore'
import type { RegionSelection } from '@/components/RegionActionModal'

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
  /** Callback when a region is drag-selected on the chart */
  onRegionSelect?: (info: RegionSelection) => void
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
  onRegionSelect,
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

  // Shared domain keeps histogram + control chart Y-axes aligned
  const yAxisDomain = useMemo(
    () => calculateSharedYAxisDomain(chartData, showSpecLimits),
    [chartData, showSpecLimits],
  )

  // Compute secondary chart summary stats (for the side panel)
  const secondaryStats = useMemo(() => {
    if (!secondaryChartType || !chartData?.data_points?.length) return null

    const points = chartData.data_points
    const n = chartData.nominal_subgroup_size

    let values: number[] = []
    let label = ''
    let symbol = ''

    if (secondaryChartType === 'range') {
      values = points.map((p) => p.range ?? 0).filter((v) => v > 0)
      label = 'Range'
      symbol = 'R̄'
    } else if (secondaryChartType === 'stddev') {
      values = points.map((p) => p.std_dev ?? 0).filter((v) => v > 0)
      label = 'Std Dev'
      symbol = 'S̄'
    } else if (secondaryChartType === 'mr') {
      for (let i = 1; i < points.length; i++) {
        values.push(Math.abs(points[i].mean - points[i - 1].mean))
      }
      label = 'Moving Range'
      symbol = 'MR'
    }

    if (values.length === 0) return null

    const mean = values.reduce((s, v) => s + v, 0) / values.length
    let ucl: number | null = null
    let lcl: number | null = null

    if (secondaryChartType === 'range') {
      const D3 = getSPCConstant(SPC_CONSTANTS.D3, n) ?? 0
      const D4 = getSPCConstant(SPC_CONSTANTS.D4, n) ?? 3.267
      ucl = D4 * mean
      lcl = D3 * mean
    } else if (secondaryChartType === 'stddev') {
      const B3 = getSPCConstant(SPC_CONSTANTS.B3, n) ?? 0
      const B4 = getSPCConstant(SPC_CONSTANTS.B4, n) ?? 3.267
      ucl = B4 * mean
      lcl = B3 * mean
    } else if (secondaryChartType === 'mr') {
      ucl = 3.267 * mean
      lcl = 0
    }

    const max = Math.max(...values)
    const min = Math.min(...values)

    return { label, symbol, mean, ucl, lcl, max, min, count: values.length }
  }, [chartData, secondaryChartType])

  // Handle vertical divider drag (between primary and secondary charts)
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingDivider.current = true
      startY.current = e.clientY
      startRatio.current = primaryRatio
      e.preventDefault()
    },
    [primaryRatio],
  )

  // Handle horizontal histogram resize (width)
  const handleHistogramMouseDownX = useCallback(
    (e: React.MouseEvent) => {
      isDraggingHistogramX.current = true
      startX.current = e.clientX
      startWidth.current = histogramWidth
      e.preventDefault()
    },
    [histogramWidth],
  )

  // Handle vertical histogram resize (height for below position)
  const handleHistogramMouseDownY = useCallback(
    (e: React.MouseEvent) => {
      isDraggingHistogramY.current = true
      startY.current = e.clientY
      startHeight.current = histogramHeight
      e.preventDefault()
    },
    [histogramHeight],
  )

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
      <div
        className={cn('flex h-full', isRightPosition ? 'flex-row gap-2' : 'flex-col', className)}
      >
        <div className={cn(isRightPosition ? 'min-w-0 flex-1' : 'min-h-0 flex-1')}>
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
          />
        </div>
        {showHistogram && (
          <div
            className={cn('relative flex-shrink-0', isRightPosition ? 'h-full' : 'w-full')}
            style={isRightPosition ? { width: histogramWidth } : { height: 192 }}
          >
            {isRightPosition && (
              <div
                onMouseDown={handleHistogramMouseDownX}
                className="group absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize"
                title="Drag to resize"
              >
                <div className="bg-border group-hover:bg-primary/50 absolute top-1/2 left-0.5 h-16 w-0.5 -translate-y-1/2 rounded-full transition-colors" />
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
    <div ref={containerRef} className={cn('flex h-full flex-col', className)}>
      {/* Primary Chart Row: X-bar + Histogram (aligned) */}
      <div className="flex gap-2" style={{ height: `calc(${primaryRatio * 100}% - 6px)` }}>
        {/* Primary Chart (X-bar or Individuals) */}
        <div className="h-full min-w-0 flex-1">
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
          />
        </div>

        {/* Vertical Histogram - aligned with primary chart only */}
        {isRightPosition && showHistogram && (
          <div className="relative h-full flex-shrink-0" style={{ width: histogramWidth }}>
            {/* Resize handle */}
            <div
              onMouseDown={handleHistogramMouseDownX}
              className="group absolute top-0 bottom-0 -left-1 z-10 w-2 cursor-ew-resize"
              title="Drag to resize"
            >
              <div className="bg-border group-hover:bg-primary/50 absolute top-1/2 left-0.5 h-16 w-0.5 -translate-y-1/2 rounded-full transition-colors" />
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
        className="group flex h-3 flex-shrink-0 cursor-ns-resize items-center justify-center"
        title="Drag to resize charts"
      >
        <div className="bg-border group-hover:bg-primary/50 h-1 w-16 rounded-full transition-colors" />
      </div>

      {/* Secondary Chart Row: Range/S/MR + stats panel (aligned with histogram) */}
      <div
        className="flex min-h-0 flex-1 gap-2"
        style={{ height: `calc(${(1 - primaryRatio) * 100}% - 6px)` }}
      >
        <div className="h-full min-w-0 flex-1">
          <RangeChart
            characteristicId={characteristicId}
            chartOptions={chartOptions}
            chartType={secondaryChartType}
            colorScheme={colorScheme}
            onHoverIndex={setHoveredIndex}
            highlightedIndex={hoveredIndex}
          />
        </div>

        {/* Stats panel — matches histogram width for alignment */}
        {isRightPosition && showHistogram && (
          <div className="h-full flex-shrink-0" style={{ width: histogramWidth }}>
            {secondaryStats && (
              <div className="border-border bg-card flex h-full flex-col justify-center overflow-hidden rounded-2xl border px-4 py-3">
                <div className="text-muted-foreground mb-3 truncate text-[10px] tracking-wider uppercase">
                  {secondaryStats.label} Summary
                </div>

                {/* Center line — hero value */}
                <div className="mb-3 text-center">
                  <div className="text-muted-foreground mb-0.5 text-[10px]">
                    {secondaryStats.symbol}
                  </div>
                  <div className="text-foreground font-mono text-lg font-semibold tabular-nums">
                    {secondaryStats.mean.toFixed(3)}
                  </div>
                </div>

                {/* Control limits */}
                <div className="space-y-1.5 text-xs tabular-nums">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="border-destructive/60 w-3 border-t-2 border-dashed" />
                      UCL
                    </span>
                    <span className="text-destructive/80 font-mono">
                      {secondaryStats.ucl?.toFixed(3) ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <span className="border-destructive/60 w-3 border-t-2 border-dashed" />
                      LCL
                    </span>
                    <span className="text-destructive/80 font-mono">
                      {secondaryStats.lcl?.toFixed(3) ?? '—'}
                    </span>
                  </div>
                </div>

                <div className="border-border my-2.5 border-t" />

                {/* Observed range */}
                <div className="space-y-1.5 text-xs tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Max</span>
                    <span className="font-mono">{secondaryStats.max.toFixed(3)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Min</span>
                    <span className="font-mono">{secondaryStats.min.toFixed(3)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Samples</span>
                    <span className="font-mono">{secondaryStats.count}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Horizontal Histogram - below both charts */}
      {isBelowPosition && showHistogram && (
        <div className="relative w-full flex-shrink-0" style={{ height: histogramHeight }}>
          {/* Resize handle */}
          <div
            onMouseDown={handleHistogramMouseDownY}
            className="group absolute -top-1 right-0 left-0 z-10 h-2 cursor-ns-resize"
            title="Drag to resize"
          >
            <div className="bg-border group-hover:bg-primary/50 absolute top-0.5 left-1/2 h-0.5 w-16 -translate-x-1/2 rounded-full transition-colors" />
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
