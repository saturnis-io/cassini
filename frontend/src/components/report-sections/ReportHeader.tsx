import { useDateFormat } from '@/hooks/useDateFormat'
import type { ReportTemplate } from '@/lib/report-templates'

interface ReportHeaderProps {
  template: ReportTemplate
  characteristic?: { name: string; id: number }
  characteristicIds: number[]
}

export function ReportHeader({
  template,
  characteristic,
  characteristicIds,
}: ReportHeaderProps) {
  const { formatDateTime } = useDateFormat()
  const isNonCharScope = template.scope === 'plant' || template.scope === 'study' || template.scope === 'line'

  return (
    <div className="border-border border-b pb-4">
      <h1 className="text-2xl font-bold">{template.name}</h1>
      <p className="text-muted-foreground mt-1">{template.description}</p>
      {!isNonCharScope && (
        <div className="text-muted-foreground mt-2 text-sm">
          {characteristic && (
            <span>
              Characteristic:{' '}
              <span className="text-foreground font-medium">{characteristic.name}</span>
            </span>
          )}
          {characteristicIds.length > 1 && (
            <span className="ml-4">+ {characteristicIds.length - 1} more</span>
          )}
        </div>
      )}
      <div className="text-muted-foreground mt-1 text-xs">
        Generated: {formatDateTime(new Date())}
      </div>
    </div>
  )
}
