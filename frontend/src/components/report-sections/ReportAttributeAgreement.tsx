import { useMSAResults } from '@/api/hooks/msa'
import { AttributeMSAResults } from '@/components/msa/AttributeMSAResults'
import { Users } from 'lucide-react'
import type { AttributeMSAResult } from '@/api/types'

interface ReportAttributeAgreementProps {
  studyId?: number
}

export function ReportAttributeAgreement({ studyId }: ReportAttributeAgreementProps) {
  const { data: results, isLoading, isError } = useMSAResults(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Users className="h-5 w-5" />
          Attribute Agreement Analysis
        </h2>
        <p className="text-muted-foreground text-sm">Loading results...</p>
      </div>
    )
  }

  // Not an attribute study — let ReportGageRR handle it
  if (!isLoading && results && !('fleiss_kappa' in results)) return null

  if (isError || !results || !('fleiss_kappa' in results)) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5" />
        Attribute Agreement Analysis
      </h2>
      <AttributeMSAResults result={results as AttributeMSAResult} studyId={studyId} />
    </div>
  )
}
