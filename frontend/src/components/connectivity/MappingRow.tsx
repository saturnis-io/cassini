import { useState } from 'react'
import { Trash2, Pencil, Power, PowerOff, Circle } from 'lucide-react'
import { ProtocolBadge } from './ProtocolBadge'
import type { TagMappingResponse } from '@/types'

export interface MappingRowData {
  id: number
  characteristicId: number
  characteristicName: string
  protocol: 'mqtt' | 'opcua'
  source: string
  sourceDetail?: string
  serverName: string | null
  triggerStrategy: string
  isActive: boolean
  hasError?: boolean
}

interface MappingRowProps {
  mapping: MappingRowData
  onEdit: (mapping: MappingRowData) => void
  onDelete: (mapping: MappingRowData) => void
  onToggleActive?: (mapping: MappingRowData) => void
}

/**
 * Protocol-aware table row for a data source mapping.
 * Shows protocol badge, source details, server, strategy, status, and actions.
 */
export function MappingRow({
  mapping,
  onEdit,
  onDelete,
  onToggleActive,
}: MappingRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const statusColor = mapping.hasError
    ? 'fill-red-400 text-red-400'
    : mapping.isActive
      ? 'fill-emerald-400 text-emerald-400'
      : 'fill-muted-foreground text-muted-foreground'

  const statusLabel = mapping.hasError
    ? 'Error'
    : mapping.isActive
      ? 'Active'
      : 'Inactive'

  return (
    <tr className="border-t border-border hover:bg-muted/30 transition-colors group">
      {/* Characteristic */}
      <td className="px-3 py-2.5">
        <span className="text-sm text-foreground font-medium">{mapping.characteristicName}</span>
      </td>

      {/* Source */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ProtocolBadge protocol={mapping.protocol} />
          <div className="min-w-0">
            <p className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
              {mapping.source}
            </p>
            {mapping.sourceDetail && (
              <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                {mapping.sourceDetail}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Server */}
      <td className="px-3 py-2.5">
        <span className="text-xs text-muted-foreground">{mapping.serverName ?? '--'}</span>
      </td>

      {/* Strategy */}
      <td className="px-3 py-2.5">
        <StrategyBadge strategy={mapping.triggerStrategy} />
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Circle className={`h-2 w-2 ${statusColor}`} />
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onToggleActive && (
            <button
              onClick={() => onToggleActive(mapping)}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
              title={mapping.isActive ? 'Deactivate' : 'Activate'}
            >
              {mapping.isActive ? (
                <PowerOff className="h-3.5 w-3.5" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            onClick={() => onEdit(mapping)}
            className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
            title="Edit mapping"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onDelete(mapping)
                  setConfirmDelete(false)
                }}
                className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-1.5 py-0.5 text-[10px] rounded text-muted-foreground hover:text-muted-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 text-muted-foreground hover:text-red-400 transition-colors rounded"
              title="Delete mapping"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

/* -----------------------------------------------------------------------
 * Unmapped characteristic row
 * ----------------------------------------------------------------------- */

export function UnmappedRow({
  characteristicName,
  onMap,
}: {
  characteristicName: string
  onMap: () => void
}) {
  return (
    <tr className="border-t border-border/50 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5">
        <span className="text-sm text-muted-foreground">{characteristicName}</span>
      </td>
      <td className="px-3 py-2.5" colSpan={3}>
        <span className="text-xs text-muted-foreground italic">-- unmapped --</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-0.5 bg-muted-foreground rounded-full" />
          <span className="text-xs text-muted-foreground">N/A</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={onMap}
          className="px-2 py-1 text-[10px] font-medium rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
        >
          Map
        </button>
      </td>
    </tr>
  )
}

/* -----------------------------------------------------------------------
 * Strategy Badge
 * ----------------------------------------------------------------------- */

function StrategyBadge({ strategy }: { strategy: string }) {
  const labels: Record<string, string> = {
    on_change: 'On Change',
    on_trigger: 'On Trigger',
    on_timer: 'On Timer',
  }

  const colors: Record<string, string> = {
    on_change: 'bg-blue-500/10 text-blue-400',
    on_trigger: 'bg-amber-500/10 text-amber-400',
    on_timer: 'bg-cyan-500/10 text-cyan-400',
  }

  return (
    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[strategy] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[strategy] ?? strategy}
    </span>
  )
}
