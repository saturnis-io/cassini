import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatDisplayKey } from '@/lib/display-key'

export interface BoxPlotData {
  sampleId: number
  index: number
  displayKey: string
  timestamp: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  whiskerLow: number
  whiskerHigh: number
  outliers: number[]
  count: number
  mean: number
}

/** Pinned tooltip — click a box to keep the tooltip open. */
export function PinnedBoxTooltip({
  box,
  screenX,
  screenY,
  formatValue,
  formatDateTime,
  centerLineColor,
  violationColor,
  onClose,
  onViewSample,
}: {
  box: BoxPlotData
  screenX: number
  screenY: number
  formatValue: (v: number) => string
  formatDateTime: (ts: string) => string
  centerLineColor: string
  violationColor: string
  onClose: () => void
  onViewSample?: (sampleId: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: screenX + 14, y: screenY - 14 })

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    let x = screenX + 14
    let y = screenY - 14
    if (x + rect.width > window.innerWidth - 8) x = screenX - rect.width - 14
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
    if (y < 8) y = 8
    if (x < 8) x = 8
    setPos({ x, y })
  }, [screenX, screenY])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="bg-popover text-popover-foreground border-border fixed z-[55] min-w-[200px] max-w-[260px] rounded-lg border shadow-lg"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">Sample {formatDisplayKey(box.displayKey)}</span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground -mr-1 rounded p-0.5 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs">
        <div className="text-muted-foreground mb-1.5 text-[11px]">
          {formatDateTime(box.timestamp)}
        </div>
        {([
          ['Max', box.max, undefined],
          ['Q3', box.q3, undefined],
          ['Median', box.median, 'font-medium'],
          ['Mean', box.mean, undefined, centerLineColor],
          ['Q1', box.q1, undefined],
          ['Min', box.min, undefined],
          ['IQR', box.q3 - box.q1, undefined],
          ['n', box.count, undefined],
        ] as [string, number, string?, string?][]).map(([label, value, cls, color]) => (
          <div key={label} className="flex justify-between">
            <span className="text-muted-foreground">{label}</span>
            <span className={`tabular-nums ${cls ?? ''}`} style={color ? { color } : undefined}>
              {label === 'n' ? value : formatValue(value)}
            </span>
          </div>
        ))}
        {box.outliers.length > 0 && (
          <div className="flex justify-between">
            <span style={{ color: violationColor }}>Outliers</span>
            <span className="tabular-nums" style={{ color: violationColor }}>
              {box.outliers.length}
            </span>
          </div>
        )}
      </div>
      {onViewSample && (
        <div className="border-border border-t px-3 py-2">
          <button
            onClick={() => {
              onClose()
              onViewSample(box.sampleId)
            }}
            className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium transition-colors"
          >
            View Sample Details
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
