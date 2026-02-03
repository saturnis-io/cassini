import { useEffect, useState } from 'react'
import { useCharacteristic, useUpdateCharacteristic, useRecalculateLimits } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

interface CharacteristicFormProps {
  characteristicId: number | null
}

export function CharacteristicForm({ characteristicId }: CharacteristicFormProps) {
  const { data: characteristic, isLoading } = useCharacteristic(characteristicId ?? 0)
  const updateCharacteristic = useUpdateCharacteristic()
  const recalculateLimits = useRecalculateLimits()
  const setIsDirty = useConfigStore((state) => state.setIsDirty)
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_value: '',
    usl: '',
    lsl: '',
  })

  useEffect(() => {
    if (characteristic) {
      setFormData({
        name: characteristic.name,
        description: characteristic.description ?? '',
        target_value: characteristic.target_value?.toString() ?? '',
        usl: characteristic.usl?.toString() ?? '',
        lsl: characteristic.lsl?.toString() ?? '',
      })
      setIsDirty(false)
    }
  }, [characteristic, setIsDirty])

  if (isLoading || !characteristic) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleSave = async () => {
    if (!characteristicId) return

    await updateCharacteristic.mutateAsync({
      id: characteristicId,
      data: {
        name: formData.name,
        description: formData.description || null,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
        usl: formData.usl ? parseFloat(formData.usl) : null,
        lsl: formData.lsl ? parseFloat(formData.lsl) : null,
      },
    })
    setIsDirty(false)
  }

  const handleRecalculate = async () => {
    if (!characteristicId) return
    await recalculateLimits.mutateAsync({ id: characteristicId, excludeOoc: true })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Edit Characteristic</h2>
        <button
          onClick={() => setEditingCharacteristicId(null)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="space-y-6">
        {/* Basic info */}
        <div className="space-y-4">
          <h3 className="font-medium">Basic Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Provider Type</label>
              <input
                type="text"
                value={characteristic.provider_type}
                disabled
                className="w-full mt-1 px-3 py-2 border rounded-md bg-muted"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md"
              placeholder="Optional description"
            />
          </div>
        </div>

        {/* Spec limits */}
        <div className="space-y-4">
          <h3 className="font-medium">Specification Limits</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Target</label>
              <input
                type="number"
                step="any"
                value={formData.target_value}
                onChange={(e) => handleChange('target_value', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">USL</label>
              <input
                type="number"
                step="any"
                value={formData.usl}
                onChange={(e) => handleChange('usl', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">LSL</label>
              <input
                type="number"
                step="any"
                value={formData.lsl}
                onChange={(e) => handleChange('lsl', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
          </div>
        </div>

        {/* Control limits (read-only) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Control Limits (Calculated)</h3>
            <button
              onClick={handleRecalculate}
              disabled={recalculateLimits.isPending}
              className="text-sm text-primary hover:underline disabled:opacity-50"
            >
              {recalculateLimits.isPending ? 'Recalculating...' : 'Recalculate'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">UCL</label>
              <input
                type="text"
                value={characteristic.ucl?.toFixed(4) ?? '-'}
                disabled
                className="w-full mt-1 px-3 py-2 border rounded-md bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">LCL</label>
              <input
                type="text"
                value={characteristic.lcl?.toFixed(4) ?? '-'}
                disabled
                className="w-full mt-1 px-3 py-2 border rounded-md bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Sampling info (read-only) */}
        <div className="space-y-4">
          <h3 className="font-medium">Sampling Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Subgroup Size</label>
              <input
                type="text"
                value={characteristic.subgroup_size}
                disabled
                className="w-full mt-1 px-3 py-2 border rounded-md bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Hierarchy ID</label>
              <input
                type="text"
                value={characteristic.hierarchy_id}
                disabled
                className="w-full mt-1 px-3 py-2 border rounded-md bg-muted"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <button
            onClick={() => setEditingCharacteristicId(null)}
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateCharacteristic.isPending}
            className={cn(
              'px-4 py-2 text-sm rounded-md',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'disabled:opacity-50'
            )}
          >
            {updateCharacteristic.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
