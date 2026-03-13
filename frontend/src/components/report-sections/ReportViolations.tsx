import { useDateFormat } from '@/hooks/useDateFormat'
import { StatCard } from '@/components/report-sections/ReportStatistics'
import type { Violation } from '@/types'

interface ReportViolationsListProps {
  violations: Violation[]
}

export function ReportViolationsList({ violations }: ReportViolationsListProps) {
  const { formatDate } = useDateFormat()

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Recent Violations</h2>
      {violations.length === 0 ? (
        <p className="text-muted-foreground">No violations recorded</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 text-left">Date</th>
              <th className="py-2 text-left">Rule</th>
              <th className="py-2 text-left">Severity</th>
              <th className="py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {violations.slice(0, 10).map((v) => (
              <tr key={v.id} className="border-border/50 border-b">
                <td className="py-2">
                  {v.created_at ? formatDate(v.created_at) : '-'}
                </td>
                <td className="py-2">
                  Rule {v.rule_id}: {v.rule_name}
                </td>
                <td className="py-2">{v.severity}</td>
                <td className="py-2">{v.acknowledged ? 'Acknowledged' : 'Pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

interface ReportViolationStatsProps {
  violations: Violation[]
}

export function ReportViolationStats({ violations }: ReportViolationStatsProps) {
  const vStats = {
    total: violations.length,
    pending: violations.filter((v) => !v.acknowledged).length,
    acknowledged: violations.filter((v) => v.acknowledged).length,
    bySeverity: violations.reduce(
      (acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    ),
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Violation Statistics</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Violations" value={String(vStats.total)} />
        <StatCard label="Pending" value={String(vStats.pending)} highlight="destructive" />
        <StatCard label="Acknowledged" value={String(vStats.acknowledged)} />
        <StatCard label="Critical" value={String(vStats.bySeverity['CRITICAL'] || 0)} />
      </div>
    </div>
  )
}

interface ReportViolationTableProps {
  violations: Violation[]
}

export function ReportViolationTable({ violations }: ReportViolationTableProps) {
  const { formatDate } = useDateFormat()

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Violation Details</h2>
      {violations.length === 0 ? (
        <p className="text-muted-foreground">No violations found</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 text-left">Date</th>
              <th className="py-2 text-left">Characteristic</th>
              <th className="py-2 text-left">Rule</th>
              <th className="py-2 text-left">Severity</th>
              <th className="py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr key={v.id} className="border-border/50 border-b">
                <td className="py-2">
                  {v.created_at ? formatDate(v.created_at) : '-'}
                </td>
                <td className="py-2">{v.characteristic_name || '-'}</td>
                <td className="py-2">Rule {v.rule_id}</td>
                <td className="py-2">{v.severity}</td>
                <td className="py-2">{v.acknowledged ? 'Ack' : 'Pending'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
