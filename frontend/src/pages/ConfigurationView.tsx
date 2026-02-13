import { useState } from 'react'
import {
  useHierarchyTreeByPlant,
  useCreateHierarchyNode,
  useCreateHierarchyNodeInPlant,
} from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { usePlant } from '@/providers/PlantProvider'
import { HierarchyTree } from '@/components/HierarchyTree'
import { CharacteristicForm } from '@/components/CharacteristicForm'
import { CreateCharacteristicWizard } from '@/components/characteristic-config/CreateCharacteristicWizard'
import { Plus, X, Factory, Box, Cog, Cpu, Settings, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// UNS-compatible generic hierarchy types
const NODE_TYPES = [
  { value: 'Folder', label: 'Folder', icon: Box }, // Organizational grouping
  { value: 'Enterprise', label: 'Enterprise', icon: Factory },
  { value: 'Site', label: 'Site', icon: Factory },
  { value: 'Area', label: 'Area', icon: Box },
  { value: 'Line', label: 'Line', icon: Cog },
  { value: 'Cell', label: 'Cell', icon: Cpu },
  { value: 'Equipment', label: 'Equipment', icon: Settings },
  { value: 'Tag', label: 'Tag', icon: Settings },
]

export function ConfigurationView() {
  const { selectedPlant, isLoading: plantLoading, error: plantError } = usePlant()

  // Only use plant-scoped hierarchy - no global fallback
  const {
    data: hierarchy,
    isLoading: hierarchyLoading,
    error: hierarchyError,
  } = useHierarchyTreeByPlant(selectedPlant?.id ?? 0)

  const isLoading = plantLoading || hierarchyLoading

  const editingId = useConfigStore((state) => state.editingCharacteristicId)
  const isCreatingNew = useConfigStore((state) => state.isCreatingNew)
  const selectedNodeId = useConfigStore((state) => state.selectedNodeId)

  // Modal states
  const [showAddNodeModal, setShowAddNodeModal] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  // Node form state
  const [nodeName, setNodeName] = useState('')
  const [nodeType, setNodeType] = useState('SITE')

  const createNode = useCreateHierarchyNode()
  const createNodeInPlant = useCreateHierarchyNodeInPlant()

  const handleCreateNode = async () => {
    if (!nodeName.trim()) return

    // Use plant-scoped endpoint if a plant is selected
    if (selectedPlant) {
      await createNodeInPlant.mutateAsync({
        plantId: selectedPlant.id,
        data: {
          name: nodeName.trim(),
          type: nodeType,
          parent_id: selectedNodeId,
        },
      })
    } else {
      await createNode.mutateAsync({
        name: nodeName.trim(),
        type: nodeType,
        parent_id: selectedNodeId,
      })
    }

    setNodeName('')
    setShowAddNodeModal(false)
  }

  // Show error if plant loading failed
  if (plantError) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <AlertCircle className="text-destructive h-8 w-8" />
        <div className="text-destructive">Failed to load plant data</div>
      </div>
    )
  }

  // Show error if hierarchy loading failed
  if (hierarchyError) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <AlertCircle className="text-destructive h-8 w-8" />
        <div className="text-destructive">Failed to load hierarchy: {hierarchyError.message}</div>
      </div>
    )
  }

  // Show message if no plant is selected
  if (!selectedPlant && !plantLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Factory className="text-muted-foreground h-8 w-8" />
        <div className="text-muted-foreground">Select a site to view and manage hierarchy</div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-muted-foreground">Loading hierarchy...</div>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-6">
      {/* Left panel - Hierarchy tree */}
      <div className="bg-card w-80 flex-shrink-0 overflow-auto rounded-lg border">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Hierarchy</h2>
          <button
            onClick={() => setShowAddNodeModal(true)}
            className="hover:bg-muted rounded-lg p-1.5 transition-colors"
            title="Add hierarchy node"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="p-2">
          <HierarchyTree nodes={hierarchy ?? []} />
        </div>

        {/* Add Characteristic button when node selected */}
        {selectedNodeId && (
          <div className="border-t p-3">
            <button
              onClick={() => setShowWizard(true)}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
              )}
            >
              <Plus className="h-4 w-4" />
              Add Characteristic
            </button>
          </div>
        )}
      </div>

      {/* Right panel - Characteristic form */}
      <div className="bg-card flex-1 overflow-auto rounded-lg border">
        {editingId || isCreatingNew ? (
          <CharacteristicForm characteristicId={editingId} />
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-4">
            <p>Select a characteristic from the hierarchy to edit</p>
            {selectedNodeId && (
              <button
                onClick={() => setShowWizard(true)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <Plus className="h-4 w-4" />
                Add Characteristic
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Node Modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Add Hierarchy Node</h3>
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="hover:bg-muted rounded p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Node Type</label>
                <select
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value)}
                  className="bg-background mt-1 w-full rounded-lg border px-3 py-2"
                >
                  {NODE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                  placeholder="Enter node name"
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  autoFocus
                />
              </div>

              {selectedNodeId && (
                <p className="text-muted-foreground text-sm">
                  Will be created under the selected node
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNode}
                disabled={!nodeName.trim() || createNode.isPending || createNodeInPlant.isPending}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {createNode.isPending || createNodeInPlant.isPending
                  ? 'Creating...'
                  : 'Create Node'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Characteristic Wizard */}
      {selectedNodeId && (
        <CreateCharacteristicWizard
          isOpen={showWizard}
          onClose={() => setShowWizard(false)}
          selectedNodeId={selectedNodeId}
          plantId={selectedPlant?.id ?? null}
        />
      )}
    </div>
  )
}
