import { cn } from '@/lib/utils'

/**
 * Visual comparison of specification and control limits on a single number line,
 * with process capability indices (Cp, Cpk) when both are defined.
 */
export function LimitVisualization({
  lsl,
  usl,
  target,
  lcl,
  ucl,
  centerLine,
  sigma,
}: {
  lsl: number | null
  usl: number | null
  target: number | null
  lcl: number | null
  ucl: number | null
  centerLine: number | null
  sigma: number | null
}) {
  const hasSpec = lsl !== null && usl !== null
  const hasControl = lcl !== null && ucl !== null
  const hasBoth = hasSpec && hasControl

  // Derive sigma and center line from control limits when stored values aren't available
  // Standard 3-sigma control charts: UCL = X̄ + 3σ, LCL = X̄ - 3σ
  const effectiveCenterLine = centerLine ?? (hasControl ? (ucl! + lcl!) / 2 : null)
  const effectiveSigma = sigma ?? (hasControl ? (ucl! - lcl!) / 6 : null)

  // Nothing to visualize
  if (!hasSpec && !hasControl) {
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        Set specification or control limits to see the visualization.
      </div>
    )
  }

  // Capability indices
  const cp =
    hasSpec && effectiveSigma && effectiveSigma > 0 ? (usl! - lsl!) / (6 * effectiveSigma) : null

  const cpk =
    hasSpec && effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
      ? Math.min(
          (usl! - effectiveCenterLine) / (3 * effectiveSigma),
          (effectiveCenterLine - lsl!) / (3 * effectiveSigma),
        )
      : null

  // Compute the overall range for the number line - pad 10% on each side
  const allValues: number[] = []
  if (lsl !== null) allValues.push(lsl)
  if (usl !== null) allValues.push(usl)
  if (lcl !== null) allValues.push(lcl)
  if (ucl !== null) allValues.push(ucl)
  if (target !== null) allValues.push(target)
  if (effectiveCenterLine !== null) allValues.push(effectiveCenterLine)

  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const span = maxVal - minVal || 1
  const pad = span * 0.12
  const rangeMin = minVal - pad
  const rangeMax = maxVal + pad
  const totalRange = rangeMax - rangeMin

  const toPercent = (v: number) => ((v - rangeMin) / totalRange) * 100

  // Zone boundaries (±1σ, ±2σ from center line)
  const zones =
    effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
      ? {
          minus2: effectiveCenterLine - 2 * effectiveSigma,
          minus1: effectiveCenterLine - effectiveSigma,
          plus1: effectiveCenterLine + effectiveSigma,
          plus2: effectiveCenterLine + 2 * effectiveSigma,
        }
      : null

  return (
    <div className="space-y-4">
      {/* Capability indices */}
      {(cp !== null || cpk !== null) && (
        <div className="flex items-center gap-3">
          {cp !== null && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
                cp >= 1.33
                  ? 'bg-success/10 text-success'
                  : cp >= 1.0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="text-muted-foreground font-normal">Cp</span>
              <span className="font-mono">{cp.toFixed(2)}</span>
            </div>
          )}
          {cpk !== null && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
                cpk >= 1.33
                  ? 'bg-success/10 text-success'
                  : cpk >= 1.0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="text-muted-foreground font-normal">Cpk</span>
              <span className="font-mono">{cpk.toFixed(2)}</span>
            </div>
          )}
          <span className="text-muted-foreground text-xs">
            {cpk !== null && cpk >= 1.33
              ? 'Capable'
              : cpk !== null && cpk >= 1.0
                ? 'Marginal'
                : cpk !== null
                  ? 'Not capable'
                  : ''}
          </span>
        </div>
      )}

      {/* Combined number line */}
      <div className="relative pt-2 pb-16">
        {/* Track background */}
        <div className="bg-muted/40 border-border relative h-10 overflow-hidden rounded border">
          {/* Spec limit band (green) */}
          {hasSpec && (
            <div
              className="border-success/30 bg-success/10 absolute inset-y-0 border-x"
              style={{
                left: `${toPercent(lsl!)}%`,
                width: `${toPercent(usl!) - toPercent(lsl!)}%`,
              }}
            />
          )}

          {/* Zone shading (±1σ, ±2σ) */}
          {zones && (
            <>
              {/* ±2σ zone */}
              <div
                className="bg-primary/5 absolute inset-y-0"
                style={{
                  left: `${Math.max(0, toPercent(zones.minus2))}%`,
                  width: `${Math.min(100, toPercent(zones.plus2)) - Math.max(0, toPercent(zones.minus2))}%`,
                }}
              />
              {/* ±1σ zone */}
              <div
                className="bg-primary/8 absolute inset-y-0"
                style={{
                  left: `${Math.max(0, toPercent(zones.minus1))}%`,
                  width: `${Math.min(100, toPercent(zones.plus1)) - Math.max(0, toPercent(zones.minus1))}%`,
                }}
              />
            </>
          )}

          {/* Control limit band outline (blue dashed) */}
          {hasControl && (
            <div
              className="border-primary/50 absolute inset-y-0 border-x-2 border-dashed"
              style={{
                left: `${toPercent(lcl!)}%`,
                width: `${toPercent(ucl!) - toPercent(lcl!)}%`,
              }}
            />
          )}

          {/* LSL marker */}
          {lsl !== null && (
            <div
              className="bg-destructive absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(lsl)}%` }}
            />
          )}

          {/* USL marker */}
          {usl !== null && (
            <div
              className="bg-destructive absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(usl)}%` }}
            />
          )}

          {/* LCL marker */}
          {lcl !== null && (
            <div
              className="bg-primary absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(lcl)}%` }}
            />
          )}

          {/* UCL marker */}
          {ucl !== null && (
            <div
              className="bg-primary absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(ucl)}%` }}
            />
          )}

          {/* Target marker */}
          {target !== null && (
            <div
              className="bg-success absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(target)}%` }}
            />
          )}

          {/* Center line marker */}
          {effectiveCenterLine !== null && (
            <div
              className="border-primary absolute top-0 bottom-0 w-0.5 border-l border-dashed"
              style={{ left: `${toPercent(effectiveCenterLine)}%` }}
            />
          )}
        </div>

        {/* Row 1 labels: Spec limits (LSL, TGT, USL) — just below track */}
        {lsl !== null && (
          <div
            className="text-destructive absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(lsl)}%`, top: '3.25rem' }}
          >
            LSL
            <br />
            {lsl}
          </div>
        )}
        {target !== null && (
          <div
            className="text-success absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(target)}%`, top: '3.25rem' }}
          >
            TGT
            <br />
            {target}
          </div>
        )}
        {usl !== null && (
          <div
            className="text-destructive absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(usl)}%`, top: '3.25rem' }}
          >
            USL
            <br />
            {usl}
          </div>
        )}

        {/* Row 2 labels: Control limits (LCL, X̄, UCL) — offset below row 1 */}
        {lcl !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(lcl)}%`, top: '5.25rem' }}
          >
            LCL
            <br />
            {lcl.toFixed(2)}
          </div>
        )}
        {effectiveCenterLine !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(effectiveCenterLine)}%`, top: '5.25rem' }}
          >
            X̄
            <br />
            {effectiveCenterLine.toFixed(2)}
          </div>
        )}
        {ucl !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(ucl)}%`, top: '5.25rem' }}
          >
            UCL
            <br />
            {ucl.toFixed(2)}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {hasSpec && (
          <span className="flex items-center gap-1.5">
            <span className="bg-destructive inline-block h-2 w-3 rounded-sm" />
            Spec Limits
          </span>
        )}
        {hasControl && (
          <span className="flex items-center gap-1.5">
            <span className="bg-primary inline-block h-2 w-3 rounded-sm" />
            Control Limits
          </span>
        )}
        {target !== null && (
          <span className="flex items-center gap-1.5">
            <span className="bg-success inline-block h-0.5 w-3" />
            Target
          </span>
        )}
        {effectiveCenterLine !== null && (
          <span className="flex items-center gap-1.5">
            <span className="border-primary inline-block h-0.5 w-3 border-t border-dashed" />
            Center Line
          </span>
        )}
        {zones && (
          <span className="flex items-center gap-1.5">
            <span className="bg-primary/15 inline-block h-2 w-3 rounded-sm" />
            Sigma Zones
          </span>
        )}
      </div>

      {/* Capability explanation */}
      {hasBoth && cp !== null && (
        <div className="text-muted-foreground border-border space-y-1 border-t pt-3 text-xs">
          <p>
            <strong>Cp</strong> measures potential capability (spread vs spec width). Cp {'>'}= 1.33
            is generally acceptable.
          </p>
          <p>
            <strong>Cpk</strong> measures actual capability (accounts for centering). Cpk {'<'} Cp
            indicates the process is off-center.
          </p>
        </div>
      )}
    </div>
  )
}
