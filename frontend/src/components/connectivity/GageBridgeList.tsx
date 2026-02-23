import { useState } from 'react'
import { Trash2, Usb } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GageBridge } from '@/api/client'

interface GageBridgeListProps {
  bridges: GageBridge[]
  selectedBridgeId: number | null
  onSelect: (id: number) => void
  onDelete: (id: number) => void
}

/** Format an ISO timestamp as a relative "time ago" string. */
function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/** Status dot + label for bridge connection state. */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { dot: string; label: string }> = {
    online: { dot: 'bg-green-500', label: 'Online' },
    offline: { dot: 'bg-zinc-500', label: 'Offline' },
    error: { dot: 'bg-red-500', label: 'Error' },
  }
  const c = config[status] ?? config.offline
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', c.dot)} />
      <span className="text-muted-foreground text-xs">{c.label}</span>
    </span>
  )
}

/**
 * Table of registered gage bridges.
 * Clicking a row selects the bridge; the trash icon deletes (with confirmation).
 */
export function GageBridgeList({
  bridges,
  selectedBridgeId,
  onSelect,
  onDelete,
}: GageBridgeListProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border bg-muted/50 border-b text-left">
            <th className="text-muted-foreground px-4 py-2.5 text-xs font-medium tracking-wider uppercase">
              Name
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-xs font-medium tracking-wider uppercase">
              Status
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-xs font-medium tracking-wider uppercase">
              Last Heartbeat
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-xs font-medium tracking-wider uppercase text-center">
              Ports
            </th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {bridges.map((b) => {
            const isSelected = b.id === selectedBridgeId
            const isConfirming = b.id === confirmDeleteId
            return (
              <tr
                key={b.id}
                onClick={() => onSelect(b.id)}
                className={cn(
                  'border-border cursor-pointer border-b transition-colors last:border-b-0',
                  isSelected
                    ? 'bg-primary/5'
                    : 'hover:bg-muted/50',
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Usb className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="text-foreground font-medium">{b.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={b.status} />
                </td>
                <td className="text-muted-foreground px-4 py-3">
                  {b.last_heartbeat_at ? timeAgo(b.last_heartbeat_at) : 'Never'}
                </td>
                <td className="text-muted-foreground px-4 py-3 text-center">
                  {/* Port count is shown from detail; here we show a dash as placeholder */}
                  &mdash;
                </td>
                <td className="px-3 py-3">
                  {isConfirming ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          onDelete(b.id)
                          setConfirmDeleteId(null)
                        }}
                        className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-500"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-muted-foreground hover:text-foreground px-1 py-1 text-xs"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(b.id)
                      }}
                      className="text-muted-foreground hover:text-red-400 rounded p-1 transition-colors"
                      title="Delete bridge"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
