import { TrendingUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCapability } from '@/api/hooks'

interface ReportCapabilityEvidenceProps {
  characteristicId?: number
}

export function ReportCapabilityEvidence({
  characteristicId,
}: ReportCapabilityEvidenceProps) {
  const { data: capability, isLoading, error } = useCapability(characteristicId ?? 0)

  if (!characteristicId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="h-5 w-5" />
          Capability Evidence
        </h2>
        <p className="text-muted-foreground text-sm">Loading capability data...</p>
      </div>
    )
  }

  if (error || !capability) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <TrendingUp className="h-5 w-5" />
          Capability Evidence
        </h2>
        <p className="text-muted-foreground text-sm">
          Capability metrics require specification limits (USL/LSL) to be defined.
        </p>
      </div>
    )
  }

  const { cp, cpk, pp, ppk, cpm, sigma_within, sample_count, usl, lsl } = capability

  const metrics: Array<{ label: string; value: number | null }> = [
    { label: 'Cp', value: cp },
    { label: 'Cpk', value: cpk },
    { label: 'Pp', value: pp },
    { label: 'Ppk', value: ppk },
  ]

  // Only include Cpm if the API returned it
  if (cpm != null) {
    metrics.push({ label: 'Cpm', value: cpm })
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <TrendingUp className="h-5 w-5" />
        Capability Evidence
      </h2>
      <table className="w-full text-sm">
        <thead className="border-b">
          <tr>
            <th className="py-2 text-left">Metric</th>
            <th className="py-2 text-right">Value</th>
            <th className="py-2 text-right">Threshold</th>
            <th className="py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const status = getStatus(m.value)
            return (
              <tr key={m.label} className="border-border/50 border-b">
                <td className="py-2 font-medium">{m.label}</td>
                <td className="py-2 text-right font-mono">
                  {m.value != null ? m.value.toFixed(2) : '-'}
                </td>
                <td className="text-muted-foreground py-2 text-right">{'\u2265'}1.33</td>
                <td className="py-2 text-center">
                  <span className={cn('inline-flex items-center gap-1', status.color)}>
                    {status.icon}
                    <span className="text-xs">{status.text}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <InfoCell label={'\u03C3 Within'} value={sigma_within != null ? sigma_within.toFixed(4) : '-'} />
        <InfoCell label="Sample Count" value={String(sample_count ?? '-')} />
        <InfoCell label="USL" value={usl != null ? String(usl) : '-'} />
        <InfoCell label="LSL" value={lsl != null ? String(lsl) : '-'} />
      </div>
    </div>
  )
}

function getStatus(value: number | null) {
  if (value == null) {
    return {
      text: 'N/A',
      color: 'text-muted-foreground',
      icon: null,
    }
  }
  if (value >= 1.33) {
    return {
      text: 'Capable',
      color: 'text-success',
      icon: <CheckCircle2 className="h-4 w-4" />,
    }
  }
  if (value >= 1.0) {
    return {
      text: 'Marginal',
      color: 'text-warning',
      icon: <AlertTriangle className="h-4 w-4" />,
    }
  }
  return {
    text: 'Not Capable',
    color: 'text-destructive',
    icon: <XCircle className="h-4 w-4" />,
  }
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold">{value}</div>
    </div>
  )
}
