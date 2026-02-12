import { useState, useMemo } from 'react'
import { ArrowLeft, Infinity, Hash, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyPath } from '@/api/hooks'
import { RetentionPolicyForm } from './RetentionPolicyForm'
import { InheritanceChain, type InheritanceStep } from './InheritanceChain'
import { formatRetentionPolicy, formatRetentionDescription } from './utils'
import type { SelectedNode } from './RetentionTreeBrowser'
import type { RetentionOverride, RetentionPolicy, RetentionPolicySet } from '@/types'

interface RetentionOverridePanelProps {
  selectedNode: SelectedNode | null
  overrides: RetentionOverride[]
  globalDefault: RetentionPolicy | null
  onSetOverride: (node: SelectedNode, policy: RetentionPolicySet) => void
  onClearOverride: (node: SelectedNode) => void
  isSaving: boolean
}

function getPolicyIcon(retentionType: string) {
  switch (retentionType) {
    case 'sample_count': return Hash
    case 'time_delta': return Calendar
    default: return Infinity
  }
}

export function RetentionOverridePanel({
  selectedNode,
  overrides,
  globalDefault,
  onSetOverride,
  onClearOverride,
  isSaving,
}: RetentionOverridePanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Get hierarchy path for breadcrumb
  const hierarchyPath = useHierarchyPath(
    selectedNode?.type === 'characteristic' ? selectedNode.id : null,
    selectedNode?.type === 'hierarchy' ? selectedNode.id : selectedNode?.hierarchyId
  )

  // Find this node's override if it has one
  const nodeOverride = useMemo(() => {
    if (!selectedNode) return null
    if (selectedNode.type === 'hierarchy') {
      return overrides.find((o) => o.hierarchy_id === selectedNode.id) ?? null
    }
    return overrides.find((o) => o.characteristic_id === selectedNode.id) ?? null
  }, [selectedNode, overrides])

  // Build the inheritance chain from the selected node up to plant default
  const inheritanceChain = useMemo<InheritanceStep[]>(() => {
    if (!selectedNode) return []

    const steps: InheritanceStep[] = []

    // If selected is a characteristic, add it as first step
    if (selectedNode.type === 'characteristic') {
      const charOverride = overrides.find((o) => o.characteristic_id === selectedNode.id)
      steps.push({
        nodeType: 'characteristic',
        nodeId: selectedNode.id,
        nodeName: selectedNode.name,
        hasOverride: !!charOverride,
        retentionType: charOverride?.retention_type ?? null,
        retentionValue: charOverride?.retention_value ?? null,
        retentionUnit: charOverride?.retention_unit ?? null,
      })
    }

    // Walk hierarchy path from leaf to root
    const pathToWalk = [...hierarchyPath]
    if (selectedNode.type === 'hierarchy') {
      // The path includes the selected node itself; start from it
    }
    // Reverse so we go from the node's direct parent up to root
    const reversedPath = [...pathToWalk].reverse()
    // If the selected node is a hierarchy node, the path ends at it; include it
    // For characteristics, the path is for the parent hierarchy
    for (const pathNode of reversedPath) {
      // Skip adding the selected hierarchy node again if it's the same
      if (selectedNode.type === 'hierarchy' && pathNode.id === selectedNode.id) {
        const hierOverride = overrides.find((o) => o.hierarchy_id === selectedNode.id)
        steps.push({
          nodeType: 'hierarchy',
          nodeId: pathNode.id,
          nodeName: pathNode.name,
          hasOverride: !!hierOverride,
          retentionType: hierOverride?.retention_type ?? null,
          retentionValue: hierOverride?.retention_value ?? null,
          retentionUnit: hierOverride?.retention_unit ?? null,
        })
        continue
      }
      const hierOverride = overrides.find((o) => o.hierarchy_id === pathNode.id)
      steps.push({
        nodeType: 'hierarchy',
        nodeId: pathNode.id,
        nodeName: pathNode.name,
        hasOverride: !!hierOverride,
        retentionType: hierOverride?.retention_type ?? null,
        retentionValue: hierOverride?.retention_value ?? null,
        retentionUnit: hierOverride?.retention_unit ?? null,
      })
    }

    // Add plant default at the end
    steps.push({
      nodeType: 'plant',
      nodeId: globalDefault?.plant_id ?? 0,
      nodeName: 'Plant Default',
      hasOverride: true,
      retentionType: globalDefault?.retention_type ?? 'forever',
      retentionValue: globalDefault?.retention_value ?? null,
      retentionUnit: globalDefault?.retention_unit ?? null,
    })

    return steps
  }, [selectedNode, hierarchyPath, overrides, globalDefault])

  // Determine effective policy: first step with an override
  const effectiveStep = inheritanceChain.find((s) => s.hasOverride) ?? null
  const effectiveType = effectiveStep?.retentionType ?? 'forever'
  const effectiveValue = effectiveStep?.retentionValue ?? null
  const effectiveUnit = effectiveStep?.retentionUnit ?? null
  const isInherited = effectiveStep?.nodeId !== selectedNode?.id || effectiveStep?.nodeType === 'plant'

  // Reset editing state when node changes
  const nodeKey = selectedNode ? `${selectedNode.type}-${selectedNode.id}` : ''
  useState(() => { setIsEditing(false); setShowClearConfirm(false) })

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-6">
        <ArrowLeft className="h-8 w-8" />
        <p className="text-sm text-center">
          Select a hierarchy node or characteristic to view its retention policy
        </p>
      </div>
    )
  }

  const breadcrumb = hierarchyPath.map((p) => p.name).join(' > ')
  const fullBreadcrumb = selectedNode.type === 'characteristic'
    ? `${breadcrumb} > ${selectedNode.name}`
    : breadcrumb || selectedNode.name

  const PolicyIcon = getPolicyIcon(effectiveType)

  const handleSaveOverride = (policy: RetentionPolicySet) => {
    onSetOverride(selectedNode, policy)
    setIsEditing(false)
  }

  const handleClearOverride = () => {
    onClearOverride(selectedNode)
    setShowClearConfirm(false)
  }

  return (
    <div className="p-5 space-y-5" key={nodeKey}>
      {/* Header */}
      <div>
        <p className="text-xs text-muted-foreground">{fullBreadcrumb}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
          {selectedNode.type === 'characteristic' ? 'Characteristic' : 'Hierarchy node'}
        </p>
      </div>

      {/* Effective Policy */}
      {!isEditing && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Effective Policy
          </h4>
          <div className="bg-muted border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <PolicyIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                {formatRetentionPolicy(effectiveType, effectiveValue, effectiveUnit)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isInherited
                ? `Inherited from ${effectiveStep?.nodeName ?? 'Plant Default'}`
                : 'Custom override'
              }
            </p>
          </div>
        </div>
      )}

      {/* Edit Form */}
      {isEditing && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {nodeOverride ? 'Edit Override' : 'Set Override'}
          </h4>
          <RetentionPolicyForm
            initialPolicy={nodeOverride ? {
              retention_type: nodeOverride.retention_type as RetentionPolicySet['retention_type'],
              retention_value: nodeOverride.retention_value,
              retention_unit: nodeOverride.retention_unit as RetentionPolicySet['retention_unit'],
            } : undefined}
            onSubmit={handleSaveOverride}
            onCancel={() => setIsEditing(false)}
            submitLabel="Save Override"
            isSubmitting={isSaving}
          />
        </div>
      )}

      {/* Inheritance Chain */}
      {!isEditing && <InheritanceChain steps={inheritanceChain} />}

      {/* Action Buttons */}
      {!isEditing && (
        <div className="flex gap-3 pt-2 border-t border-border">
          {nodeOverride && (
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80"
            >
              Clear Override
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {nodeOverride ? 'Edit Override' : 'Set Override'}
          </button>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Remove Override</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Remove the retention override for <strong>{selectedNode.name}</strong>?
              {selectedNode.type === 'hierarchy' && (
                <> Characteristics under this node will inherit from a parent policy.</>
              )}
              {' '}This takes effect on the next scheduled purge.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleClearOverride}
                disabled={isSaving}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  isSaving
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                )}
              >
                {isSaving ? 'Removing...' : 'Remove Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
