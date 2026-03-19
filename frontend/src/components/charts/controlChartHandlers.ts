/**
 * controlChartHandlers — Factory functions for ControlChart ECharts event handlers.
 *
 * Extracted from ControlChart.tsx to reduce component file size. These are pure
 * callback factories with no React hooks — the component passes refs/callbacks in.
 */

import type { EChartsMouseEvent, EChartsDataZoomEvent } from '@/hooks/useECharts'
import type { DragSelection } from '@/hooks/useChartDragSelect'
import type { ChartPoint } from '@/components/PinnedChartTooltip'
import type { RegionSelection } from '@/components/RegionActionModal'
import type { Annotation } from '@/types'
import type { EChartsType } from 'echarts/core'
import { useDashboardStore } from '@/stores/dashboardStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartEventHandlerDeps {
  /** Ref to the current data array (updated on each render) */
  dataRef: React.RefObject<ChartPoint[]>
  /** Ref tracking which series index is the data-point custom series */
  dataPointSeriesIndexRef: React.RefObject<number>
  /** Ref tracking which series index is the annotation marker series */
  annotationSeriesIndexRef: React.RefObject<number>
  /** Ref to annotation IDs parallel to annotation marker dataIndex */
  annotationMarkerIdsRef: React.RefObject<number[]>
  /** Ref to the current annotations array */
  annotationsRef: React.RefObject<Annotation[] | undefined>
  /** Ref to the chart wrapper div (for screen-position calculations) */
  chartWrapperRef: React.RefObject<HTMLDivElement | null>
  /** Ref to the ECharts instance */
  chartRef: React.RefObject<EChartsType | null>
  /** Cross-chart hover sync: notify sample hover */
  onHoverSample: (sampleId: number) => void
  /** Cross-chart hover sync: notify hover leave */
  onLeaveSample: () => void
  /** Optional callback for hover value (histogram sync) */
  onHoverValue?: (value: number | null) => void
  /** Setter for active annotation popover */
  setActiveAnnotation: (ann: Annotation | null) => void
  /** Setter for annotation popover screen position */
  setAnnotationPopoverPos: (pos: { x: number; y: number }) => void
  /** Setter for pinned tooltip state */
  setPinnedPoint: (pt: { point: ChartPoint; screenX: number; screenY: number } | null) => void
  /** Zustand setter for rangeWindow */
  setRangeWindow: (rw: [number, number] | null) => void
}

// ---------------------------------------------------------------------------
// Event handler factory
// ---------------------------------------------------------------------------

export interface ChartEventHandlers {
  handleMouseMove: (params: EChartsMouseEvent) => void
  handleMouseOut: () => void
  handleClick: (params: EChartsMouseEvent) => void
  handleDataZoom: (params: EChartsDataZoomEvent) => void
}

/**
 * Build ECharts event handler callbacks for the control chart.
 *
 * These are meant to be wrapped in `useCallback` by the component — the factory
 * itself is a plain function with no hook dependencies.
 */
export function buildChartEventHandlers(deps: ChartEventHandlerDeps): ChartEventHandlers {
  const {
    dataRef,
    dataPointSeriesIndexRef,
    annotationSeriesIndexRef,
    annotationMarkerIdsRef,
    annotationsRef,
    chartWrapperRef,
    chartRef,
    onHoverSample,
    onLeaveSample,
    onHoverValue,
    setActiveAnnotation,
    setAnnotationPopoverPos,
    setPinnedPoint,
    setRangeWindow,
  } = deps

  const handleMouseMove = (params: EChartsMouseEvent) => {
    // Only trigger hover for data point series — ignore line, limit, and annotation series
    if (params.seriesIndex != null && params.seriesIndex !== dataPointSeriesIndexRef.current) return
    const idx = params.dataIndex
    const point = dataRef.current[idx]
    if (point) {
      onHoverSample(point.sample_id)
      onHoverValue?.(point.displayValue ?? point.mean)
    }
  }

  const handleMouseOut = () => {
    onLeaveSample()
    onHoverValue?.(null)
  }

  const handleClick = (params: EChartsMouseEvent) => {
    // Annotation marker click
    if (params.seriesIndex === annotationSeriesIndexRef.current && annotationsRef.current) {
      const annId = annotationMarkerIdsRef.current[params.dataIndex]
      if (annId != null) {
        const ann = (annotationsRef.current as Annotation[]).find((a) => a.id === annId)
        if (ann && chartWrapperRef.current) {
          const rect = chartWrapperRef.current.getBoundingClientRect()
          setAnnotationPopoverPos({
            x: rect.left + (params.event?.offsetX ?? 0),
            y: rect.top + (params.event?.offsetY ?? 0),
          })
          setActiveAnnotation(ann)
          return
        }
      }
    }
    // Data point click — show pinned tooltip with Explainable values
    const pointData = params.data as unknown as number[]
    const dataIndex = pointData?.[2]
    const chartPoint = dataRef.current[dataIndex]
    if (chartPoint && chartWrapperRef.current) {
      const rect = chartWrapperRef.current.getBoundingClientRect()
      setPinnedPoint({
        point: chartPoint,
        screenX: rect.left + (params.event?.offsetX ?? 0),
        screenY: rect.top + (params.event?.offsetY ?? 0),
      })
      // Hide native ECharts tooltip when pinned tooltip opens
      chartRef.current?.dispatchAction({ type: 'hideTip' })
    }
  }

  const handleDataZoom = (params: EChartsDataZoomEvent) => {
    const totalPoints = dataRef.current.length
    if (totalPoints <= 1) return

    const newStart = Math.round((params.start / 100) * (totalPoints - 1))
    const newEnd = Math.round((params.end / 100) * (totalPoints - 1))

    // Zoomed all the way out -> clear range
    if (newStart <= 0 && newEnd >= totalPoints - 1) {
      setRangeWindow(null)
      return
    }

    // Auto-enable showBrush + set range atomically
    const store = useDashboardStore.getState()
    if (!store.showBrush) {
      useDashboardStore.setState({ showBrush: true, rangeWindow: [newStart, newEnd] })
    } else {
      setRangeWindow([newStart, newEnd])
    }
  }

  return { handleMouseMove, handleMouseOut, handleClick, handleDataZoom }
}

// ---------------------------------------------------------------------------
// Drag-select handler factory
// ---------------------------------------------------------------------------

export interface DragSelectHandlerDeps {
  data: ChartPoint[]
  onRegionSelect?: (info: RegionSelection) => void
}

/**
 * Build the drag-select completion handler that maps pixel-range indices
 * to a RegionSelection payload for the parent component.
 */
export function buildDragSelectHandler(
  deps: DragSelectHandlerDeps,
): (sel: DragSelection) => void {
  const { data, onRegionSelect } = deps

  return (sel: DragSelection) => {
    if (!onRegionSelect || !data.length) return
    const slice = data.slice(sel.startIndex, sel.endIndex + 1)
    if (!slice.length) return

    onRegionSelect({
      startTime: new Date(slice[0].timestampMs).toISOString(),
      endTime: new Date(slice[slice.length - 1].timestampMs).toISOString(),
      startDisplayKey: slice[0].displayKey,
      endDisplayKey: slice[slice.length - 1].displayKey,
      sampleCount: slice.length,
      violationIds: slice.flatMap((p) => p.unacknowledgedViolationIds),
    })
  }
}
