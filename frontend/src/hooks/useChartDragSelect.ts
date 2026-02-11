/**
 * useChartDragSelect — Drag-to-select region on ECharts.
 *
 * Lets the user click-and-drag a horizontal selection rectangle on the chart
 * to select a range of data points. Uses ECharts' `convertFromPixel` for accurate
 * pixel-to-data-index mapping across both category and timestamp axes.
 *
 * Returns the current drag rectangle for rendering a visual overlay.
 * Calls `onSelect` directly when the drag completes (avoids stale closures).
 */

import { useState, useEffect, useRef } from 'react'
import type { EChartsType } from 'echarts/core'

interface DragRect {
  left: number
  width: number
}

export interface DragSelection {
  startIndex: number  // 0-based in data array
  endIndex: number    // 0-based in data array
}

/**
 * @param chartRef   Ref to the ECharts instance (from useECharts)
 * @param wrapperRef Ref to the wrapper div covering the chart area
 * @param data       Full data array (needs .timestampMs for timestamp mode)
 * @param isTimestamp Whether xAxis is in timestamp mode
 * @param onSelect   Called with the resolved selection when a drag completes
 */
export function useChartDragSelect(
  chartRef: React.RefObject<EChartsType | null>,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  data: { timestampMs: number }[],
  isTimestamp: boolean,
  onSelect?: (selection: DragSelection) => void,
): { dragRect: DragRect | null } {
  const [dragRect, setDragRect] = useState<DragRect | null>(null)
  const dragStartRef = useRef<{ x: number; containerLeft: number } | null>(null)

  // Keep mutable refs so the window event listeners always see latest values
  const dataRef = useRef(data)
  dataRef.current = data
  const isTimestampRef = useRef(isTimestamp)
  isTimestampRef.current = isTimestamp
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const MIN_DRAG_PX = 20 // minimum horizontal drag distance to trigger selection

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return // left-click only
      const chart = chartRef.current
      if (!chart) return

      const rect = wrapper.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top

      // Only start drag if click is within the chart's grid (plot) area
      // containPixel returns false for axis labels, margins, etc.
      if (!chart.containPixel('grid', [localX, localY])) return

      dragStartRef.current = { x: e.clientX, containerLeft: rect.left }
    }

    const onMouseMove = (e: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return
      const dx = Math.abs(e.clientX - start.x)
      if (dx > MIN_DRAG_PX) {
        const left = Math.min(e.clientX, start.x) - start.containerLeft
        setDragRect({ left, width: dx })
      } else {
        setDragRect(null) // clear rectangle if drag shrinks below threshold
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      const start = dragStartRef.current
      dragStartRef.current = null
      setDragRect(null)

      if (!start) return
      if (Math.abs(e.clientX - start.x) < MIN_DRAG_PX) return // too small — treat as click

      const chart = chartRef.current
      const currentData = dataRef.current
      if (!chart || !currentData.length) return

      const leftPx = Math.min(e.clientX, start.x) - start.containerLeft
      const rightPx = Math.max(e.clientX, start.x) - start.containerLeft

      try {
        // Use 'grid' finder — {xAxisIndex:0} returns NaN in ECharts 6
        const leftCoord = chart.convertFromPixel('grid', [leftPx, 0])
        const rightCoord = chart.convertFromPixel('grid', [rightPx, 0])
        if (!leftCoord || !rightCoord) return
        const leftX = Array.isArray(leftCoord) ? leftCoord[0] : leftCoord
        const rightX = Array.isArray(rightCoord) ? rightCoord[0] : rightCoord
        if (leftX == null || rightX == null || isNaN(leftX) || isNaN(rightX)) return

        let startIndex: number
        let endIndex: number

        if (isTimestampRef.current) {
          startIndex = 0
          for (let i = 0; i < currentData.length; i++) {
            if (currentData[i].timestampMs >= leftX) { startIndex = i; break }
          }
          endIndex = currentData.length - 1
          for (let i = currentData.length - 1; i >= 0; i--) {
            if (currentData[i].timestampMs <= rightX) { endIndex = i; break }
          }
        } else {
          startIndex = Math.max(0, Math.round(leftX))
          endIndex = Math.min(currentData.length - 1, Math.round(rightX))
        }

        if (startIndex >= endIndex) return

        onSelectRef.current?.({ startIndex, endIndex })
      } catch {
        // convertFromPixel can fail if chart isn't fully initialized
      }
    }

    wrapper.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      wrapper.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [chartRef, wrapperRef])

  return { dragRect }
}
