import { useState } from 'react'
import { usePlants, useCreatePlant, useUpdatePlant, useDeletePlant } from '@/api/hooks'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Factory, Loader2, AlertCircle, Pencil, X, Power, PowerOff } from 'lucide-react'
import type { Plant, PlantCreate, PlantUpdate } from '@/types'

/**
 * Plant management settings component
 *
 * Allows admins to:
 * - View all plants with active/inactive status
 * - Create new plants with name, code, and settings
 * - Edit existing plants
 * - Activate/deactivate plants
 * - Delete plants (except Default)
 */
export function PlantSettings() {
  const { data: plants, isLoading, error } = usePlants() // All plants, not just active
  const createPlant = useCreatePlant()
  const updatePlant = useUpdatePlant()
  const deletePlant = useDeletePlant()

  // Create form state
  const [newPlantName, setNewPlantName] = useState('')
  const [newPlantCode, setNewPlantCode] = useState('')
  const [newPlantSettings, setNewPlantSettings] = useState('')

  // Edit modal state
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editSettings, setEditSettings] = useState('')

  // Delete confirmation state
  const [plantToDelete, setPlantToDelete] = useState<{ id: number; name: string } | null>(null)

  const handleCreate = async () => {
    if (!newPlantName || !newPlantCode) return

    let settings: Record<string, unknown> | null = null
    if (newPlantSettings.trim()) {
      try {
        settings = JSON.parse(newPlantSettings)
      } catch {
        // Invalid JSON - will be caught by backend validation
      }
    }

    try {
      const data: PlantCreate = {
        name: newPlantName,
        code: newPlantCode.toUpperCase(),
        settings,
      }
      await createPlant.mutateAsync(data)
      setNewPlantName('')
      setNewPlantCode('')
      setNewPlantSettings('')
    } catch {
      // Error is handled by the hook
    }
  }

  const openEditModal = (plant: Plant) => {
    setEditingPlant(plant)
    setEditName(plant.name)
    setEditCode(plant.code)
    setEditSettings(plant.settings ? JSON.stringify(plant.settings, null, 2) : '')
  }

  const handleEdit = async () => {
    if (!editingPlant || !editName || !editCode) return

    let settings: Record<string, unknown> | null = null
    if (editSettings.trim()) {
      try {
        settings = JSON.parse(editSettings)
      } catch {
        // Invalid JSON - will be caught by backend validation
      }
    }

    try {
      const data: PlantUpdate = {
        name: editName,
        code: editCode.toUpperCase(),
        settings,
      }
      await updatePlant.mutateAsync({ id: editingPlant.id, data })
      setEditingPlant(null)
    } catch {
      // Error is handled by the hook
    }
  }

  const handleToggleActive = async (plant: Plant) => {
    try {
      await updatePlant.mutateAsync({
        id: plant.id,
        data: { is_active: !plant.is_active },
      })
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
        <p className="text-destructive">Failed to load sites</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Plant List */}
      <div className="bg-muted rounded-xl divide-y divide-border">
        {plants?.map((plant) => (
          <div key={plant.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Factory className={cn('h-5 w-5', plant.is_active ? 'text-muted-foreground' : 'text-muted-foreground/50')} />
              <div>
                <div className="flex items-center gap-2">
                  <p className={cn('font-medium', !plant.is_active && 'text-muted-foreground')}>{plant.name}</p>
                  {!plant.is_active && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Inactive</span>
                  )}
                  {plant.code === 'DEFAULT' && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Default</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{plant.code}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Edit button */}
              <button
                onClick={() => openEditModal(plant)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Edit site"
              >
                <Pencil className="h-4 w-4" />
              </button>

              {/* Activate/Deactivate toggle (not for DEFAULT) */}
              {plant.code !== 'DEFAULT' && (
                <button
                  onClick={() => handleToggleActive(plant)}
                  disabled={updatePlant.isPending}
                  className={cn(
                    'p-2 rounded-lg transition-colors',
                    plant.is_active
                      ? 'hover:bg-warning/10 hover:text-warning'
                      : 'hover:bg-success/10 hover:text-success'
                  )}
                  title={plant.is_active ? 'Deactivate site' : 'Activate site'}
                >
                  {plant.is_active ? (
                    <PowerOff className="h-4 w-4" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                </button>
              )}

              {/* Delete button (only for inactive, non-DEFAULT plants) */}
              {plant.code !== 'DEFAULT' && !plant.is_active && (
                <button
                  onClick={() => setPlantToDelete({ id: plant.id, name: plant.name })}
                  className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors"
                  title="Delete site"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {plant.code === 'DEFAULT' && (
                <span className="text-xs text-muted-foreground px-2">Protected</span>
              )}
            </div>
          </div>
        ))}

        {plants?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No sites configured
          </div>
        )}
      </div>

      {/* Add New Plant Form */}
      <div className="bg-muted rounded-xl p-6 space-y-4">
        <h3 className="font-medium">Add New Site</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Site Name</label>
            <input
              type="text"
              value={newPlantName}
              onChange={(e) => setNewPlantName(e.target.value)}
              placeholder="e.g., Chicago Factory"
              className="w-full mt-1 px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Code</label>
            <input
              type="text"
              value={newPlantCode}
              onChange={(e) => setNewPlantCode(e.target.value.toUpperCase())}
              placeholder="e.g., CHI"
              maxLength={10}
              className="w-full mt-1 px-3 py-2 border rounded-lg uppercase"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Uppercase letters, numbers, underscores, or hyphens (max 10 chars)
            </p>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Settings (JSON, optional)</label>
          <textarea
            value={newPlantSettings}
            onChange={(e) => setNewPlantSettings(e.target.value)}
            placeholder='{"timezone": "America/Chicago", "language": "en"}'
            rows={3}
            className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-sm"
          />
        </div>
        <div className="flex justify-end">
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
            {createPlant.isPending ? 'Creating...' : 'Add Site'}
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {editingPlant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingPlant(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Site</h3>
              <button
                onClick={() => setEditingPlant(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Site Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Code</label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                  maxLength={10}
                  className="w-full mt-1 px-3 py-2 border rounded-lg uppercase"
                  disabled={editingPlant.code === 'DEFAULT'}
                />
                {editingPlant.code === 'DEFAULT' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Default site code cannot be changed
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Settings (JSON)</label>
                <textarea
                  value={editSettings}
                  onChange={(e) => setEditSettings(e.target.value)}
                  placeholder='{"timezone": "America/Chicago"}'
                  rows={4}
                  className="w-full mt-1 px-3 py-2 border rounded-lg font-mono text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingPlant(null)}
                disabled={updatePlant.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleEdit}
                disabled={!editName || !editCode || updatePlant.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50'
                )}
              >
                {updatePlant.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {plantToDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setPlantToDelete(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Delete Site?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{plantToDelete.name}</strong>?
              This will also delete all hierarchies, characteristics, and data associated with this site.
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
                {deletePlant.isPending ? 'Deleting...' : 'Delete Site'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
