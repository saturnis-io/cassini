import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Variable,
  Box,
  Loader2,
  AlertCircle,
  Server,
} from 'lucide-react'
import { opcuaApi } from '@/api/client'
import type { OPCUABrowsedNode } from '@/types'

interface NodeTreeBrowserProps {
  serverId: number
  onNodeSelect: (node: OPCUABrowsedNode | null) => void
}

interface ExpandedNodeState {
  loading: boolean
  error: string | null
  children: OPCUABrowsedNode[]
}

/**
 * OPC-UA address space browser.
 * Lazily loads child nodes on expand via opcuaApi.browse().
 * Shows node class icons, data type badges, and expand/collapse controls.
 */
export function NodeTreeBrowser({ serverId, onNodeSelect }: NodeTreeBrowserProps) {
  const [expandedNodes, setExpandedNodes] = useState<Map<string, ExpandedNodeState>>(new Map())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  // Fetch root-level nodes
  const { data: rootNodes, isLoading: rootLoading, error: rootError } = useQuery({
    queryKey: ['opcua-browse', serverId, 'root'],
    queryFn: () => opcuaApi.browse(serverId),
    enabled: serverId > 0,
  })

  const handleToggle = useCallback(async (node: OPCUABrowsedNode) => {
    const nodeId = node.node_id

    // If already expanded, collapse
    if (expandedNodes.has(nodeId)) {
      setExpandedNodes((prev) => {
        const next = new Map(prev)
        next.delete(nodeId)
        return next
      })
      return
    }

    // Set loading state
    setExpandedNodes((prev) => {
      const next = new Map(prev)
      next.set(nodeId, { loading: true, error: null, children: [] })
      return next
    })

    try {
      const children = await opcuaApi.browse(serverId, nodeId)
      setExpandedNodes((prev) => {
        const next = new Map(prev)
        next.set(nodeId, { loading: false, error: null, children })
        return next
      })
    } catch (err) {
      setExpandedNodes((prev) => {
        const next = new Map(prev)
        next.set(nodeId, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to browse node',
          children: [],
        })
        return next
      })
    }
  }, [serverId, expandedNodes])

  const handleSelect = useCallback((node: OPCUABrowsedNode) => {
    if (selectedNodeId === node.node_id) {
      setSelectedNodeId(null)
      onNodeSelect(null)
    } else {
      setSelectedNodeId(node.node_id)
      onNodeSelect(node)
    }
  }, [selectedNodeId, onNodeSelect])

  if (rootLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Browsing address space...</span>
      </div>
    )
  }

  if (rootError) {
    return (
      <div className="flex items-center gap-2 py-8 px-4 text-red-400 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>Failed to browse server: {rootError instanceof Error ? rootError.message : 'Unknown error'}</span>
      </div>
    )
  }

  if (!rootNodes || rootNodes.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-muted-foreground">
        <Server className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No nodes found in address space</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto max-h-[500px] py-1">
      {rootNodes.map((node) => (
        <NodeItem
          key={node.node_id}
          node={node}
          depth={0}
          expandedNodes={expandedNodes}
          selectedNodeId={selectedNodeId}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Individual Node Item
 * ----------------------------------------------------------------------- */

function NodeItem({
  node,
  depth,
  expandedNodes,
  selectedNodeId,
  onToggle,
  onSelect,
}: {
  node: OPCUABrowsedNode
  depth: number
  expandedNodes: Map<string, ExpandedNodeState>
  selectedNodeId: string | null
  onToggle: (node: OPCUABrowsedNode) => void
  onSelect: (node: OPCUABrowsedNode) => void
}) {
  const isExpanded = expandedNodes.has(node.node_id)
  const expandState = expandedNodes.get(node.node_id)
  const isSelected = selectedNodeId === node.node_id
  const canExpand = node.is_folder || node.children_count > 0
  const isVariable = node.node_class === 'Variable'

  return (
    <div>
      {/* Node row */}
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-sm cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-indigo-500/15 text-indigo-300'
            : 'text-foreground hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (canExpand) onToggle(node)
          if (isVariable) onSelect(node)
        }}
      >
        {/* Expand/collapse chevron */}
        {canExpand ? (
          expandState?.loading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Node icon */}
        <NodeIcon node={node} isExpanded={isExpanded} />

        {/* Display name */}
        <span className="truncate flex-1">{node.display_name}</span>

        {/* Node class badge */}
        <NodeClassBadge nodeClass={node.node_class} />

        {/* Data type for variables */}
        {node.data_type && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground shrink-0">
            {node.data_type}
          </span>
        )}
      </div>

      {/* Error state */}
      {expandState?.error && (
        <div
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-400"
          style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{expandState.error}</span>
        </div>
      )}

      {/* Children */}
      {isExpanded && expandState && !expandState.loading && !expandState.error && (
        <div>
          {expandState.children.length === 0 ? (
            <div
              className="px-2 py-1 text-xs text-muted-foreground italic"
              style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
            >
              No child nodes
            </div>
          ) : (
            expandState.children.map((child) => (
              <NodeItem
                key={child.node_id}
                node={child}
                depth={depth + 1}
                expandedNodes={expandedNodes}
                selectedNodeId={selectedNodeId}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Node Icon
 * ----------------------------------------------------------------------- */

function NodeIcon({ node, isExpanded }: { node: OPCUABrowsedNode; isExpanded: boolean }) {
  if (node.is_folder) {
    return isExpanded ? (
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
    ) : (
      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400/60" />
    )
  }
  if (node.node_class === 'Variable') {
    return <Variable className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
  }
  if (node.node_class === 'Object') {
    return <Box className="h-3.5 w-3.5 shrink-0 text-indigo-400/70" />
  }
  return <Box className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

/* -----------------------------------------------------------------------
 * Node Class Badge
 * ----------------------------------------------------------------------- */

function NodeClassBadge({ nodeClass }: { nodeClass: string }) {
  const badgeStyles: Record<string, string> = {
    Object: 'bg-indigo-500/10 text-indigo-400',
    Variable: 'bg-cyan-500/10 text-cyan-400',
    Method: 'bg-amber-500/10 text-amber-400',
    ObjectType: 'bg-purple-500/10 text-purple-400',
    VariableType: 'bg-teal-500/10 text-teal-400',
    ReferenceType: 'bg-rose-500/10 text-rose-400',
    DataType: 'bg-orange-500/10 text-orange-400',
    View: 'bg-emerald-500/10 text-emerald-400',
  }

  const style = badgeStyles[nodeClass] ?? 'bg-muted text-muted-foreground'

  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded shrink-0 ${style}`}>
      {nodeClass}
    </span>
  )
}
