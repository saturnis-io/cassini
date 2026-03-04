import { cn } from '@/lib/utils'
import type { Characteristic, CapabilityResult } from '@/types'

function cpkColor(cpk: number | null): string {
  if (cpk == null) return 'text-muted-foreground'
  if (cpk >= 1.33) return 'text-success'
  if (cpk >= 1.0) return 'text-warning'
  return 'text-destructive'
}

function cpkBorderColor(cpk: number | null): string {
  if (cpk == null) return 'border-border'
  if (cpk >= 1.33) return 'border-success/40'
  if (cpk >= 1.0) return 'border-warning/40'
  return 'border-destructive/40'
}

function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null) return '--'
  return v.toFixed(decimals)
}

interface PlanetOverlayProps {
  char: Characteristic
  capability: CapabilityResult | null
  hierarchyPath?: string | null
}

export function PlanetOverlay({ char, capability, hierarchyPath }: PlanetOverlayProps) {
  const cpk = capability?.cpk ?? char.latest_cpk ?? null
  const inControl = char.in_control !== false

  // Capability basis: how many measurements were used
  const capSampleCount = capability?.sample_count ?? null

  return (
    <div
      className={cn(
        // Design system: card surface with blur
        'rounded-lg border bg-card/90 shadow-md backdrop-blur-md',
        cpkBorderColor(cpk),
      )}
    >
      {/* Breadcrumb path */}
      {hierarchyPath && (
        <div className="border-b border-border px-4 py-1.5">
          <span className="text-xs leading-tight text-muted-foreground">
            {hierarchyPath}
          </span>
        </div>
      )}
      {/* Horizontal layout: name | capabilities | limits | specs | footer */}
      <div className="flex items-stretch divide-x divide-border">
        {/* Name + status */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <div
            className={cn(
              'h-2.5 w-2.5 shrink-0 rounded-full',
              inControl
                ? 'bg-success shadow-[0_0_6px_color-mix(in_srgb,var(--color-success)_60%,transparent)]'
                : 'bg-destructive shadow-[0_0_6px_color-mix(in_srgb,var(--color-destructive)_60%,transparent)]',
            )}
          />
          <div className="flex flex-col">
            <span className="max-w-[280px] truncate text-sm font-semibold text-foreground">
              {char.name}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {char.data_type === 'attribute' ? 'Attribute' : 'Variable'}
              {char.sample_count != null && ` \u00B7 n=${char.sample_count}`}
            </span>
          </div>
        </div>

        {/* Capability metrics */}
        <div className="flex flex-col justify-center px-4 py-2">
          <div className="grid grid-cols-2 gap-x-5 gap-y-0">
            <MetricRow label="Cpk" value={fmt(cpk, 2)} color={cpkColor(cpk)} />
            <MetricRow
              label="Cp"
              value={fmt(capability?.cp ?? char.latest_cp ?? null, 2)}
              color={cpkColor(capability?.cp ?? null)}
            />
            <MetricRow
              label="Ppk"
              value={fmt(capability?.ppk ?? null, 2)}
              color={cpkColor(capability?.ppk ?? null)}
            />
            <MetricRow
              label="Pp"
              value={fmt(capability?.pp ?? null, 2)}
              color={cpkColor(capability?.pp ?? null)}
            />
          </div>
          {capSampleCount != null && (
            <span className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
              Based on {capSampleCount.toLocaleString()} measurement{capSampleCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Control limits */}
        {(char.ucl != null ||
          char.stored_center_line != null ||
          char.lcl != null) && (
          <div className="flex flex-col justify-center gap-0 px-4 py-2">
            <MetricRow label="UCL" value={fmt(char.ucl, 2)} color="text-destructive" />
            <MetricRow
              label="CL"
              value={fmt(char.stored_center_line, 2)}
              color="text-muted-foreground"
            />
            <MetricRow label="LCL" value={fmt(char.lcl, 2)} color="text-blue-400" />
          </div>
        )}

        {/* Spec limits */}
        {(char.usl != null || char.lsl != null || char.target_value != null) && (
          <div className="flex flex-col justify-center gap-0 px-4 py-2">
            <MetricRow label="USL" value={fmt(char.usl, 2)} color="text-foreground/80" />
            {char.target_value != null && (
              <MetricRow label="Tgt" value={fmt(char.target_value, 2)} color="text-muted-foreground" />
            )}
            <MetricRow label="LSL" value={fmt(char.lsl, 2)} color="text-foreground/80" />
          </div>
        )}

        {/* Sigma + alerts */}
        <div className="flex flex-col items-center justify-center gap-1 px-4 py-2">
          {char.stored_sigma != null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {'\u03C3'} {fmt(char.stored_sigma, 3)}
            </span>
          )}
          {(char.unacknowledged_violations ?? 0) > 0 && (
            <span className="stat-badge stat-badge-danger text-[10px] font-medium">
              {char.unacknowledged_violations} alert
              {char.unacknowledged_violations !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', color)}>{value}</span>
    </div>
  )
}
