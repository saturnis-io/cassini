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
        <PreviewHeader
          label={selectedTopic}
          protocol="mqtt"
        />
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

  return (
    <OPCUAValuePreview
      serverId={server.id}
      node={selectedNode}
    />
  )
}

/* -----------------------------------------------------------------------
 * OPC-UA Value Preview (polls readValue every 2s)
 * ----------------------------------------------------------------------- */

function OPCUAValuePreview({
  serverId,
  node,
}: {
  serverId: number
  node: OPCUABrowsedNode
}) {
  const { data: nodeValue, isLoading, error } = useQuery({
    queryKey: ['opcua-read-value', serverId, node.node_id],
    queryFn: () => opcuaApi.readValue(serverId, node.node_id),
    refetchInterval: 2000,
    enabled: serverId > 0,
  })

  return (
    <div className="space-y-3">
      <PreviewHeader
        label={node.display_name}
        sublabel={node.node_id}
        protocol="opcua"
      />

      {isLoading && !nodeValue && (
        <div className="flex items-center justify-center py-6 text-[#64748b]">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          <span className="text-sm">Reading value...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error instanceof Error ? error.message : 'Failed to read value'}</span>
        </div>
      )}

      {nodeValue && (
        <div className="bg-[#0a0f1a] border border-[#1e293b] rounded-lg overflow-hidden">
          {/* Value display — large, prominent */}
          <div className="px-4 py-4 border-b border-[#1e293b]">
            <div className="text-[10px] uppercase tracking-wider text-[#64748b] mb-1">Current Value</div>
            <div className="text-2xl font-mono font-bold text-[#e2e8f0] tabular-nums">
              {formatOPCUAValue(nodeValue.value)}
            </div>
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-px bg-[#1e293b]">
            <MetadataCell
              icon={<Tag className="h-3 w-3" />}
              label="Data Type"
              value={nodeValue.data_type}
            />
            <MetadataCell
              icon={<Activity className="h-3 w-3" />}
              label="Status"
              value={nodeValue.status_code}
              valueClass={nodeValue.status_code === 'Good' ? 'text-emerald-400' : 'text-amber-400'}
            />
            <MetadataCell
              icon={<Clock className="h-3 w-3" />}
              label="Source Time"
              value={nodeValue.source_timestamp
                ? new Date(nodeValue.source_timestamp).toLocaleTimeString()
                : '--'}
            />
            <MetadataCell
              icon={<Clock className="h-3 w-3" />}
              label="Server Time"
              value={nodeValue.server_timestamp
                ? new Date(nodeValue.server_timestamp).toLocaleTimeString()
                : '--'}
            />
          </div>

          {/* Polling indicator */}
          <div className="px-3 py-1.5 flex items-center gap-1.5 text-[10px] text-[#475569]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
      <span className={`mt-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
        protocol === 'mqtt'
          ? 'bg-teal-500/15 text-teal-400'
          : 'bg-purple-500/15 text-purple-400'
      }`}>
        {protocol === 'mqtt' ? 'MQTT' : 'OPC-UA'}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#e2e8f0] truncate">{label}</p>
        {sublabel && (
          <p className="text-[11px] font-mono text-[#64748b] truncate">{sublabel}</p>
        )}
      </div>
    </div>
  )
}

function MetadataCell({
  icon,
  label,
  value,
  valueClass = 'text-[#e2e8f0]',
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="bg-[#0a0f1a] px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] text-[#64748b] mb-0.5">
        {icon}
        {label}
      </div>
      <div className={`text-xs font-mono ${valueClass}`}>{value}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-[#475569]">
      <Activity className="h-8 w-8 mb-2 opacity-30" />
      <p className="text-sm text-center">{message}</p>
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
