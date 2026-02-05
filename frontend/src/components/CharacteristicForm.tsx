import { useEffect, useState, useRef } from 'react'
import { useCharacteristic, useUpdateCharacteristic, useRecalculateLimits, useChangeMode, useDeleteCharacteristic, useCharacteristicConfig, useUpdateCharacteristicConfig } from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'
import { NelsonRulesConfigPanel, type NelsonRulesConfigPanelRef } from './NelsonRulesConfigPanel'
import { ScheduleConfigSection, type ScheduleConfig } from './ScheduleConfigSection'
import { HelpTooltip } from './HelpTooltip'
import { NumberInput } from './NumberInput'
import type { SubgroupMode } from '@/types'

interface CharacteristicFormProps {
  characteristicId: number | null
}

export function CharacteristicForm({ characteristicId }: CharacteristicFormProps) {
  const { data: characteristic, isLoading } = useCharacteristic(characteristicId ?? 0)
  const { data: configData } = useCharacteristicConfig(characteristicId)
  const updateCharacteristic = useUpdateCharacteristic()
  const updateConfig = useUpdateCharacteristicConfig()
  const recalculateLimits = useRecalculateLimits()
  const changeMode = useChangeMode()
  const deleteCharacteristic = useDeleteCharacteristic()
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

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Schedule configuration state (for MANUAL characteristics)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    type: 'INTERVAL',
    interval_minutes: 120,
    align_to_hour: true,
  })

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

  // Load schedule config from backend
  useEffect(() => {
    if (configData?.config?.schedule) {
      setScheduleConfig(configData.config.schedule)
    }
  }, [configData])

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
    // If changing mode and characteristic has existing samples (indicated by stored_sigma),
    // show confirmation dialog since samples will need migration
    const hasSamplesToMigrate = characteristic?.stored_sigma !== null
    if (newMode !== formData.subgroup_mode && hasSamplesToMigrate) {
      setPendingModeChange(newMode as SubgroupMode)
      setShowModeDialog(true)
    } else {
      // No samples to migrate, just update the mode directly
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

    // Save schedule config for MANUAL characteristics
    if (characteristic.provider_type === 'MANUAL' && characteristicId) {
      await updateConfig.mutateAsync({
        id: characteristicId,
        config: {
          config_type: 'MANUAL',
          instructions: '',
          schedule: {
            schedule_type: scheduleConfig.type,
            ...(scheduleConfig.type === 'INTERVAL' && {
              interval_minutes: scheduleConfig.interval_minutes,
              align_to_hour: scheduleConfig.align_to_hour,
            }),
            ...(scheduleConfig.type === 'SHIFT' && {
              shift_count: scheduleConfig.shift_count,
              shift_times: scheduleConfig.shift_times,
              samples_per_shift: scheduleConfig.samples_per_shift,
            }),
            ...(scheduleConfig.type === 'CRON' && {
              cron_expression: scheduleConfig.cron_expression,
            }),
            ...(scheduleConfig.type === 'BATCH_START' && {
              batch_tag_path: scheduleConfig.batch_tag,
              delay_minutes: scheduleConfig.delay_minutes,
            }),
          },
          grace_period_minutes: 30,
        },
      })
    }

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

  const handleDelete = async () => {
    if (!characteristicId) return
    try {
      await deleteCharacteristic.mutateAsync(characteristicId)
      setEditingCharacteristicId(null)
    } catch {
      // Error toast is handled by the hook
    }
    setShowDeleteDialog(false)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Edit Characteristic</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDeleteDialog(true)}
            className="text-sm text-destructive hover:text-destructive/80"
          >
            Delete
          </button>
          <button
            onClick={() => setEditingCharacteristicId(null)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </div>
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
              <NumberInput
                min={0}
                max={10}
                value={formData.decimal_precision}
                onChange={(value) => handleChange('decimal_precision', value)}
                className="w-full mt-1"
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
              <NumberInput
                step="any"
                value={formData.target_value}
                onChange={(value) => handleChange('target_value', value)}
                className="w-full mt-1"
                placeholder="—"
              />
            </div>
            <div>
              <label className="text-sm font-medium">USL</label>
              <NumberInput
                step="any"
                value={formData.usl}
                onChange={(value) => handleChange('usl', value)}
                className="w-full mt-1"
                placeholder="—"
              />
            </div>
            <div>
              <label className="text-sm font-medium">LSL</label>
              <NumberInput
                step="any"
                value={formData.lsl}
                onChange={(value) => handleChange('lsl', value)}
                className="w-full mt-1"
                placeholder="—"
              />
            </div>
          </div>
        </div>

        {/* Control limits (read-only) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Control Limits (Calculated)</h3>
              <HelpTooltip helpKey={
                formData.subgroup_mode === 'STANDARDIZED' ? 'ucl-lcl-standardized' :
                formData.subgroup_mode === 'VARIABLE_LIMITS' ? 'ucl-lcl-variable' :
                'ucl-lcl-nominal'
              } />
            </div>
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

        {/* Schedule Configuration (MANUAL only) */}
        {characteristic.provider_type === 'MANUAL' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">Schedule Configuration</h3>
              <HelpTooltip helpKey="schedule-configuration" />
            </div>
            <p className="text-sm text-muted-foreground">
              Configure when manual measurements are due. This determines the schedule for operator data entry tasks.
            </p>
            <ScheduleConfigSection
              value={scheduleConfig}
              onChange={(config) => {
                setScheduleConfig(config)
                setIsDirty(true)
              }}
            />
          </div>
        )}

        {/* Subgroup Size Handling */}
        <div className="space-y-4">
          <h3 className="font-medium">Subgroup Size Handling</h3>
          <div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Mode</label>
              <HelpTooltip helpKey={
                formData.subgroup_mode === 'STANDARDIZED' ? 'subgroup-mode-standardized' :
                formData.subgroup_mode === 'VARIABLE_LIMITS' ? 'subgroup-mode-variable' :
                'subgroup-mode-nominal'
              } />
            </div>
            <select
              value={formData.subgroup_mode}
              onChange={(e) => handleModeChange(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
              disabled={changeMode.isPending}
            >
              <option value="NOMINAL_TOLERANCE">Nominal with Tolerance (Default)</option>
              <option value="VARIABLE_LIMITS">Variable Control Limits</option>
              <option value="STANDARDIZED">Standardized (Z-Score)</option>
            </select>
            {!characteristic.stored_sigma && formData.subgroup_mode !== 'NOMINAL_TOLERANCE' && (
              <p className="mt-1 text-xs text-warning">
                Note: Recalculate limits after adding samples for this mode to work correctly.
              </p>
            )}
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
              <NumberInput
                min={1}
                max={characteristic.subgroup_size}
                value={formData.min_measurements}
                onChange={(value) => handleChange('min_measurements', value)}
                className="w-full mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Samples below this will be rejected (1-{characteristic.subgroup_size})
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Warn Below Count</label>
              <NumberInput
                min={parseInt(formData.min_measurements) || 1}
                max={characteristic.subgroup_size}
                value={formData.warn_below_count}
                onChange={(value) => handleChange('warn_below_count', value)}
                className="w-full mt-1"
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
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium">Stored Parameters (from limit calculation)</p>
                {formData.subgroup_mode === 'STANDARDIZED' && (
                  <HelpTooltip helpKey="z-score" />
                )}
              </div>
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
              {formData.subgroup_mode === 'STANDARDIZED' && characteristic.stored_sigma && (
                <p className="text-xs text-muted-foreground mt-2">
                  Z-scores are calculated as: (Sample Mean - Center Line) / (Sigma / sqrt(n))
                </p>
              )}
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

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Delete Characteristic?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{characteristic?.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteCharacteristic.isPending}
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteCharacteristic.isPending}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50'
                )}
              >
                {deleteCharacteristic.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
