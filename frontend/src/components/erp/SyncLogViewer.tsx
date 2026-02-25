import { useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useERPSyncLogs } from '@/api/hooks'

const STATUS_STYLES: Record<string, string> = {
  success:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  partial:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  running:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
}

const PAGE_SIZE = 10

/**
 * SyncLogViewer - Paginated table of sync logs for a connector.
 * Shows status, direction, record counts, timestamps, and expandable error details.
 */
export function SyncLogViewer({ connectorId }: { connectorId: number }) {
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const { data, isLoading } = useERPSyncLogs(
    connectorId,
    PAGE_SIZE,
    page * PAGE_SIZE,
  )

  const logs = data ?? []
  const total = logs.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (isLoading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading logs...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider">
        Sync Logs
      </h4>

      {logs.length === 0 ? (
        <p className="text-muted-foreground text-xs">No sync logs yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left">
                  <th className="pb-1.5 pr-2 font-medium" />
                  <th className="pb-1.5 pr-2 font-medium">Status</th>
                  <th className="pb-1.5 pr-2 font-medium">Dir</th>
                  <th className="pb-1.5 pr-2 font-medium">Processed</th>
                  <th className="pb-1.5 pr-2 font-medium">Failed</th>
                  <th className="pb-1.5 pr-2 font-medium">Started</th>
                  <th className="pb-1.5 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedId === log.id
                  const duration =
                    log.completed_at && log.started_at
                      ? Math.round(
                          (new Date(log.completed_at).getTime() -
                            new Date(log.started_at).getTime()) /
                            1000,
                        )
                      : null
                  return (
                    <tr key={log.id} className="group">
                      <td className="py-1.5 pr-1">
                        {(log.error_message || log.detail) && (
                          <button
                            onClick={() =>
                              setExpandedId(isExpanded ? null : log.id)
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-medium',
                            STATUS_STYLES[log.status] ||
                              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                          )}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 capitalize">{log.direction}</td>
                      <td className="py-1.5 pr-2">{log.records_processed}</td>
                      <td className="py-1.5 pr-2">
                        {log.records_failed > 0 ? (
                          <span className="text-destructive font-medium">
                            {log.records_failed}
                          </span>
                        ) : (
                          log.records_failed
                        )}
                      </td>
                      <td className="text-muted-foreground py-1.5 pr-2">
                        {new Date(log.started_at).toLocaleString()}
                      </td>
                      <td className="text-muted-foreground py-1.5">
                        {duration !== null ? `${duration}s` : '--'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded error detail */}
          {expandedId && (
            <div className="bg-muted/50 rounded-lg p-3">
              {logs
                .filter((l) => l.id === expandedId)
                .map((log) => (
                  <div key={log.id} className="space-y-1 text-xs">
                    {log.error_message && (
                      <div>
                        <span className="text-destructive font-medium">
                          Error:{' '}
                        </span>
                        {log.error_message}
                      </div>
                    )}
                    {log.detail && (
                      <pre className="text-muted-foreground max-h-32 overflow-auto rounded bg-black/5 p-2 font-mono text-[10px] dark:bg-white/5">
                        {JSON.stringify(log.detail, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px]">
                {total} total log{total !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs disabled:opacity-40"
                >
                  Prev
                </button>
                <span className="text-muted-foreground px-2 py-1 text-xs">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
