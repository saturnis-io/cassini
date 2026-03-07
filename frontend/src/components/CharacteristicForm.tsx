import { useEffect, useState, useRef } from 'react'
import {
  useCharacteristic,
  useUpdateCharacteristic,
  useRecalculateLimits,
  useSetManualLimits,
  useChangeMode,
  useDeleteCharacteristic,
  useCharacteristicConfig,
  useUpdateCharacteristicConfig,
  useHierarchyPath,
} from '@/api/hooks'
import { useConfigStore } from '@/stores/configStore'
import { cn } from '@/lib/utils'
import { useFormValidation } from '@/hooks/useFormValidation'
import { characteristicFormSchema } from '@/schemas/characteristics'
import { ArrowLeft, Trash2 } from 'lucide-react'
import {
  CharacteristicConfigTabs,
  type TabId,
} from './characteristic-config/CharacteristicConfigTabs'
import { GeneralTab } from './characteristic-config/GeneralTab'
import { LimitsTab } from './characteristic-config/LimitsTab'
import { SamplingTab } from './characteristic-config/SamplingTab'
import { RulesTab, type RulesTabRef } from './characteristic-config/RulesTab'
import { MaterialOverridesTab } from './characteristic-config/MaterialOverridesTab'
import type { ScheduleConfig, ScheduleType } from './ScheduleConfigSection'
import type { SubgroupMode } from '@/types'

interface CharacteristicFormProps {
  characteristicId: number | null
}

export function CharacteristicForm({ characteristicId }: CharacteristicFormProps) {
  const { data: characteristic, isLoading } = useCharacteristic(characteristicId ?? 0)
  const { data: configData } = useCharacteristicConfig(characteristicId)
  const hierarchyPath = useHierarchyPath(characteristicId)
  const updateCharacteristic = useUpdateCharacteristic()
  const updateConfig = useUpdateCharacteristicConfig()
  const recalculateLimits = useRecalculateLimits()
  const setManualLimits = useSetManualLimits()
  const changeMode = useChangeMode()
  const deleteCharacteristic = useDeleteCharacteristic()
  const isDirty = useConfigStore((state) => state.isDirty)
  const setIsDirty = useConfigStore((state) => state.setIsDirty)
  const setEditingCharacteristicId = useConfigStore((state) => state.setEditingCharacteristicId)

  const { validate, clearErrors } = useFormValidation(characteristicFormSchema)

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
    chart_type: '' as '' | 'cusum' | 'ewma',
    cusum_target: '',
    cusum_k: '',
    cusum_h: '',
    ewma_lambda: '',
    ewma_l: '',
    short_run_mode: '' as '' | 'deviation' | 'standardized',
    use_laney_correction: false,
    sigma_method: '' as '' | 'r_bar_d2' | 's_bar_c4' | 'moving_range',
  })

  // Mode change confirmation dialog state
  const [pendingModeChange, setPendingModeChange] = useState<SubgroupMode | null>(null)
  const [showModeDialog, setShowModeDialog] = useState(false)

  // Delete confirmation dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Schedule configuration state (for MANUAL characteristics)
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({
    type: 'NONE',
  })

  // Ref for Rules tab
  const rulesTabRef = useRef<RulesTabRef>(null)

  // Sync form data from fetched characteristic - this is intentional initialization

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
        chart_type: characteristic.chart_type ?? '',
        cusum_target: characteristic.cusum_target?.toString() ?? '',
        cusum_k: characteristic.cusum_k?.toString() ?? '',
        cusum_h: characteristic.cusum_h?.toString() ?? '',
        ewma_lambda: characteristic.ewma_lambda?.toString() ?? '',
        ewma_l: characteristic.ewma_l?.toString() ?? '',
        short_run_mode: characteristic.short_run_mode ?? '',
        use_laney_correction: characteristic.use_laney_correction ?? false,
        sigma_method: characteristic.sigma_method ?? '',
      })
      setIsDirty(false)
      clearErrors()
    }
  }, [characteristic, setIsDirty, clearErrors])

  // Load schedule config from backend - intentional sync from fetched data

  useEffect(() => {
    if (configData?.config?.schedule) {
      // Backend uses different field names than frontend ScheduleConfig type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const backendSchedule = configData.config.schedule as any
      setScheduleConfig({
        type: backendSchedule.schedule_type as ScheduleType,
        interval_minutes: backendSchedule.interval_minutes,
        align_to_hour: backendSchedule.align_to_hour,
        shift_count: backendSchedule.shift_count,
        shift_times: backendSchedule.shift_times,
        samples_per_shift: backendSchedule.samples_per_shift,
        cron_expression: backendSchedule.cron_expression,
        batch_tag: backendSchedule.batch_tag_path,
        delay_minutes: backendSchedule.delay_minutes,
      })
    }
  }, [configData])

  if (isLoading || !characteristic) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }

  const handleModeChange = (newMode: string) => {
    const hasSamplesToMigrate = characteristic?.stored_sigma !== null
    if (newMode !== formData.subgroup_mode && hasSamplesToMigrate) {
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

  const handleScheduleChange = (config: ScheduleConfig) => {
    setScheduleConfig(config)
    setIsDirty(true)
  }

  const handleSave = async () => {
    if (!characteristicId) return

    // Validate via schema — includes name, spec limits (USL > LSL), subgroup constraints
    const validated = validate({
      ...formData,
      subgroup_size: characteristic.subgroup_size,
    })
    if (!validated) return

    await updateCharacteristic.mutateAsync({
      id: characteristicId,
      data: {
        name: validated.name,
        description: validated.description || null,
        target_value: validated.target_value ?? null,
        usl: validated.usl ?? null,
        lsl: validated.lsl ?? null,
        subgroup_mode: validated.subgroup_mode as SubgroupMode,
        min_measurements: validated.min_measurements,
        warn_below_count: validated.warn_below_count ?? null,
        decimal_precision: validated.decimal_precision,
        chart_type: (validated.chart_type || null) as 'cusum' | 'ewma' | null,
        cusum_target: validated.cusum_target ?? null,
        cusum_k: validated.cusum_k ?? null,
        cusum_h: validated.cusum_h ?? null,
        ewma_lambda: validated.ewma_lambda ?? null,
        ewma_l: validated.ewma_l ?? null,
        short_run_mode: (validated.short_run_mode || null) as 'deviation' | 'standardized' | null,
        use_laney_correction: validated.use_laney_correction,
        sigma_method: (validated.sigma_method || null) as
          | 'r_bar_d2'
          | 's_bar_c4'
          | 'moving_range'
          | null,
      },
    })

    // Save schedule config for MANUAL characteristics (no data source = manual)
    if (!characteristic.data_source && characteristicId) {
      const schedulePayload =
        scheduleConfig.type === 'NONE'
          ? { schedule_type: 'NONE' }
          : {
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
            }

      await updateConfig.mutateAsync({
        id: characteristicId,
        config: {
          config_type: 'MANUAL',
          instructions: '',
          schedule: schedulePayload,
          grace_period_minutes: 30,
        },
      })
    }

    // Save Nelson rules if tab has changes
    if (rulesTabRef.current?.isDirty) {
      await rulesTabRef.current.save()
    }

    setIsDirty(false)
  }

  const handleRecalculate = async (options?: {
    excludeOoc?: boolean
    startDate?: string
    endDate?: string
    lastN?: number
  }) => {
    if (!characteristicId) return
    await recalculateLimits.mutateAsync({
      id: characteristicId,
      excludeOoc: options?.excludeOoc ?? true,
      startDate: options?.startDate,
      endDate: options?.endDate,
      lastN: options?.lastN,
    })
  }

  const handleSetManualLimits = async (data: {
    ucl: number
    lcl: number
    center_line: number
    sigma: number
  }) => {
    if (!characteristicId) return
    await setManualLimits.mutateAsync({ id: characteristicId, data })
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

  const handleClose = () => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to close?')
      if (!confirmed) return
    }
    setEditingCharacteristicId(null)
  }

  // Render tab content based on active tab
  const renderTabContent = (activeTab: TabId) => {
    switch (activeTab) {
      case 'general':
        return (
          <GeneralTab
            formData={{
              name: formData.name,
              description: formData.description,
              decimal_precision: formData.decimal_precision,
            }}
            characteristic={{
              data_source: characteristic.data_source,
              hierarchy_id: characteristic.hierarchy_id,
              created_at: characteristic.created_at,
              updated_at: characteristic.updated_at,
              sample_count: characteristic.sample_count,
            }}
            characteristicId={characteristicId!}
            hierarchyPath={hierarchyPath}
            onChange={handleChange}
          />
        )
      case 'limits':
        return (
          <LimitsTab
            formData={{
              target_value: formData.target_value,
              usl: formData.usl,
              lsl: formData.lsl,
              subgroup_mode: formData.subgroup_mode,
              chart_type: formData.chart_type,
              cusum_target: formData.cusum_target,
              cusum_k: formData.cusum_k,
              cusum_h: formData.cusum_h,
              ewma_lambda: formData.ewma_lambda,
              ewma_l: formData.ewma_l,
              short_run_mode: formData.short_run_mode,
              use_laney_correction: formData.use_laney_correction,
              sigma_method: formData.sigma_method,
            }}
            dataType={characteristic.data_type}
            characteristic={{
              ucl: characteristic.ucl,
              lcl: characteristic.lcl,
              stored_sigma: characteristic.stored_sigma,
              stored_center_line: characteristic.stored_center_line,
              sample_count: characteristic.sample_count,
              attribute_chart_type: characteristic.attribute_chart_type,
              subgroup_size: characteristic.subgroup_size,
            }}
            onChange={handleChange}
            onRecalculate={handleRecalculate}
            onSetManualLimits={handleSetManualLimits}
            isRecalculating={recalculateLimits.isPending}
            isSettingManual={setManualLimits.isPending}
          />
        )
      case 'sampling':
        return (
          <SamplingTab
            formData={{
              subgroup_mode: formData.subgroup_mode,
              min_measurements: formData.min_measurements,
              warn_below_count: formData.warn_below_count,
            }}
            characteristic={{
              subgroup_size: characteristic.subgroup_size,
              is_manual: !characteristic.data_source,
              stored_sigma: characteristic.stored_sigma,
              stored_center_line: characteristic.stored_center_line,
            }}
            scheduleConfig={scheduleConfig}
            onChange={handleChange}
            onScheduleChange={handleScheduleChange}
            onModeChange={handleModeChange}
            isModeChangePending={changeMode.isPending}
          />
        )
      case 'rules':
        return (
          <RulesTab
            ref={rulesTabRef}
            characteristicId={characteristicId!}
            dataType={characteristic.data_type as 'variable' | 'attribute'}
            onDirty={() => setIsDirty(true)}
          />
        )
      case 'material-overrides':
        return (
          <MaterialOverridesTab
            characteristicId={characteristicId!}
            plantId={characteristic?.plant_id ?? 0}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="hover:bg-muted rounded-lg p-1.5 transition-colors"
            title="Back to list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="font-semibold">{characteristic.name}</h2>
            <p className="text-muted-foreground text-xs">
              {!characteristic.data_source
                ? 'Manual Entry'
                : characteristic.data_source.type.toUpperCase()}{' '}
              • Subgroup size: {characteristic.subgroup_size}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="text-destructive hover:bg-destructive/10 rounded-lg p-2 transition-colors"
          title="Delete characteristic"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Tabbed Content */}
      <CharacteristicConfigTabs isDirty={isDirty} className="min-h-0 flex-1">
        {renderTabContent}
      </CharacteristicConfigTabs>

      {/* Footer */}
      <div className="border-border bg-muted/30 flex items-center justify-between border-t px-5 py-4">
        <div className="text-sm">
          {isDirty && (
            <span className="text-warning flex items-center gap-1.5">
              <span className="bg-warning h-2 w-2 rounded-full" />
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateCharacteristic.isPending || !isDirty}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {updateCharacteristic.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Mode Change Confirmation Dialog */}
      {showModeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Change Subgroup Mode?</h3>
            <p className="text-muted-foreground mb-4">
              This will recalculate all historical samples with the new mode's values. This
              operation cannot be undone.
            </p>
            <div className="bg-muted mb-4 rounded-xl p-4">
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
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmModeChange}
                disabled={changeMode.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'disabled:opacity-50',
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Delete Characteristic?</h3>
            <p className="text-muted-foreground mb-4">
              Are you sure you want to delete <strong>{characteristic?.name}</strong>? This action
              cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteCharacteristic.isPending}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteCharacteristic.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  'bg-destructive text-destructive-foreground',
                  'disabled:opacity-50',
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
