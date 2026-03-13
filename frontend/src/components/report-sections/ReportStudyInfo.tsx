import { useMSAStudy } from '@/api/hooks/msa'
import { Ruler } from 'lucide-react'

const STUDY_TYPE_LABELS: Record<string, string> = {
  crossed_anova: 'Crossed ANOVA',
  nested_anova: 'Nested ANOVA',
  range_method: 'Range Method',
  attribute_agreement: 'Attribute Agreement',
}

const STATUS_LABELS: Record<string, string> = {
  setup: 'Setup',
  data_entry: 'Data Entry',
  completed: 'Completed',
}

interface ReportStudyInfoProps {
  studyId?: number
}

export function ReportStudyInfo({ studyId }: ReportStudyInfoProps) {
  const { data: study, isLoading } = useMSAStudy(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Ruler className="h-5 w-5" />
          Study Information
        </h2>
        <p className="text-muted-foreground text-sm">Loading study data...</p>
      </div>
    )
  }

  if (!study) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Ruler className="h-5 w-5" />
        Study Information
      </h2>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <InfoCell label="Study Name" value={study.name} />
        <InfoCell
          label="Study Type"
          value={STUDY_TYPE_LABELS[study.study_type] ?? study.study_type}
        />
        <InfoCell
          label="Status"
          value={STATUS_LABELS[study.status] ?? study.status}
        />
        <InfoCell label="Operators" value={String(study.num_operators)} />
        <InfoCell label="Parts" value={String(study.num_parts)} />
        <InfoCell label="Replicates" value={String(study.num_replicates)} />
        {study.tolerance != null && (
          <InfoCell label="Tolerance" value={study.tolerance.toFixed(4)} />
        )}
      </div>

      {study.operators.length > 0 && (
        <div className="mt-4">
          <span className="text-muted-foreground text-xs">Operators:</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {study.operators.map((op) => (
              <span
                key={op.id}
                className="bg-muted/50 rounded px-2 py-0.5 text-xs font-medium"
              >
                {op.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}
