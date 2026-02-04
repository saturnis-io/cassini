import { useEffect, useState, useRef } from 'react'
import { useCharacteristic, useUpdateCharacteristic, useRecalculateLimits, useChangeMode } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'
import { NelsonRulesConfigPanel, type NelsonRulesConfigPanelRef } from './NelsonRulesConfigPanel'
import { HelpTooltip } from './HelpTooltip'
import type { SubgroupMode } from '@/types'

interface CharacteristicFormProps {
  characteristicId: number | null
}

export function CharacteristicForm({ characteristicId }: CharacteristicFormProps) {
  const { data: characteristic, isLoading } = useCharacteristic(characteristicId ?? 0)
  const updateCharacteristic = useUpdateCharacteristic()
  const recalculateLimits = useRecalculateLimits()
  const changeMode = useChangeMode()
  const setIsDirty = useConfigStore((state) => state.setIsDirty)
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_value: '',
    usl: '',
    lsl: '',
    subgroup_mode: 'NOMINAL_TOLERANCE' as SubgroupMode,
    min_measurements: '1',
    warn_below_count: '',
    decimal_precision: '3',
  })

  // Mode change confirmation dialog state
  const [pendingModeChange, setPendingModeChange] = useState<SubgroupMode | null>(null)
  const [showModeDialog, setShowModeDialog] = useState(false)

  // Ref for Nelson Rules panel
  const nelsonRulesRef = useRef<NelsonRulesConfigPanelRef>(null)

  useEffect(() => {
    if (characteristic) {
      setFormData({
        name: characteristic.name,
        description: characteristic.description ?? '',
        target_value: characteristic.target_value?.toString() ?? '',
        usl: characteristic.usl?.toString() ?? '',
        lsl: characteristic.lsl?.toString() ?? '',
        subgroup_mode: characteristic.subgroup_mode ?? 'NOMINAL_TOLERANCE',
        min_measurements: characteristic.min_measurements?.toString() ?? '1',
        warn_below_count: characteristic.warn_below_count?.toString() ?? '',
        decimal_precision: characteristic.decimal_precision?.toString() ?? '3',
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

  const handleModeChange = (newMode: string) => {
    // If changing mode and characteristic has samples, show confirmation
    if (newMode !== formData.subgroup_mode && characteristic?.ucl !== null) {
      setPendingModeChange(newMode as SubgroupMode)
      setShowModeDialog(true)
    } else {
      handleChange('subgroup_mode', newMode)
    }
  }

  const confirmModeChange = async () => {
    if (!characteristicId || !pendingModeChange) return

    try {
      await changeMode.mutateAsync({ id: characteristicId, newMode: pendingModeChange })
      setFormData((prev) => ({ ...prev, subgroup_mode: pendingModeChange }))
      setShowModeDialog(false)
      setPendingModeChange(null)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to change mode')
    }
  }

  const cancelModeChange = () => {
    setShowModeDialog(false)
    setPendingModeChange(null)
  }

  const handleSave = async () => {
    if (!characteristicId) return

    // Validate subgroup mode configuration
    const minMeas = parseInt(formData.min_measurements) || 1
    const warnBelow = formData.warn_below_count ? parseInt(formData.warn_below_count) : null

    if (minMeas > characteristic.subgroup_size) {
      alert('Minimum measurements cannot exceed subgroup size')
      return
    }
    if (warnBelow !== null && warnBelow < minMeas) {
      alert('Warn below count must be >= minimum measurements')
      return
    }

    await updateCharacteristic.mutateAsync({
      id: characteristicId,
      data: {
        name: formData.name,
        description: formData.description || null,
        target_value: formData.target_value ? parseFloat(formData.target_value) : null,
        usl: formData.usl ? parseFloat(formData.usl) : null,
        lsl: formData.lsl ? parseFloat(formData.lsl) : null,
        subgroup_mode: formData.subgroup_mode,
        min_measurements: minMeas,
        warn_below_count: warnBelow,
        decimal_precision: parseInt(formData.decimal_precision) || 3,
      },
    })

    // Save Nelson rules if panel has changes
    if (nelsonRulesRef.current?.isDirty) {
      await nelsonRulesRef.current.save()
    }

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

        {/* Display Settings */}
        <div className="space-y-4">
          <h3 className="font-medium">Display Settings</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Decimal Precision</label>
              <input
                type="number"
                min="0"
                max="10"
                value={formData.decimal_precision}
                onChange={(e) => handleChange('decimal_precision', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Number of decimal places for chart and display values (0-10)
              </p>
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

        {/* Subgroup Size Handling */}
        <div className="space-y-4">
          <h3 className="font-medium">Subgroup Size Handling</h3>
          <div>
            <label className="text-sm font-medium">Mode</label>
            <select
              value={formData.subgroup_mode}
              onChange={(e) => handleModeChange(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
              disabled={changeMode.isPending}
            >
              <option value="NOMINAL_TOLERANCE">Nominal with Tolerance (Default)</option>
              <option
                value="VARIABLE_LIMITS"
                disabled={!characteristic.stored_sigma}
              >
                Variable Control Limits {!characteristic.stored_sigma && '(Recalculate limits first)'}
              </option>
              <option
                value="STANDARDIZED"
                disabled={!characteristic.stored_sigma}
              >
                Standardized (Z-Score) {!characteristic.stored_sigma && '(Recalculate limits first)'}
              </option>
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              {formData.subgroup_mode === 'NOMINAL_TOLERANCE' &&
                'Uses nominal subgroup size for control limits with minimum threshold enforcement.'}
              {formData.subgroup_mode === 'VARIABLE_LIMITS' &&
                'Recalculates control limits per point based on actual sample size (funnel effect).'}
              {formData.subgroup_mode === 'STANDARDIZED' &&
                'Plots Z-scores with fixed +/-3 control limits, normalizing for sample size variation.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Minimum Measurements</label>
              <input
                type="number"
                min="1"
                max={characteristic.subgroup_size}
                value={formData.min_measurements}
                onChange={(e) => handleChange('min_measurements', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Samples below this will be rejected (1-{characteristic.subgroup_size})
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Warn Below Count</label>
              <input
                type="number"
                min={parseInt(formData.min_measurements) || 1}
                max={characteristic.subgroup_size}
                value={formData.warn_below_count}
                onChange={(e) => handleChange('warn_below_count', e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-md"
                placeholder="Optional"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Samples below this will be marked as undersized
              </p>
            </div>
          </div>

          {/* Show stored parameters for Mode A/B */}
          {(formData.subgroup_mode === 'STANDARDIZED' ||
            formData.subgroup_mode === 'VARIABLE_LIMITS') && (
            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm font-medium mb-2">Stored Parameters (from limit calculation)</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Sigma: </span>
                  <span>{characteristic.stored_sigma?.toFixed(4) ?? 'Not set'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Center Line: </span>
                  <span>{characteristic.stored_center_line?.toFixed(4) ?? 'Not set'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nelson Rules Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">Nelson Rules</h3>
            <HelpTooltip helpKey="nelson-rules-overview" />
          </div>
          <p className="text-sm text-muted-foreground">
            Enable or disable specific Nelson rules for detecting out-of-control conditions.
          </p>
          <NelsonRulesConfigPanel
            ref={nelsonRulesRef}
            characteristicId={characteristicId!}
            onDirty={() => setIsDirty(true)}
          />
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

      {/* Mode Change Confirmation Dialog */}
      {showModeDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Change Subgroup Mode?</h3>
            <p className="text-muted-foreground mb-4">
              This will recalculate all historical samples with the new mode's values.
              This operation cannot be undone.
            </p>
            <div className="bg-muted p-4 rounded-xl mb-4">
              <div className="text-sm">
                <span className="text-muted-foreground">From: </span>
                <span className="font-medium">{formData.subgroup_mode}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">To: </span>
                <span className="font-medium">{pendingModeChange}</span>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelModeChange}
                disabled={changeMode.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmModeChange}
                disabled={changeMode.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-primary text-primary-foreground',
                  'disabled:opacity-50'
                )}
              >
                {changeMode.isPending ? 'Migrating...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
