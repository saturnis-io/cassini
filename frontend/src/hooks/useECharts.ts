/**
 * useECharts - Reusable hook for managing ECharts instances in React.
 *
 * Handles:
 * - Instance creation and disposal
 * - Responsive resize via ResizeObserver
 * - Reactive option updates (setOption on dependency changes)
 * - Theme color reactivity (re-applies options when colors change)
 * - Mouse event bridging (ECharts events → React callbacks)
 */

import { useRef, useEffect, useCallback } from 'react'
import { init } from '@/lib/echarts'
import type { EChartsType } from 'echarts/core'

/** Flexible option type - ECharts setOption accepts any object */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EChartsOptionInput = Record<string, any> | null

export interface UseEChartsOptions {
  /** ECharts option to render. When this changes, setOption is called. */
  option: EChartsOptionInput
  /** If true, merge with existing option (default). If false, replace entirely. */
  notMerge?: boolean
  /** Event handlers to attach to the chart instance */
  onMouseMove?: (params: EChartsMouseEvent) => void
  onMouseOut?: () => void
  onClick?: (params: EChartsMouseEvent) => void
  /** Called once the chart instance is ready */
  onInit?: (chart: EChartsType) => void
}

export interface EChartsMouseEvent {
  /** Index of the data point in the series data array */
  dataIndex: number
  /** The data item */
  data: Record<string, unknown>
  /** Series index */
  seriesIndex: number
  /** Series name */
  seriesName: string
  /** Component type */
  componentType: string
  /** Event from echarts */
  event?: { offsetX: number; offsetY: number }
}

export function useECharts({
  option,
  notMerge = false,
  onMouseMove,
  onMouseOut,
  onClick,
  onInit,
}: UseEChartsOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // Store callbacks in refs to avoid re-attaching event listeners
  const onMouseMoveRef = useRef(onMouseMove)
  onMouseMoveRef.current = onMouseMove
  const onMouseOutRef = useRef(onMouseOut)
  onMouseOutRef.current = onMouseOut
  const onClickRef = useRef(onClick)
  onClickRef.current = onClick

  // Initialize chart instance
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = init(container, undefined, { renderer: 'canvas' })
    chartRef.current = chart

    // Bridge ECharts events to React callbacks
    chart.on('mouseover', 'series', (params: unknown) => {
      onMouseMoveRef.current?.(params as EChartsMouseEvent)
    })
    chart.on('mouseout', 'series', () => {
      onMouseOutRef.current?.()
    })
    chart.on('click', 'series', (params: unknown) => {
      onClickRef.current?.(params as EChartsMouseEvent)
    })

    // Global mouseout for when cursor leaves chart area entirely
    chart.getZr().on('globalout', () => {
      onMouseOutRef.current?.()
    })

    onInit?.(chart)

    // ResizeObserver for responsive sizing
    resizeObserverRef.current = new ResizeObserver(() => {
      // Use requestAnimationFrame to batch resize calls
      requestAnimationFrame(() => {
        chart.resize()
      })
    })
    resizeObserverRef.current.observe(container)

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      chart.dispose()
      chartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init only once
  }, [])

  // Apply option when it changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !option) return
    chart.setOption(option, { notMerge })
  }, [option, notMerge])

  // Expose manual refresh for theme changes
  const refresh = useCallback(() => {
    const chart = chartRef.current
    if (!chart || !option) return
    chart.setOption(option, { notMerge: true })
  }, [option])

  return {
    /** Attach this ref to the container div */
    containerRef,
    /** Access to the raw ECharts instance (use sparingly) */
    chartRef,
    /** Force re-apply the current option (e.g., on theme change) */
    refresh,
  }
}
