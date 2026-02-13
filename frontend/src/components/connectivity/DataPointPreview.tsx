import { useQuery } from '@tanstack/react-query'
import { Activity, Clock, Tag, AlertCircle, Loader2 } from 'lucide-react'
import { opcuaApi } from '@/api/client'
import { LiveValuePreview } from './LiveValuePreview'
import type { SelectedServer } from './ServerSelector'
import type { OPCUABrowsedNode } from '@/types'

interface DataPointPreviewProps {
  server: SelectedServer | null
  /** For MQTT: selected topic string. For OPC-UA: null (use selectedNode instead). */
  selectedTopic: string | null
  /** For OPC-UA: selected browsed node. */
  selectedNode: OPCUABrowsedNode | null
  /** Callback for metric selection in MQTT SparkplugB preview */
  onSelectMetric?: (name: string | null) => void
  selectedMetric?: string | null
}

/**
 * Generalized data point preview.
 * - MQTT: Renders existing LiveValuePreview with topic sampling.
 * - OPC-UA: Polls opcuaApi.readValue() every 2s, shows value, data type, timestamps.
 */
export function DataPointPreview({
  server,
  selectedTopic,
  selectedNode,
  onSelectMetric,
  selectedMetric,
}: DataPointPreviewProps) {
  // No server or no selection
  if (!server) {
    return <EmptyState message="Select a server to browse data points" />
  }

  if (server.protocol === 'mqtt') {
    if (!selectedTopic) {
      return <EmptyState message="Select a topic from the tree to preview values" />
    }
    return (
      <div className="space-y-3">
        <PreviewHeader label={selectedTopic} protocol="mqtt" />
        <LiveValuePreview
          brokerId={server.id}
          topic={selectedTopic}
          onSelectMetric={onSelectMetric}
          selectedMetric={selectedMetric}
        />
      </div>
    )
  }

  // OPC-UA
  if (!selectedNode) {
    return <EmptyState message="Select a variable node from the tree to preview its value" />
  }

  return <OPCUAValuePreview serverId={server.id} node={selectedNode} />
}

/* -----------------------------------------------------------------------
 * OPC-UA Value Preview (polls readValue every 2s)
 * ----------------------------------------------------------------------- */

function OPCUAValuePreview({ serverId, node }: { serverId: number; node: OPCUABrowsedNode }) {
  const {
    data: nodeValue,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['opcua-read-value', serverId, node.node_id],
    queryFn: () => opcuaApi.readValue(serverId, node.node_id),
    refetchInterval: 2000,
    enabled: serverId > 0,
  })

  return (
    <div className="space-y-3">
      <PreviewHeader label={node.display_name} sublabel={node.node_id} protocol="opcua" />

      {isLoading && !nodeValue && (
        <div className="text-muted-foreground flex items-center justify-center py-6">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          <span className="text-sm">Reading value...</span>
        </div>
      )}

      {error && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error instanceof Error ? error.message : 'Failed to read value'}</span>
        </div>
      )}

      {nodeValue && (
        <div className="bg-background border-border overflow-hidden rounded-lg border">
          {/* Value display — large, prominent */}
          <div className="border-border border-b px-4 py-4">
            <div className="text-muted-foreground mb-1 text-[10px] tracking-wider uppercase">
              Current Value
            </div>
            <div className="text-foreground font-mono text-2xl font-bold tabular-nums">
              {formatOPCUAValue(nodeValue.value)}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="bg-muted grid grid-cols-2 gap-px">
            <MetadataCell
              icon={<Tag className="h-3 w-3" />}
              label="Data Type"
              value={nodeValue.data_type}
            />
            <MetadataCell
              icon={<Activity className="h-3 w-3" />}
              label="Status"
              value={nodeValue.status_code}
              valueClass={nodeValue.status_code === 'Good' ? 'text-success' : 'text-warning'}
            />
            <MetadataCell
              icon={<Clock className="h-3 w-3" />}
              label="Source Time"
              value={
                nodeValue.source_timestamp
                  ? new Date(nodeValue.source_timestamp).toLocaleTimeString()
                  : '--'
              }
            />
            <MetadataCell
              icon={<Clock className="h-3 w-3" />}
              label="Server Time"
              value={
                nodeValue.server_timestamp
                  ? new Date(nodeValue.server_timestamp).toLocaleTimeString()
                  : '--'
              }
            />
          </div>

          {/* Polling indicator */}
          <div className="text-muted-foreground flex items-center gap-1.5 px-3 py-1.5 text-[10px]">
            <span className="bg-success h-1.5 w-1.5 animate-pulse rounded-full" />
            Polling every 2s
          </div>
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Shared sub-components
 * ----------------------------------------------------------------------- */

function PreviewHeader({
  label,
  sublabel,
  protocol,
}: {
  label: string
  sublabel?: string
  protocol: 'mqtt' | 'opcua'
}) {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
          protocol === 'mqtt' ? 'bg-teal-500/15 text-teal-400' : 'bg-purple-500/15 text-purple-400'
        }`}
      >
        {protocol === 'mqtt' ? 'MQTT' : 'OPC-UA'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">{label}</p>
        {sublabel && (
          <p className="text-muted-foreground truncate font-mono text-[11px]">{sublabel}</p>
        )}
      </div>
    </div>
  )
}

function MetadataCell({
  icon,
  label,
  value,
  valueClass = 'text-foreground',
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-background px-3 py-2">
      <div className="text-muted-foreground mb-0.5 flex items-center gap-1 text-[10px]">
        {icon}
        {label}
      </div>
      <div className={`font-mono text-xs ${valueClass}`}>{value}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-10">
      <Activity className="mb-2 h-8 w-8 opacity-30" />
      <p className="text-center text-sm">{message}</p>
    </div>
  )
}

function formatOPCUAValue(value: unknown): string {
  if (value === null || value === undefined) return '--'
  if (typeof value === 'number') {
    // Format with reasonable precision
    return Number.isInteger(value) ? String(value) : value.toFixed(4)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}
