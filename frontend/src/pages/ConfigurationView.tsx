import { useState } from 'react'
import { useHierarchyTree, useCreateHierarchyNode, useCreateCharacteristic } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { HierarchyTree } from '@/components/HierarchyTree'
import { CharacteristicForm } from '@/components/CharacteristicForm'
import { Plus, X, Factory, Box, Cog, Cpu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

// UNS-compatible generic hierarchy types
const NODE_TYPES = [
  { value: 'Folder', label: 'Folder', icon: Box },           // Organizational grouping
  { value: 'Enterprise', label: 'Enterprise', icon: Factory },
  { value: 'Site', label: 'Site', icon: Factory },
  { value: 'Area', label: 'Area', icon: Box },
  { value: 'Line', label: 'Line', icon: Cog },
  { value: 'Cell', label: 'Cell', icon: Cpu },
  { value: 'Equipment', label: 'Equipment', icon: Settings },
  { value: 'Tag', label: 'Tag', icon: Settings },
]

const PROVIDER_TYPES = [
  { value: 'MANUAL', label: 'Manual Entry' },
  { value: 'TAG', label: 'MQTT Tag' },
]

export function ConfigurationView() {
  const { data: hierarchy, isLoading } = useHierarchyTree()
  const editingId = useConfigStore((state) => state.editingCharacteristicId)
  const isCreatingNew = useConfigStore((state) => state.isCreatingNew)
  const selectedNodeId = useConfigStore((state) => state.selectedNodeId)

  // Modal states
  const [showAddNodeModal, setShowAddNodeModal] = useState(false)
  const [showAddCharModal, setShowAddCharModal] = useState(false)

  // Node form state
  const [nodeName, setNodeName] = useState('')
  const [nodeType, setNodeType] = useState('SITE')

  // Characteristic form state
  const [charName, setCharName] = useState('')
  const [charProvider, setCharProvider] = useState<'MANUAL' | 'TAG'>('MANUAL')
  const [charSubgroupSize, setCharSubgroupSize] = useState('5')
  const [charTarget, setCharTarget] = useState('')
  const [charUSL, setCharUSL] = useState('')
  const [charLSL, setCharLSL] = useState('')
  const [charMqttTopic, setCharMqttTopic] = useState('')

  const createNode = useCreateHierarchyNode()
  const createChar = useCreateCharacteristic()

  const handleCreateNode = async () => {
    if (!nodeName.trim()) return

    await createNode.mutateAsync({
      name: nodeName.trim(),
      type: nodeType,
      parent_id: selectedNodeId,
    })

    setNodeName('')
    setShowAddNodeModal(false)
  }

  const handleCreateCharacteristic = async () => {
    if (!charName.trim() || !selectedNodeId) return

    await createChar.mutateAsync({
      name: charName.trim(),
      hierarchy_id: selectedNodeId,
      provider_type: charProvider,
      subgroup_size: parseInt(charSubgroupSize) || 5,
      target_value: charTarget ? parseFloat(charTarget) : null,
      usl: charUSL ? parseFloat(charUSL) : null,
      lsl: charLSL ? parseFloat(charLSL) : null,
      mqtt_topic: charProvider === 'TAG' ? charMqttTopic : null,
    })

    // Reset form
    setCharName('')
    setCharProvider('MANUAL')
    setCharSubgroupSize('5')
    setCharTarget('')
    setCharUSL('')
    setCharLSL('')
    setCharMqttTopic('')
    setShowAddCharModal(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading hierarchy...</div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Left panel - Hierarchy tree */}
      <div className="w-80 flex-shrink-0 border rounded-lg bg-card overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Hierarchy</h2>
          <button
            onClick={() => setShowAddNodeModal(true)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
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
          <div className="p-3 border-t">
            <button
              onClick={() => setShowAddCharModal(true)}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
                'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
              )}
            >
              <Plus className="h-4 w-4" />
              Add Characteristic
            </button>
          </div>
        )}
      </div>

      {/* Right panel - Characteristic form */}
      <div className="flex-1 border rounded-lg bg-card overflow-auto">
        {editingId || isCreatingNew ? (
          <CharacteristicForm characteristicId={editingId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <p>Select a characteristic from the hierarchy to edit</p>
            {selectedNodeId && (
              <button
                onClick={() => setShowAddCharModal(true)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
                  'bg-primary text-primary-foreground hover:bg-primary/90'
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Hierarchy Node</h3>
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="p-1 rounded hover:bg-muted"
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
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
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
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                  autoFocus
                />
              </div>

              {selectedNodeId && (
                <p className="text-sm text-muted-foreground">
                  Will be created under the selected node
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddNodeModal(false)}
                className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNode}
                disabled={!nodeName.trim() || createNode.isPending}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {createNode.isPending ? 'Creating...' : 'Create Node'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Characteristic Modal */}
      {showAddCharModal && selectedNodeId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Characteristic</h3>
              <button
                onClick={() => setShowAddCharModal(false)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={charName}
                    onChange={(e) => setCharName(e.target.value)}
                    placeholder="e.g., Temperature"
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Provider Type</label>
                  <select
                    value={charProvider}
                    onChange={(e) => setCharProvider(e.target.value as 'MANUAL' | 'TAG')}
                    className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  >
                    {PROVIDER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Subgroup Size</label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={charSubgroupSize}
                  onChange={(e) => setCharSubgroupSize(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Number of measurements per sample (1-25)
                </p>
              </div>

              {charProvider === 'TAG' && (
                <div>
                  <label className="text-sm font-medium">MQTT Topic</label>
                  <input
                    type="text"
                    value={charMqttTopic}
                    onChange={(e) => setCharMqttTopic(e.target.value)}
                    placeholder="e.g., sensors/temp/value"
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Target</label>
                  <input
                    type="number"
                    step="any"
                    value={charTarget}
                    onChange={(e) => setCharTarget(e.target.value)}
                    placeholder="Optional"
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">USL</label>
                  <input
                    type="number"
                    step="any"
                    value={charUSL}
                    onChange={(e) => setCharUSL(e.target.value)}
                    placeholder="Optional"
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">LSL</label>
                  <input
                    type="number"
                    step="any"
                    value={charLSL}
                    onChange={(e) => setCharLSL(e.target.value)}
                    placeholder="Optional"
                    className="w-full mt-1 px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAddCharModal(false)}
                className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCharacteristic}
                disabled={!charName.trim() || createChar.isPending}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {createChar.isPending ? 'Creating...' : 'Create Characteristic'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
