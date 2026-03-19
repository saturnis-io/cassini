import { cn } from '@/lib/utils'
import type { NelsonSeverity } from '@/lib/nelson-rules'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionId = 'measurements' | 'violations' | 'annotations' | 'history' | 'insights'

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

export function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  badgeColor,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  badge?: number
  badgeColor?: 'red' | 'amber' | 'blue'
}) {
  const badgeStyles = {
    red: 'bg-destructive/20 text-destructive',
    amber: 'bg-warning/20 text-warning',
    blue: 'bg-primary/20 text-primary',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary border-primary border-r-2 font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && (
        <span
          className={cn(
            'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-medium',
            badgeStyles[badgeColor ?? 'blue'],
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── MetaItem ─────────────────────────────────────────────────────────────────

export function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div>
        <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</div>
        <div className="text-foreground">{value}</div>
      </div>
    </div>
  )
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

export function StatusChip({
  color,
  label,
}: {
  color: 'red' | 'green' | 'amber' | 'muted'
  label: string
}) {
  const styles = {
    red: 'bg-destructive/15 text-destructive border-destructive/30',
    green: 'bg-success/15 text-success border-success/30',
    amber: 'bg-warning/15 text-warning border-warning/30',
    muted: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        styles[color],
      )}
    >
      {label}
    </span>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 border-border rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</div>
      <div className="font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}

// ─── MiniBarChart ─────────────────────────────────────────────────────────────

export function MiniBarChart({
  values,
  min,
  max,
  mean,
  precision,
}: {
  values: number[]
  min: number
  max: number
  mean: number
  precision: number
}) {
  const range = max - min || 1
  const barHeights = values.map((v) => ((v - min) / range) * 100)
  const meanPct = ((mean - min) / range) * 100

  return (
    <div className="border-border rounded-lg border p-3">
      <div className="text-muted-foreground mb-2 text-[10px] tracking-wider uppercase">
        Distribution
      </div>
      <div className="h-[88px] pt-6">
        <div className="relative flex h-full items-end gap-1">
          {barHeights.map((h, idx) => (
            <div
              key={idx}
              className="bg-primary/60 hover:bg-primary/80 group relative flex-1 rounded-t-sm transition-all"
              style={{ height: `${Math.max(h, 4)}%` }}
            >
              <div className="bg-popover border-border absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                {(values[idx] ?? 0).toFixed(precision)}
              </div>
            </div>
          ))}
          {/* Mean line */}
          <div
            className="border-warning/60 absolute right-0 left-0 border-t-2 border-dashed"
            style={{ bottom: `${meanPct}%` }}
          />
        </div>
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between font-mono text-[10px]">
        <span>M1</span>
        <span className="text-warning">x̄ = {mean.toFixed(precision)}</span>
        <span>M{values.length}</span>
      </div>
    </div>
  )
}

// ─── SeverityBadge ────────────────────────────────────────────────────────────

export function SeverityBadge({ severity }: { severity: NelsonSeverity | string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-destructive/15 text-destructive border-destructive/30',
    WARNING: 'bg-warning/15 text-warning border-warning/30',
    INFO: 'bg-primary/15 text-primary border-primary/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        styles[severity] ?? 'bg-muted text-muted-foreground border-border',
      )}
    >
      {severity}
    </span>
  )
}

// ─── Zone color helper ────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function getZoneColor(zone: string | undefined): { bg: string; text: string; label: string } {
  switch (zone) {
    case 'A+':
    case 'A-':
    case 'beyond':
      return { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Zone A' }
    case 'B+':
    case 'B-':
      return { bg: 'bg-warning/15', text: 'text-warning', label: 'Zone B' }
    case 'C+':
    case 'C-':
      return { bg: 'bg-success/15', text: 'text-success', label: 'Zone C' }
    default:
      return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Unknown' }
  }
}

// ─── getMeasurementValues helper ──────────────────────────────────────────────

import type { Sample } from '@/types'

/**
 * Extract measurement values from a sample.
 * The API returns `measurements` as `number[]` (flat) but the TS type
 * declares `Measurement[]` (objects). Handle both shapes at runtime.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getMeasurementValues(sample: Sample): number[] {
  if (!sample.measurements || sample.measurements.length === 0) return []
  const first = sample.measurements[0]
  if (typeof first === 'number') {
    return sample.measurements as unknown as number[]
  }
  return (sample.measurements as unknown as { value: number; sequence: number }[])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((m) => m.value ?? 0)
}
