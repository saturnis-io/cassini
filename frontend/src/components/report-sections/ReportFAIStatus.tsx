import { usePlantContext } from '@/providers/PlantProvider'
import { useLicense } from '@/hooks/useLicense'
import { useFAIReports, useFAIReport } from '@/api/hooks'
import { ClipboardCheck, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReportFAIStatusProps {
  characteristicId?: number
}

export function ReportFAIStatus({ characteristicId }: ReportFAIStatusProps) {
  const { isEnterprise } = useLicense()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: reports, isLoading } = useFAIReports(
    isEnterprise ? { plant_id: plantId } : { plant_id: 0 },
  )

  if (!isEnterprise) return null
  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-5 w-5" />
          FAI Status
        </h2>
        <p className="text-muted-foreground text-sm">Loading FAI data...</p>
      </div>
    )
  }

  const MAX_REPORTS = 5
  const allReports = reports ?? []
  const displayReports = allReports.slice(0, MAX_REPORTS)
  const remaining = allReports.length - displayReports.length

  if (allReports.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-5 w-5" />
          FAI Status
        </h2>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <ClipboardCheck className="text-muted-foreground/40 h-8 w-8" />
          <p className="text-muted-foreground text-sm">No FAI reports found for this plant</p>
          <p className="text-muted-foreground/70 text-xs">
            Create an FAI report from the FAI module to see status here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="h-5 w-5" />
        FAI Status
      </h2>

      <div className="space-y-3">
        {displayReports.map((report) => (
          <FAIReportSummary
            key={report.id}
            reportId={report.id}
            partNumber={report.part_number}
            status={report.status}
            characteristicId={characteristicId}
          />
        ))}
        {remaining > 0 && (
          <p className="text-muted-foreground text-xs">
            +{remaining} more FAI {remaining === 1 ? 'report' : 'reports'} not shown
          </p>
        )}
      </div>
    </div>
  )
}

const STATUS_CONFIG = {
  draft: { icon: Clock, color: 'text-muted-foreground', label: 'Draft' },
  submitted: { icon: AlertTriangle, color: 'text-warning', label: 'Submitted' },
  approved: { icon: CheckCircle2, color: 'text-success', label: 'Approved' },
  rejected: { icon: XCircle, color: 'text-destructive', label: 'Rejected' },
} as const

function FAIReportSummary({
  reportId,
  partNumber,
  status,
  characteristicId,
}: {
  reportId: number
  partNumber: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  characteristicId?: number
}) {
  const { data: detail } = useFAIReport(reportId)

  const cfg = STATUS_CONFIG[status]
  const StatusIcon = cfg.icon

  // Wait for detail to load before filtering by characteristic
  const items = detail?.items ?? []
  const relevantItems = characteristicId
    ? items.filter((item) => item.characteristic_id === characteristicId)
    : items

  // If filtering by characteristic, don't render until detail has loaded
  if (characteristicId && !detail) return null

  // If filtering by characteristic and no items match, skip this report
  if (characteristicId && relevantItems.length === 0 && items.length > 0) {
    return null
  }

  const passCount = relevantItems.filter((i) => i.result === 'pass').length
  const failCount = relevantItems.filter((i) => i.result === 'fail').length
  const deviationCount = relevantItems.filter(
    (i) => i.deviation_reason != null && i.deviation_reason !== '',
  ).length

  return (
    <div className="bg-muted/30 rounded-md p-3">
      <div className="mb-2 flex items-center gap-2">
        <StatusIcon className={cn('h-4 w-4', cfg.color)} />
        <span className="text-sm font-medium">Part {partNumber}</span>
        <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
      </div>

      {relevantItems.length > 0 && (
        <div className="flex gap-4 text-xs">
          {passCount > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="text-success h-3 w-3" />
              <span>{passCount} pass</span>
            </div>
          )}
          {failCount > 0 && (
            <div className="flex items-center gap-1">
              <XCircle className="text-destructive h-3 w-3" />
              <span>{failCount} fail</span>
            </div>
          )}
          {deviationCount > 0 && (
            <div className="flex items-center gap-1">
              <AlertTriangle className="text-warning h-3 w-3" />
              <span>{deviationCount} deviation{deviationCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
