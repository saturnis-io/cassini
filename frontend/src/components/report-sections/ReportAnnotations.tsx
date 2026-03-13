import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { Annotation } from '@/types'

interface ReportAnnotationsProps {
  annotations: Annotation[]
}

export function ReportAnnotations({ annotations }: ReportAnnotationsProps) {
  const { formatDate, formatDateTime } = useDateFormat()

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Annotations</h2>
      {annotations.length === 0 ? (
        <p className="text-muted-foreground text-sm">No annotations recorded</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th className="py-2 text-left">Date</th>
              <th className="py-2 text-left">Type</th>
              <th className="py-2 text-left">Note</th>
              <th className="py-2 text-left">Time Range</th>
              <th className="py-2 text-left">Author</th>
            </tr>
          </thead>
          <tbody>
            {annotations.map((a) => (
              <tr key={a.id} className="border-border/50 border-b">
                <td className="py-2">{formatDate(a.created_at)}</td>
                <td className="py-2">
                  <span
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                      a.annotation_type === 'point'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-primary/15 text-primary',
                    )}
                  >
                    {a.annotation_type === 'point' ? 'Point' : 'Period'}
                  </span>
                </td>
                <td className="max-w-[200px] truncate py-2" title={a.text}>
                  {a.text}
                </td>
                <td className="text-muted-foreground py-2 text-xs">
                  {a.annotation_type === 'period' && a.start_time && a.end_time ? (
                    <>
                      {formatDateTime(a.start_time)}
                      {' — '}
                      {formatDateTime(a.end_time)}
                    </>
                  ) : a.annotation_type === 'point' ? (
                    <span>Sample #{a.sample_id}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="text-muted-foreground py-2">{a.created_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
