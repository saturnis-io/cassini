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
  Tag,
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
  const {
    data: rootNodes,
    isLoading: rootLoading,
    error: rootError,
  } = useQuery({
    queryKey: ['opcua-browse', serverId, 'root'],
    queryFn: () => opcuaApi.browse(serverId),
    enabled: serverId > 0,
  })

  const handleToggle = useCallback(
    async (node: OPCUABrowsedNode) => {
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
    },
    [serverId, expandedNodes],
  )

  const handleSelect = useCallback(
    (node: OPCUABrowsedNode) => {
      if (selectedNodeId === node.node_id) {
        setSelectedNodeId(null)
        onNodeSelect(null)
      } else {
        setSelectedNodeId(node.node_id)
        onNodeSelect(node)
      }
    },
    [selectedNodeId, onNodeSelect],
  )

  if (rootLoading) {
    return (
      <div className="text-muted-foreground flex items-center justify-center py-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        <span className="text-sm">Browsing address space...</span>
      </div>
    )
  }

  if (rootError) {
    return (
      <div className="text-destructive flex items-center gap-2 px-4 py-8 text-sm">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Failed to browse server:{' '}
          {rootError instanceof Error ? rootError.message : 'Unknown error'}
        </span>
      </div>
    )
  }

  if (!rootNodes || rootNodes.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center py-12">
        <Server className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">No nodes found in address space</p>
      </div>
    )
  }

  return (
    <div className="max-h-[500px] overflow-y-auto py-1">
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
  const isLeafNode = !canExpand && (node.is_readable || node.node_class === 'Variable' || node.node_class === 'Property')

  return (
    <div>
      {/* Node row */}
      <div
        className={`group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors ${
          isSelected ? 'bg-primary/15 text-primary' : 'text-foreground hover:bg-muted'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (canExpand) onToggle(node)
          if (isLeafNode) onSelect(node)
        }}
      >
        {/* Expand/collapse chevron */}
        {canExpand ? (
          expandState?.loading ? (
            <Loader2 className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : isExpanded ? (
            <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* Node icon */}
        <NodeIcon node={node} isExpanded={isExpanded} />

        {/* Display name */}
        <span className="flex-1 truncate">{node.display_name}</span>

        {/* Node class badge */}
        <NodeClassBadge nodeClass={node.node_class} />

        {/* Data type for variables */}
        {node.data_type && (
          <span className="bg-muted text-muted-foreground ml-1 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">
            {node.data_type}
          </span>
        )}
      </div>

      {/* Error state */}
      {expandState?.error && (
        <div
          className="text-destructive flex items-center gap-1.5 px-2 py-1 text-xs"
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
              className="text-muted-foreground px-2 py-1 text-xs italic"
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
      <FolderOpen className="text-warning/80 h-3.5 w-3.5 shrink-0" />
    ) : (
      <Folder className="text-warning/60 h-3.5 w-3.5 shrink-0" />
    )
  }
  if (node.node_class === 'Variable') {
    return <Variable className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
  }
  if (node.node_class === 'Property') {
    return <Tag className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
  }
  if (node.node_class === 'Object') {
    return <Box className="h-3.5 w-3.5 shrink-0 text-indigo-400/70" />
  }
  return <Box className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
}

/* -----------------------------------------------------------------------
 * Node Class Badge
 * ----------------------------------------------------------------------- */

function NodeClassBadge({ nodeClass }: { nodeClass: string }) {
  const badgeStyles: Record<string, string> = {
    Object: 'bg-indigo-500/10 text-indigo-400',
    Variable: 'bg-cyan-500/10 text-cyan-400',
    Property: 'bg-emerald-500/10 text-emerald-400',
    Method: 'bg-warning/10 text-warning',
    ObjectType: 'bg-purple-500/10 text-purple-400',
    VariableType: 'bg-teal-500/10 text-teal-400',
    ReferenceType: 'bg-destructive/10 text-destructive',
    DataType: 'bg-warning/10 text-warning',
    View: 'bg-success/10 text-success',
  }

  const style = badgeStyles[nodeClass] ?? 'bg-muted text-muted-foreground'

  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${style}`}>
      {nodeClass}
    </span>
  )
}
