import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { formatDisplayKey } from '@/lib/display-key'
import { NELSON_RULES } from './ViolationLegend'
import { Explainable } from '@/components/Explainable'
import { X, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Data point type matching the shape used by ControlChart. */
export interface ChartPoint {
  index: number
  sample_id: number
  mean: number
  displayValue: number
  displayKey: string
  hasViolation: boolean
  allAcknowledged: boolean
  violationRules: number[]
  unacknowledgedViolationIds: number[]
  excluded: boolean
  timestamp: string
  timestampMs: number
  timestampLabel: string
  actual_n: number
  is_undersized: boolean
  effective_ucl: number | null
  effective_lcl: number | null
  z_score: number | null
  metadata?: Record<string, unknown> | null
}

/** Persistent click-to-stay tooltip with Explainable metric values. */
export function PinnedChartTooltip({
  point,
  screenX,
  screenY,
  characteristicId,
  controlLimits,
  shortRunMode,
  isModeA,
  isModeB,
  decimalPrecision,
  onViewSample,
  onClose,
}: {
  point: ChartPoint
  screenX: number
  screenY: number
  characteristicId: number
  controlLimits: { ucl: number | null; lcl: number | null; center_line: number | null }
  shortRunMode: string | null
  isModeA: boolean
  isModeB: boolean
  decimalPrecision: number
  onViewSample?: (sampleId: number) => void
  onClose: () => void
}) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: screenX + 14, y: screenY - 14 })

  const fmt = (v: number | null | undefined) => {
    if (v == null) return 'N/A'
    return v.toFixed(decimalPrecision)
  }

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!tooltipRef.current) return
    const rect = tooltipRef.current.getBoundingClientRect()
    let x = screenX + 14
    let y = screenY - 14
    if (x + rect.width > window.innerWidth - 8) x = screenX - rect.width - 14
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
    if (y < 8) y = 8
    if (x < 8) x = 8
    setPos({ x, y })
  }, [screenX, screenY])

  // Click-outside + Escape to dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose()
      }
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

  // Build the value label based on chart mode
  let valueLabel: string
  let valueDisplay: number
  if (isModeA) {
    valueLabel = 'Z-Score'
    valueDisplay = point.z_score ?? point.mean
  } else if (shortRunMode === 'deviation') {
    valueLabel = 'Deviation'
    valueDisplay = point.mean
  } else if (shortRunMode === 'standardized') {
    valueLabel = 'Z-Value'
    valueDisplay = point.mean
  } else {
    valueLabel = 'Value'
    valueDisplay = point.displayValue ?? point.mean
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className="bg-popover text-popover-foreground border-border fixed z-[55] min-w-[200px] max-w-[280px] rounded-lg border shadow-lg"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold">
          Sample {formatDisplayKey(point.displayKey)}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground -mr-1 rounded p-0.5 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5 px-3 py-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">n</span>
          <span className="tabular-nums">{point.actual_n}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">{valueLabel}</span>
          <span className="font-medium tabular-nums">{fmt(valueDisplay)}</span>
        </div>

        {/* Control limits — with Explainable */}
        {!isModeB && controlLimits.ucl != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">UCL</span>
            <Explainable
              metric="ucl"
              resourceId={characteristicId}
              resourceType="control-limits"
            >
              <span className="tabular-nums">{fmt(controlLimits.ucl)}</span>
            </Explainable>
          </div>
        )}

        {/* Per-point limits for variable-limits mode */}
        {isModeB && point.effective_ucl != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">UCL</span>
            <span className="tabular-nums">{fmt(point.effective_ucl)}</span>
          </div>
        )}

        {!isModeB && controlLimits.center_line != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">CL</span>
            <Explainable
              metric="center_line"
              resourceId={characteristicId}
              resourceType="control-limits"
            >
              <span className="tabular-nums">{fmt(controlLimits.center_line)}</span>
            </Explainable>
          </div>
        )}

        {!isModeB && controlLimits.lcl != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">LCL</span>
            <Explainable
              metric="lcl"
              resourceId={characteristicId}
              resourceType="control-limits"
            >
              <span className="tabular-nums">{fmt(controlLimits.lcl)}</span>
            </Explainable>
          </div>
        )}

        {isModeB && point.effective_lcl != null && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">LCL</span>
            <span className="tabular-nums">{fmt(point.effective_lcl)}</span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-muted-foreground">Time</span>
          <span className="text-muted-foreground">{point.timestampLabel}</span>
        </div>

        {point.is_undersized && (
          <div className="text-warning text-[11px] font-medium">Undersized sample</div>
        )}

        {/* Violations */}
        {point.hasViolation && point.violationRules.length > 0 && (
          <div className="border-border mt-1 border-t pt-1.5">
            <div
              className={cn(
                'mb-1 text-[11px] font-medium',
                point.allAcknowledged ? 'text-muted-foreground' : 'text-destructive',
              )}
            >
              {point.allAcknowledged ? 'Violations (acknowledged):' : 'Violations:'}
            </div>
            {point.violationRules.map((ruleId) => (
              <div key={ruleId} className="text-muted-foreground text-[11px]">
                {ruleId}: {NELSON_RULES[ruleId]?.name || `Rule ${ruleId}`}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — View Sample action */}
      {onViewSample && (
        <div className="border-border border-t px-3 py-2">
          <button
            onClick={() => onViewSample(point.sample_id)}
            className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View Sample Details
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
