import { useDOEStudy, useDOERuns } from '@/api/hooks/doe'
import { FlaskConical } from 'lucide-react'

const DESIGN_LABELS: Record<string, string> = {
  full_factorial: 'Full Factorial',
  fractional_factorial: 'Fractional Factorial',
  central_composite: 'Central Composite',
  box_behnken: 'Box-Behnken',
}

interface ReportStudySetupProps {
  studyId?: number
}

export function ReportStudySetup({ studyId }: ReportStudySetupProps) {
  const { data: study } = useDOEStudy(studyId ?? 0)
  const { data: runs } = useDOERuns(studyId ?? 0)

  if (!study) return null

  const completedRuns = runs?.filter((r) => r.response_value != null).length ?? 0
  const totalRuns = runs?.length ?? study.run_count

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="h-5 w-5" />
        Study Setup
      </h2>

      <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground text-xs font-medium">Study Name</div>
          <div className="mt-1 font-medium">{study.name}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground text-xs font-medium">Design Type</div>
          <div className="mt-1 font-medium">
            {DESIGN_LABELS[study.design_type] ?? study.design_type}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground text-xs font-medium">Response Variable</div>
          <div className="mt-1 font-medium">
            {study.response_name ?? 'Response'}
            {study.response_unit ? ` (${study.response_unit})` : ''}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground text-xs font-medium">Runs</div>
          <div className="mt-1 font-mono font-medium">
            {completedRuns}/{totalRuns} completed
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="text-muted-foreground text-xs font-medium">Status</div>
          <div className="mt-1 font-medium capitalize">{study.status}</div>
        </div>
      </div>

      {study.factors.length > 0 && (
        <div>
          <h3 className="text-muted-foreground mb-2 text-sm font-medium">Factors</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Low Level</th>
                <th className="pb-2 font-medium">High Level</th>
                <th className="pb-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {study.factors.map((factor) => (
                <tr key={factor.name} className="border-border/50 border-b">
                  <td className="py-2 font-medium">{factor.name}</td>
                  <td className="py-2 font-mono">{factor.low_level}</td>
                  <td className="py-2 font-mono">{factor.high_level}</td>
                  <td className="text-muted-foreground py-2">{factor.unit ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
