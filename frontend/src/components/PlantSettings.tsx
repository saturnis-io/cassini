import { useState } from 'react'
import { usePlants, useCreatePlant, useDeletePlant } from '@/api/hooks'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Factory, Loader2, AlertCircle } from 'lucide-react'

/**
 * Plant management settings component
 *
 * Allows admins to:
 * - View all plants
 * - Create new plants
 * - Delete plants (except Default)
 */
export function PlantSettings() {
  const { data: plants, isLoading, error } = usePlants()
  const createPlant = useCreatePlant()
  const deletePlant = useDeletePlant()

  const [newPlantName, setNewPlantName] = useState('')
  const [newPlantCode, setNewPlantCode] = useState('')
  const [plantToDelete, setPlantToDelete] = useState<{ id: number; name: string } | null>(null)

  const handleCreate = async () => {
    if (!newPlantName || !newPlantCode) return

    try {
      await createPlant.mutateAsync({
        name: newPlantName,
        code: newPlantCode.toUpperCase(),
      })
      setNewPlantName('')
      setNewPlantCode('')
    } catch {
      // Error is handled by the hook
    }
  }

  const handleDelete = async () => {
    if (!plantToDelete) return

    try {
      await deletePlant.mutateAsync(plantToDelete.id)
      setPlantToDelete(null)
    } catch {
      // Error is handled by the hook
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">Failed to load plants</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Plant Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage plant locations for data isolation. Each plant has its own hierarchy, characteristics, and MQTT brokers.
        </p>
      </div>

      {/* Plant List */}
      <div className="border rounded-lg divide-y">
        {plants?.map((plant) => (
          <div key={plant.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Factory className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{plant.name}</p>
                <p className="text-sm text-muted-foreground">{plant.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!plant.is_active && (
                <span className="text-xs bg-muted px-2 py-1 rounded">Inactive</span>
              )}
              {plant.code !== 'DEFAULT' && (
                <button
                  onClick={() => setPlantToDelete({ id: plant.id, name: plant.name })}
                  className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Delete plant"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {plant.code === 'DEFAULT' && (
                <span className="text-xs text-muted-foreground">Protected</span>
              )}
            </div>
          </div>
        ))}

        {plants?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No plants configured
          </div>
        )}
      </div>

      {/* Add New Plant Form */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Add New Plant</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Plant Name</label>
            <input
              type="text"
              value={newPlantName}
              onChange={(e) => setNewPlantName(e.target.value)}
              placeholder="e.g., Chicago Factory"
              className="w-full mt-1 px-3 py-2 border rounded-lg"
            />
          </div>
          <div className="w-32">
            <label className="text-sm font-medium">Code</label>
            <input
              type="text"
              value={newPlantCode}
              onChange={(e) => setNewPlantCode(e.target.value.toUpperCase())}
              placeholder="e.g., CHI"
              maxLength={10}
              className="w-full mt-1 px-3 py-2 border rounded-lg uppercase"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreate}
              disabled={!newPlantName || !newPlantCode || createPlant.isPending}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Plus className="h-4 w-4" />
              {createPlant.isPending ? 'Creating...' : 'Add Plant'}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Code must be uppercase letters, numbers, underscores, or hyphens (max 10 characters).
        </p>
      </div>

      {/* Delete Confirmation Dialog */}
      {plantToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPlantToDelete(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Plant?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{plantToDelete.name}</strong>?
              This will also delete all hierarchies, characteristics, and data associated with this plant.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPlantToDelete(null)}
                disabled={deletePlant.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePlant.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50'
                )}
              >
                {deletePlant.isPending ? 'Deleting...' : 'Delete Plant'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
