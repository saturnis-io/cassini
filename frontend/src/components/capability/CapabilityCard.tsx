import { useCapability, useCapabilityHistory, useSaveCapabilitySnapshot } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
import { useECharts } from '@/hooks/useECharts'
import type { CapabilityResult, CapabilityHistoryItem } from '@/types'
import { cn } from '@/lib/utils'
import { Camera, TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { useMemo } from 'react'

/** Threshold-based color coding for capability indices */
function capabilityColor(value: number | null): string {
  if (value === null) return 'text-muted-foreground'
  if (value >= 1.33) return 'text-success'
  if (value >= 1.0) return 'text-warning'
  return 'text-destructive'
}

function capabilityBg(value: number | null): string {
  if (value === null) return 'bg-muted/30'
  if (value >= 1.33) return 'bg-success/10'
  if (value >= 1.0) return 'bg-warning/10'
  return 'bg-destructive/10'
}

function capabilityLabel(value: number | null): string {
  if (value === null) return '--'
  if (value >= 1.33) return 'Capable'
  if (value >= 1.0) return 'Marginal'
  return 'Not Capable'
}

function IndexCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={cn('border-border rounded-lg border p-3 text-center', capabilityBg(value))}>
      <div className="text-muted-foreground mb-1 text-xs">{label}</div>
      <div className={cn('text-lg font-bold tabular-nums', capabilityColor(value))}>
        {value !== null ? value.toFixed(2) : '--'}
      </div>
      <div className={cn('mt-0.5 text-[10px]', capabilityColor(value))}>
        {capabilityLabel(value)}
      </div>
    </div>
  )
}

function NormalityBadge({ result }: { result: CapabilityResult }) {
  if (result.normality_test === 'failed') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Info className="h-3 w-3" />
        Normality: not tested
      </span>
    )
  }
  const pValue = result.normality_p_value
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        result.is_normal ? 'text-success' : 'text-warning',
      )}
    >
      {result.is_normal ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {result.is_normal ? 'Normal' : 'Non-normal'} (p={pValue?.toFixed(4) ?? '?'})
    </span>
  )
}

function CpkTrendChart({ history }: { history: CapabilityHistoryItem[] }) {
  // Reverse so oldest is first (history comes DESC)
  const sorted = useMemo(() => [...history].reverse(), [history])

  const option = useMemo(() => {
    if (sorted.length === 0) return null

    const dates = sorted.map((h) => {
      const d = new Date(h.calculated_at)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
    const cpkData = sorted.map((h) => h.cpk)
    const ppkData = sorted.map((h) => h.ppk)

    return {
      grid: { top: 20, right: 10, bottom: 24, left: 36 },
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 11 },
      },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: { fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9 },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
      },
      series: [
        {
          name: 'Cpk',
          type: 'line' as const,
          data: cpkData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2 },
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'Ppk',
          type: 'line' as const,
          data: ppkData,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 4,
          lineStyle: { width: 2, type: 'dashed' as const },
          itemStyle: { color: '#8b5cf6' },
        },
      ],
    }
  }, [sorted])

  const containerRef = useECharts({ option })

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
        No history snapshots yet
      </div>
    )
  }

  return <div ref={containerRef} className="h-32 w-full" />
}

interface CapabilityCardProps {
  characteristicId: number
}

export function CapabilityCard({ characteristicId }: CapabilityCardProps) {
  const { role } = useAuth()
  const { data: capability, isLoading, error } = useCapability(characteristicId)
  const { data: history } = useCapabilityHistory(characteristicId)
  const saveSnapshot = useSaveCapabilitySnapshot()

  const canSaveSnapshot = hasAccess(role, 'engineer')

  if (isLoading) {
    return (
      <div className="border-border bg-card rounded-xl border p-4">
        <div className="animate-pulse space-y-3">
          <div className="bg-muted h-4 w-1/3 rounded" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-muted h-16 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load'
    return (
      <div className="border-border bg-card rounded-xl border p-4">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Info className="h-4 w-4" />
          <span>{msg}</span>
        </div>
      </div>
    )
  }

  if (!capability) return null

  return (
    <div className="border-border bg-card overflow-hidden rounded-xl border">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-primary h-4 w-4" />
          <h3 className="text-sm font-semibold">Process Capability</h3>
          <span className="text-muted-foreground text-xs">
            ({capability.sample_count} measurements)
          </span>
        </div>
        {canSaveSnapshot && (
          <button
            onClick={() => saveSnapshot.mutate(characteristicId)}
            disabled={saveSnapshot.isPending}
            className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
          >
            <Camera className="h-3 w-3" />
            {saveSnapshot.isPending ? 'Saving...' : 'Save Snapshot'}
          </button>
        )}
      </div>

      {/* Index Cards */}
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-5 gap-3">
          <IndexCard label="Cp" value={capability.cp} />
          <IndexCard label="Cpk" value={capability.cpk} />
          <IndexCard label="Pp" value={capability.pp} />
          <IndexCard label="Ppk" value={capability.ppk} />
          <IndexCard label="Cpm" value={capability.cpm} />
        </div>

        {/* Normality + Specs */}
        <div className="flex items-center justify-between text-xs">
          <NormalityBadge result={capability} />
          <span className="text-muted-foreground">
            LSL: {capability.lsl ?? '--'} | Target: {capability.target ?? '--'} | USL:{' '}
            {capability.usl ?? '--'}
          </span>
        </div>

        {/* Cpk Trend Chart */}
        {history && history.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-medium">Cpk / Ppk Trend</div>
            <CpkTrendChart history={history} />
          </div>
        )}
      </div>
    </div>
  )
}
