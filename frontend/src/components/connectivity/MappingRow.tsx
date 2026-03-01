import { useState } from 'react'
import { Trash2, Pencil, Power, PowerOff, Circle } from 'lucide-react'
import { ProtocolBadge } from './ProtocolBadge'
import type { TagMappingResponse } from '@/types'

export interface MappingRowData {
  id: number
  characteristicId: number
  characteristicName: string
  hierarchyPath?: string
  protocol: 'mqtt' | 'opcua'
  source: string
  sourceDetail?: string
  serverName: string | null
  triggerStrategy: string
  isActive: boolean
  hasError?: boolean
  jsonPath?: string | null
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
export function MappingRow({ mapping, onEdit, onDelete, onToggleActive }: MappingRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const statusColor = mapping.hasError
    ? 'fill-destructive text-destructive'
    : mapping.isActive
      ? 'fill-success text-success'
      : 'fill-muted-foreground text-muted-foreground'

  const statusLabel = mapping.hasError ? 'Error' : mapping.isActive ? 'Active' : 'Inactive'

  return (
    <tr className="border-border hover:bg-muted/30 group border-t transition-colors">
      {/* Characteristic */}
      <td className="px-3 py-2.5">
        {mapping.hierarchyPath && (
          <p className="text-muted-foreground mb-0.5 text-[10px]">{mapping.hierarchyPath}</p>
        )}
        <span className="text-foreground text-sm font-medium">{mapping.characteristicName}</span>
      </td>

      {/* Source */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ProtocolBadge protocol={mapping.protocol} />
          <div className="min-w-0">
            <p className="text-muted-foreground max-w-[200px] truncate font-mono text-xs">
              {mapping.source}
            </p>
            {mapping.sourceDetail && (
              <p className="text-muted-foreground max-w-[200px] truncate text-[10px]">
                {mapping.sourceDetail}
              </p>
            )}
          </div>
        </div>
      </td>

      {/* Server */}
      <td className="px-3 py-2.5">
        <span className="text-muted-foreground text-xs">{mapping.serverName ?? '--'}</span>
      </td>

      {/* Strategy */}
      <td className="px-3 py-2.5">
        <StrategyBadge strategy={mapping.triggerStrategy} />
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <Circle className={`h-2 w-2 ${statusColor}`} />
          <span className="text-muted-foreground text-xs">{statusLabel}</span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onToggleActive && (
            <button
              onClick={() => onToggleActive(mapping)}
              className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
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
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
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
                className="bg-destructive/15 text-destructive hover:bg-destructive/25 rounded px-1.5 py-0.5 text-[10px] transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-muted-foreground hover:text-muted-foreground rounded px-1.5 py-0.5 text-[10px] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
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
  hierarchyPath,
  onMap,
}: {
  characteristicName: string
  hierarchyPath?: string
  onMap: () => void
}) {
  return (
    <tr className="border-border/50 hover:bg-muted/20 border-t transition-colors">
      <td className="px-3 py-2.5">
        {hierarchyPath && (
          <p className="text-muted-foreground mb-0.5 text-[10px]">{hierarchyPath}</p>
        )}
        <span className="text-muted-foreground text-sm">{characteristicName}</span>
      </td>
      <td className="px-3 py-2.5" colSpan={3}>
        <span className="text-muted-foreground text-xs italic">-- unmapped --</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="bg-muted-foreground h-0.5 w-1.5 rounded-full" />
          <span className="text-muted-foreground text-xs">N/A</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={onMap}
          className="rounded bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
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
    on_change: 'bg-primary/10 text-primary',
    on_trigger: 'bg-warning/10 text-warning',
    on_timer: 'bg-cyan-500/10 text-cyan-400',
  }

  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[strategy] ?? 'bg-muted text-muted-foreground'}`}
    >
      {labels[strategy] ?? strategy}
    </span>
  )
}
