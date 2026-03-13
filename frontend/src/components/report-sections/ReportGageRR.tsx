import { useMSAResults } from '@/api/hooks/msa'
import { MSAResults } from '@/components/msa/MSAResults'
import { Gauge } from 'lucide-react'
import type { GageRRResult } from '@/api/types'

interface ReportGageRRProps {
  studyId?: number
}

export function ReportGageRR({ studyId }: ReportGageRRProps) {
  const { data: results, isLoading, isError } = useMSAResults(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Gauge className="h-5 w-5" />
          Gage R&amp;R Results
        </h2>
        <p className="text-muted-foreground text-sm">Loading results...</p>
      </div>
    )
  }

  // Not a variable (Gage R&R) study — let ReportAttributeAgreement handle it
  if (!isLoading && results && !('repeatability_ev' in results)) return null

  if (isError || !results || !('repeatability_ev' in results)) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Gauge className="h-5 w-5" />
        Gage R&amp;R Results
      </h2>
      <MSAResults result={results as GageRRResult} studyId={studyId} />
    </div>
  )
}
