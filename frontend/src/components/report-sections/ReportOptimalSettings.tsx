import { useDOEAnalysis, useDOEStudy } from '@/api/hooks/doe'
import { Target } from 'lucide-react'

interface ReportOptimalSettingsProps {
  studyId?: number
}

// Extended type to account for regression data the API returns
// but the base DOEAnalysis type doesn't yet include
interface RegressionData {
  optimal_settings?: Record<string, number> | null
}

export function ReportOptimalSettings({ studyId }: ReportOptimalSettingsProps) {
  const { data: analysis } = useDOEAnalysis(studyId ?? 0)
  const { data: study } = useDOEStudy(studyId ?? 0)

  if (!analysis || !study) return null

  const regression = (analysis as { regression?: RegressionData | null }).regression
  const optimalSettings = regression?.optimal_settings

  if (!optimalSettings || Object.keys(optimalSettings).length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Target className="h-5 w-5" />
          Optimal Settings
        </h2>
        <p className="text-muted-foreground text-sm">
          No response surface model available. Optimal settings require a Central Composite or
          Box-Behnken design with sufficient data.
        </p>
      </div>
    )
  }

  // Build a lookup from factor name to factor details
  const factorMap = new Map(study.factors.map((f) => [f.name, f]))

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Target className="h-5 w-5" />
        Optimal Settings
      </h2>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-left">
            <th className="pb-2 font-medium">Factor</th>
            <th className="pb-2 text-right font-medium">Optimal Level</th>
            <th className="pb-2 text-right font-medium">Low</th>
            <th className="pb-2 text-right font-medium">High</th>
            <th className="pb-2 text-right font-medium">Unit</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(optimalSettings).map(([name, value]) => {
            const factor = factorMap.get(name)
            return (
              <tr key={name} className="border-border/50 border-b">
                <td className="py-2 font-medium">{name}</td>
                <td className="text-primary py-2 text-right font-mono font-bold">
                  {value.toFixed(4)}
                </td>
                <td className="text-muted-foreground py-2 text-right font-mono">
                  {factor?.low_level.toFixed(4) ?? '—'}
                </td>
                <td className="text-muted-foreground py-2 text-right font-mono">
                  {factor?.high_level.toFixed(4) ?? '—'}
                </td>
                <td className="text-muted-foreground py-2 text-right">
                  {factor?.unit ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
