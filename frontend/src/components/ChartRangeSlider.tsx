/**
 * ChartRangeSlider - Custom dual-handle range slider for chart viewport windowing.
 *
 * Renders a minimap sparkline of all data points with a draggable range selection
 * window. Users can drag the window, resize handles, or click to reposition.
 * The selected range is stored in dashboardStore.rangeWindow.
 *
 * Features:
 * - Time labels when xAxisMode is 'timestamp'
 * - Gray sparkline outside selection, accent color inside
 */

import { useCallback, useRef, useMemo, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'

interface ChartRangeSliderProps {
  /** Total number of data points */
  totalPoints: number
  /** Values to render as sparkline minimap */
  values: number[]
  /** Optional: labels for the range (e.g., sample numbers or timestamps) */
  labels?: string[]
  /** Optional: ISO timestamp strings for each data point, used for time labels */
  timestamps?: string[]
}

/**
 * Format a timestamp string for display in the range slider.
 * Uses the configured datetime format when the range spans multiple days,
 * short time-only (HH:mm) otherwise.
 */
function formatSliderTimestamp(
  isoString: string,
  spanMs: number,
  dtFormat: string,
  timeOnlyFormat: string,
): string {
  const date = new Date(isoString)
  if (spanMs > 86400000) {
    return applyFormat(date, dtFormat)
  }
  return applyFormat(date, timeOnlyFormat)
}

export function ChartRangeSlider({
  totalPoints,
  values,
  labels,
  timestamps,
}: ChartRangeSliderProps) {
  const { datetimeFormat, axisFormats } = useDateFormat()
  const { rangeWindow, setRangeWindow } = useDashboardStore()
  const xAxisMode = useDashboardStore((state) => state.xAxisMode)
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<'left' | 'right' | 'window' | null>(null)
  const dragStart = useRef({ x: 0, startVal: 0, endVal: 0 })
  const wasDraggingRef = useRef(false)

  // Default window: show all
  const start = rangeWindow?.[0] ?? 0
  const end = rangeWindow?.[1] ?? totalPoints - 1
  const windowSize = end - start + 1

  // Compute sparkline path
  const sparkline = useMemo(() => {
    if (values.length === 0) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const h = 28 // sparkline height in px
    const points = values.map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * 100
      const y = h - ((v - min) / range) * (h - 4) - 2
      return `${x},${y}`
    })
    return `M ${points.join(' L ')}`
  }, [values])

  // Convert pixel position to data index
  const pxToIndex = useCallback(
    (px: number): number => {
      if (!trackRef.current) return 0
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (px - rect.left) / rect.width))
      return Math.round(ratio * (totalPoints - 1))
    },
    [totalPoints],
  )

  // Mouse/pointer handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, type: 'left' | 'right' | 'window') => {
      e.preventDefault()
      e.stopPropagation()
        ; (e.target as HTMLElement).setPointerCapture(e.pointerId)
      setDragging(type)
      dragStart.current = { x: e.clientX, startVal: start, endVal: end }
    },
    [start, end],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !trackRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const pxDelta = e.clientX - dragStart.current.x
      const indexDelta = Math.round((pxDelta / rect.width) * (totalPoints - 1))

      if (dragging === 'left') {
        const newStart = Math.max(
          0,
          Math.min(dragStart.current.startVal + indexDelta, dragStart.current.endVal - 1),
        )
        setRangeWindow([newStart, dragStart.current.endVal])
      } else if (dragging === 'right') {
        const newEnd = Math.min(
          totalPoints - 1,
          Math.max(dragStart.current.endVal + indexDelta, dragStart.current.startVal + 1),
        )
        setRangeWindow([dragStart.current.startVal, newEnd])
      } else if (dragging === 'window') {
        const span = dragStart.current.endVal - dragStart.current.startVal
        let newStart = dragStart.current.startVal + indexDelta
        let newEnd = newStart + span
        if (newStart < 0) {
          newStart = 0
          newEnd = span
        }
        if (newEnd > totalPoints - 1) {
          newEnd = totalPoints - 1
          newStart = newEnd - span
        }
        setRangeWindow([newStart, newEnd])
      }
    },
    [dragging, totalPoints, setRangeWindow],
  )

  const handlePointerUp = useCallback(() => {
    if (dragging) wasDraggingRef.current = true
    setDragging(null)
  }, [dragging])

  // Click on track to reposition window
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) return
      // Suppress click that fires after a drag release (click event bubbles after pointerup)
      if (wasDraggingRef.current) {
        wasDraggingRef.current = false
        return
      }
      const clickIndex = pxToIndex(e.clientX)
      const halfWindow = Math.floor(windowSize / 2)
      let newStart = clickIndex - halfWindow
      let newEnd = newStart + windowSize - 1
      if (newStart < 0) {
        newStart = 0
        newEnd = windowSize - 1
      }
      if (newEnd > totalPoints - 1) {
        newEnd = totalPoints - 1
        newStart = Math.max(0, newEnd - windowSize + 1)
      }
      setRangeWindow([newStart, newEnd])
    },
    [dragging, pxToIndex, windowSize, totalPoints, setRangeWindow],
  )

  // Track previous total points to detect when new data arrives
  const prevTotalRef = useRef(totalPoints)

  // Auto-advance or clamp when total points change
  useEffect(() => {
    const prevTotal = prevTotalRef.current
    prevTotalRef.current = totalPoints

    if (!rangeWindow) return

    const [wStart, wEnd] = rangeWindow
    const currentWindowSize = wEnd - wStart + 1

    if (totalPoints > prevTotal) {
      // Data grew. If the user was scrolled all the way to the right edge,
      // auto-slide the window forward to reveal the new data points.
      if (wEnd >= prevTotal - 1) {
        setRangeWindow([Math.max(0, totalPoints - currentWindowSize), totalPoints - 1])
      }
    } else if (wEnd >= totalPoints) {
      // Data shrank or window is invalidly large, clamp it
      setRangeWindow([Math.max(0, totalPoints - currentWindowSize), totalPoints - 1])
    }
    // Intentionally omitting rangeWindow from dependencies so manual slider drags don't trigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPoints])

  // Compute positions as percentages
  const leftPct = (start / Math.max(totalPoints - 1, 1)) * 100
  const rightPct = (end / Math.max(totalPoints - 1, 1)) * 100
  const widthPct = rightPct - leftPct

  // Range labels: use timestamps when xAxisMode is 'timestamp' and timestamps are provided
  const isTimestampMode = xAxisMode === 'timestamp' && timestamps && timestamps.length > 0
  const { startLabel, endLabel } = useMemo(() => {
    if (isTimestampMode && timestamps) {
      const startTs = timestamps[start]
      const endTs = timestamps[end]
      if (startTs && endTs) {
        const spanMs = new Date(endTs).getTime() - new Date(startTs).getTime()
        return {
          startLabel: formatSliderTimestamp(startTs, spanMs, datetimeFormat, axisFormats.timeOnly),
          endLabel: formatSliderTimestamp(endTs, spanMs, datetimeFormat, axisFormats.timeOnly),
        }
      }
    }
    return {
      startLabel: labels?.[start] ?? `#${start + 1}`,
      endLabel: labels?.[end] ?? `#${end + 1}`,
    }
  }, [isTimestampMode, timestamps, labels, start, end, datetimeFormat, axisFormats])

  return (
    <div className="w-full select-none">
      {/* Info row */}
      <div className="text-muted-foreground mb-1 flex items-center justify-between px-1 text-[10px]">
        <span>{startLabel}</span>
        <span className="text-foreground/70 font-medium">
          {windowSize} of {totalPoints} samples
        </span>
        <span>{endLabel}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="bg-muted/50 border-border relative h-8 cursor-pointer overflow-hidden rounded-md border"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Full sparkline in gray (background for unselected regions) */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 100 28`}
          preserveAspectRatio="none"
        >
          <path
            d={sparkline}
            fill="none"
            stroke="var(--color-muted-foreground)"
            strokeWidth="1"
            strokeOpacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Dimmed regions outside selection */}
        <div
          className="bg-background/40 absolute inset-y-0 left-0"
          style={{ width: `${leftPct}%` }}
        />
        <div
          className="bg-background/40 absolute inset-y-0 right-0"
          style={{ width: `${100 - rightPct}%` }}
        />

        {/* Selected window */}
        <div
          className={cn(
            'border-primary bg-primary/15 absolute inset-y-0 border-x-2',
            dragging === 'window' ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'window')}
        >
          {/* Sparkline highlight in selected region - accent color */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`${leftPct} 0 ${Math.max(widthPct, 0.5)} 28`}
            preserveAspectRatio="none"
          >
            <path
              d={sparkline}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.5"
              strokeOpacity="0.85"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Left handle */}
        <div
          className={cn(
            'group absolute inset-y-0 z-10 -ml-1.5 flex w-3 cursor-ew-resize items-center justify-center',
          )}
          style={{ left: `${leftPct}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'left')}
        >
          <div
            className={cn(
              'h-4 w-1.5 rounded-full transition-colors',
              dragging === 'left' ? 'bg-primary' : 'bg-primary/70 group-hover:bg-primary',
            )}
          />
        </div>

        {/* Right handle */}
        <div
          className={cn(
            'group absolute inset-y-0 z-10 -ml-1.5 flex w-3 cursor-ew-resize items-center justify-center',
          )}
          style={{ left: `${rightPct}%` }}
          onPointerDown={(e) => handlePointerDown(e, 'right')}
        >
          <div
            className={cn(
              'h-4 w-1.5 rounded-full transition-colors',
              dragging === 'right' ? 'bg-primary' : 'bg-primary/70 group-hover:bg-primary',
            )}
          />
        </div>
      </div>
    </div>
  )
}
