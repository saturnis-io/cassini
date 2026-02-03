import { useHierarchyTree } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { HierarchyTree } from '@/components/HierarchyTree'
import { CharacteristicForm } from '@/components/CharacteristicForm'

export function ConfigurationView() {
  const { data: hierarchy, isLoading } = useHierarchyTree()
  const editingId = useConfigStore((state) => state.editingCharacteristicId)
  const isCreatingNew = useConfigStore((state) => state.isCreatingNew)

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
        <div className="p-4 border-b">
          <h2 className="font-semibold">Hierarchy</h2>
        </div>
        <div className="p-2">
          <HierarchyTree nodes={hierarchy ?? []} />
        </div>
      </div>

      {/* Right panel - Characteristic form */}
      <div className="flex-1 border rounded-lg bg-card overflow-auto">
        {editingId || isCreatingNew ? (
          <CharacteristicForm characteristicId={editingId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a characteristic from the hierarchy to edit, or click "Add" to create a new one
          </div>
        )}
      </div>
    </div>
  )
}
