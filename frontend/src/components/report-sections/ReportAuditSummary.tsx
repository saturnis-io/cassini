import { Shield, FileText, Pen, Eye } from 'lucide-react'
import { useAuditLogs } from '@/api/hooks/admin'
import { usePlantContext } from '@/providers/PlantProvider'

interface ReportAuditSummaryProps {
  characteristicId?: number
  chartOptions?: { startDate?: string; endDate?: string }
}

export function ReportAuditSummary({
  chartOptions,
}: ReportAuditSummaryProps) {
  const { selectedPlant } = usePlantContext()

  const { data, isLoading } = useAuditLogs({
    start_date: chartOptions?.startDate,
    end_date: chartOptions?.endDate,
  })

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Audit Summary</h2>
        <p className="text-muted-foreground text-sm">Loading audit data...</p>
      </div>
    )
  }

  const entries = data?.items ?? []
  const totalEntries = entries.length
  const creates = entries.filter((e) => e.action === 'create').length
  const updates = entries.filter((e) => e.action === 'update').length
  const uniqueUsers = new Set(entries.map((e) => e.username).filter(Boolean)).size

  const periodLabel =
    chartOptions?.startDate && chartOptions?.endDate
      ? `${chartOptions.startDate} — ${chartOptions.endDate}`
      : chartOptions?.startDate
        ? `From ${chartOptions.startDate}`
        : chartOptions?.endDate
          ? `Until ${chartOptions.endDate}`
          : 'All time'

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Audit Summary</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryTile
          icon={<Shield className="text-muted-foreground h-5 w-5" />}
          label="Total Entries"
          value={String(totalEntries)}
        />
        <SummaryTile
          icon={<FileText className="text-muted-foreground h-5 w-5" />}
          label="Creates"
          value={String(creates)}
        />
        <SummaryTile
          icon={<Pen className="text-muted-foreground h-5 w-5" />}
          label="Updates"
          value={String(updates)}
        />
        <SummaryTile
          icon={<Eye className="text-muted-foreground h-5 w-5" />}
          label="Unique Users"
          value={String(uniqueUsers)}
        />
      </div>
      <div className="text-muted-foreground mt-3 text-xs">
        Period: {periodLabel}
        {selectedPlant && <span className="ml-2">· Plant: {selectedPlant.name}</span>}
      </div>
    </div>
  )
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}
