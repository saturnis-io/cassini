import { useEffect, useState } from 'react'
import { useCharacteristic, useUpdateCharacteristic, useRecalculateLimits } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'

interface CharacteristicFormProps {
  characteristicId: number | null
}

const NELSON_RULES = [
  { id: 1, name: 'Rule 1', description: 'Point beyond 3-sigma' },
  { id: 2, name: 'Rule 2', description: '9 points same side of center' },
  { id: 3, name: 'Rule 3', description: '6 points trending up/down' },
  { id: 4, name: 'Rule 4', description: '14 points alternating' },
  { id: 5, name: 'Rule 5', description: '2 of 3 beyond 2-sigma' },
  { id: 6, name: 'Rule 6', description: '4 of 5 beyond 1-sigma' },
  { id: 7, name: 'Rule 7', description: '15 points in zone C' },
  { id: 8, name: 'Rule 8', description: '8 points outside zone C' },
]

export function CharacteristicForm({ characteristicId }: CharacteristicFormProps) {
  const { data: characteristic, isLoading } = useCharacteristic(characteristicId ?? 0)
  const updateCharacteristic = useUpdateCharacteristic()
  const recalculateLimits = useRecalculateLimits()
  const setIsDirty = useConfigStore((state) => state.setIsDirty)
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

  const [formData, setFormData] = useState({
    name: '',
    target: '',
    usl: '',
    lsl: '',
    subgroup_size: '1',
    sample_interval_minutes: '',
    enabled_rules: [] as number[],
  })

  useEffect(() => {
    if (characteristic) {
      setFormData({
        name: characteristic.name,
        target: characteristic.target?.toString() ?? '',
        usl: characteristic.usl?.toString() ?? '',
        lsl: characteristic.lsl?.toString() ?? '',
        subgroup_size: characteristic.subgroup_size.toString(),
        sample_interval_minutes: characteristic.sample_interval_minutes?.toString() ?? '',
        enabled_rules: characteristic.enabled_rules,
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

  const handleChange = (field: string, value: string | number[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const toggleRule = (ruleId: number) => {
    const newRules = formData.enabled_rules.includes(ruleId)
      ? formData.enabled_rules.filter((id) => id !== ruleId)
      : [...formData.enabled_rules, ruleId]
    handleChange('enabled_rules', newRules)
  }

  const handleSave = async () => {
    if (!characteristicId) return

    await updateCharacteristic.mutateAsync({
      id: characteristicId,
      data: {
        name: formData.name,
        target: formData.target ? parseFloat(formData.target) : null,
        usl: formData.usl ? parseFloat(formData.usl) : null,
        lsl: formData.lsl ? parseFloat(formData.lsl) : null,
        subgroup_size: parseInt(formData.subgroup_size),
        sample_interval_minutes: formData.sample_interval_minutes
          ? parseInt(formData.sample_interval_minutes)
          : null,
        enabled_rules: formData.enabled_rules,
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
                value={formData.target}
                onChange={(e) => handleChange('target', e.target.value)}
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
          <div className="grid grid-cols-3 gap-4">
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
              <label className="text-sm font-medium text-muted-foreground">Center Line</label>
              <input
                type="text"
                value={characteristic.center_line?.toFixed(4) ?? '-'}
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

        {/* Sampling */}
        <div className="space-y-4">
          <h3 className="font-medium">Sampling Configuration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Subgroup Size</label>
              <input
                type="number"
                min="1"
                value={formData.subgroup_size}
                onChange={(e) => handleChange('subgroup_size', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Sample Interval (minutes)</label>
              <input
                type="number"
                min="1"
                value={formData.sample_interval_minutes}
                onChange={(e) => handleChange('sample_interval_minutes', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="Optional"
              />
            </div>
          </div>
        </div>

        {/* Nelson Rules */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Nelson Rules</h3>
            <div className="space-x-2">
              <button
                onClick={() => handleChange('enabled_rules', NELSON_RULES.map((r) => r.id))}
                className="text-xs text-primary hover:underline"
              >
                Enable All
              </button>
              <button
                onClick={() => handleChange('enabled_rules', [])}
                className="text-xs text-muted-foreground hover:underline"
              >
                Disable All
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {NELSON_RULES.map((rule) => (
              <label
                key={rule.id}
                className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={formData.enabled_rules.includes(rule.id)}
                  onChange={() => toggleRule(rule.id)}
                  className="rounded"
                />
                <span className="text-sm">
                  <span className="font-medium">{rule.name}:</span>{' '}
                  <span className="text-muted-foreground">{rule.description}</span>
                </span>
              </label>
            ))}
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
