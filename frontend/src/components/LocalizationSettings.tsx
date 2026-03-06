import { useState, useMemo } from 'react'
import { Globe, ChevronDown, ChevronRight, Save, Loader2, Hash, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSystemSettings, useUpdateSystemSettings } from '@/api/hooks'
import { useUpdatePlant } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import {
  DATE_PRESETS,
  DATETIME_PRESETS,
  FORMAT_TOKENS,
  applyFormat,
  validateFormatString,
} from '@/lib/date-format'
import {
  DEFAULT_FORMAT,
  DATE_PATTERN_PRESETS,
  SEPARATOR_OPTIONS,
  NUMBER_DIGITS_OPTIONS,
  validateFormat,
  getFormatWarnings,
  previewDisplayKey,
  setServerDisplayKeyFormat,
  type DisplayKeyFormat,
} from '@/lib/display-key'
import type { DisplayKeyFormatDTO } from '@/types'

const CUSTOM_KEY = '__custom__'

function findPresetKey(
  presets: readonly { key: string; format: string }[],
  format: string,
): string {
  const match = presets.find((p) => p.format === format)
  return match ? match.key : CUSTOM_KEY
}

// ---------------------------------------------------------------------------
// Format Picker — shared between system and plant sections
// ---------------------------------------------------------------------------

function FormatPicker({
  label,
  presets,
  value,
  onChange,
  includeSystemDefault,
}: {
  label: string
  presets: readonly { key: string; label: string; format: string }[]
  value: string
  onChange: (format: string) => void
  includeSystemDefault?: boolean
}) {
  // Track mode explicitly so selecting "Custom" stays in custom mode
  // even if the current value happens to match a preset
  const initialKey = value === '' ? '' : findPresetKey(presets, value)
  const [mode, setMode] = useState<string>(initialKey)
  const isCustom = mode === CUSTOM_KEY
  const [customValue, setCustomValue] = useState(initialKey === CUSTOM_KEY ? value : '')

  const preview = useMemo(() => {
    const fmt = isCustom ? customValue : value
    if (!fmt) return null
    try {
      return applyFormat(new Date(), fmt)
    } catch {
      return null
    }
  }, [isCustom, customValue, value])

  const handleSelectChange = (key: string) => {
    setMode(key)
    if (key === '') {
      onChange('')
      return
    }
    if (key === CUSTOM_KEY) {
      // Seed custom input with current value so user can edit from there
      const initial = customValue || value || 'YYYY-MM-DD'
      setCustomValue(initial)
      onChange(initial)
      return
    }
    const preset = presets.find((p) => p.key === key)
    if (preset) onChange(preset.format)
  }

  const handleCustomChange = (raw: string) => {
    setCustomValue(raw)
    if (validateFormatString(raw)) {
      onChange(raw)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={mode}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="border-border w-full rounded-lg border px-3 py-2 text-sm"
      >
        {includeSystemDefault && <option value="">System Default</option>}
        {presets.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label} ({p.format})
          </option>
        ))}
        <option value={CUSTOM_KEY}>Custom</option>
      </select>

      {isCustom && (
        <input
          type="text"
          value={customValue}
          onChange={(e) => handleCustomChange(e.target.value)}
          placeholder="e.g. DD-MMM-YYYY HH:mm"
          className={cn(
            'border-border bg-card w-full rounded-lg border px-3 py-2 font-mono text-sm',
            customValue && !validateFormatString(customValue) && 'border-destructive',
          )}
        />
      )}

      {preview && (
        <div className="bg-muted inline-block rounded-md px-2.5 py-1 font-mono text-sm">
          {preview}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format Reference (collapsible token table)
// ---------------------------------------------------------------------------

function FormatReference({ forceOpen }: { forceOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen || open

  return (
    <div className="border-border rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Format Reference
      </button>
      {isOpen && (
        <div className="border-border border-t px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-muted-foreground pb-2 font-medium">Token</th>
                <th className="text-muted-foreground pb-2 font-medium">Description</th>
                <th className="text-muted-foreground pb-2 font-medium">Example</th>
              </tr>
            </thead>
            <tbody>
              {FORMAT_TOKENS.map((tok) => (
                <tr key={tok.token} className="border-border/50 border-b last:border-0">
                  <td className="py-1.5 font-mono font-semibold">{tok.token}</td>
                  <td className="text-muted-foreground py-1.5">{tok.description}</td>
                  <td className="py-1.5 font-mono">{tok.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// System Defaults Section
// ---------------------------------------------------------------------------

function SystemDefaultsSection() {
  const { data: settings, isLoading } = useSystemSettings()
  const updateMutation = useUpdateSystemSettings()

  const [dateFormat, setDateFormat] = useState<string | null>(null)
  const [datetimeFormat, setDatetimeFormat] = useState<string | null>(null)

  // Derive effective values: local edits take precedence over server state
  const effectiveDateFormat = dateFormat ?? settings?.date_format ?? 'YYYY-MM-DD'
  const effectiveDatetimeFormat =
    datetimeFormat ?? settings?.datetime_format ?? 'YYYY-MM-DD HH:mm:ss'

  const hasChanges =
    (dateFormat !== null && dateFormat !== settings?.date_format) ||
    (datetimeFormat !== null && datetimeFormat !== settings?.datetime_format)

  const isCustomDate = findPresetKey(DATE_PRESETS, effectiveDateFormat) === CUSTOM_KEY
  const isCustomDatetime = findPresetKey(DATETIME_PRESETS, effectiveDatetimeFormat) === CUSTOM_KEY

  const handleSave = () => {
    updateMutation.mutate(
      {
        date_format: effectiveDateFormat,
        datetime_format: effectiveDatetimeFormat,
      },
      {
        onSuccess: () => {
          setDateFormat(null)
          setDatetimeFormat(null)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="bg-muted rounded-xl p-6">
        <div className="text-muted-foreground text-sm">Loading system settings...</div>
      </div>
    )
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="localization-system-defaults-section">
      <div className="mb-4 flex items-center gap-2" data-ui="localization-system-defaults-header">
        <Globe className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">System Defaults</h3>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        Default date and time formats used across the application. Individual plants can override
        these.
      </p>

      <div className="space-y-5">
        <FormatPicker
          label="Date Format"
          presets={DATE_PRESETS}
          value={effectiveDateFormat}
          onChange={setDateFormat}
        />
        <FormatPicker
          label="DateTime Format"
          presets={DATETIME_PRESETS}
          value={effectiveDatetimeFormat}
          onChange={setDatetimeFormat}
        />

        <FormatReference forceOpen={isCustomDate || isCustomDatetime} />

        <button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
            hasChanges && !updateMutation.isPending
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed border-border border',
          )}
        >
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {updateMutation.isPending ? 'Saving...' : 'Save System Defaults'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Plant Overrides Section
// ---------------------------------------------------------------------------

function PlantOverridesSection() {
  const { plants } = usePlantContext()
  const updatePlantMutation = useUpdatePlant()

  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(
    plants.length > 0 ? plants[0].id : null,
  )

  const selectedPlant = plants.find((p) => p.id === selectedPlantId) ?? null
  const plantSettings = (selectedPlant?.settings ?? {}) as Record<string, unknown>

  const [dateFormat, setDateFormat] = useState<string | null>(null)
  const [datetimeFormat, setDatetimeFormat] = useState<string | null>(null)

  // Reset local edits when plant changes
  const handlePlantChange = (id: number) => {
    setSelectedPlantId(id)
    setDateFormat(null)
    setDatetimeFormat(null)
  }

  // Derive effective values from plant settings (empty string = system default)
  const storedDateFormat = (plantSettings.date_format as string) ?? ''
  const storedDatetimeFormat = (plantSettings.datetime_format as string) ?? ''

  const effectiveDateFormat = dateFormat ?? storedDateFormat
  const effectiveDatetimeFormat = datetimeFormat ?? storedDatetimeFormat

  const hasChanges =
    (dateFormat !== null && dateFormat !== storedDateFormat) ||
    (datetimeFormat !== null && datetimeFormat !== storedDatetimeFormat)

  const isCustomDate =
    effectiveDateFormat !== '' && findPresetKey(DATE_PRESETS, effectiveDateFormat) === CUSTOM_KEY
  const isCustomDatetime =
    effectiveDatetimeFormat !== '' &&
    findPresetKey(DATETIME_PRESETS, effectiveDatetimeFormat) === CUSTOM_KEY

  const handleSave = () => {
    if (!selectedPlant) return

    // Build updated settings — remove keys when set to empty (system default)
    const updatedSettings = { ...plantSettings }
    if (effectiveDateFormat === '') {
      delete updatedSettings.date_format
    } else {
      updatedSettings.date_format = effectiveDateFormat
    }
    if (effectiveDatetimeFormat === '') {
      delete updatedSettings.datetime_format
    } else {
      updatedSettings.datetime_format = effectiveDatetimeFormat
    }

    updatePlantMutation.mutate(
      {
        id: selectedPlant.id,
        data: { settings: updatedSettings },
      },
      {
        onSuccess: () => {
          setDateFormat(null)
          setDatetimeFormat(null)
        },
      },
    )
  }

  if (plants.length === 0) {
    return (
      <div className="bg-muted rounded-xl p-6">
        <div className="text-muted-foreground text-sm">No plants configured.</div>
      </div>
    )
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="localization-plant-overrides-section">
      <div className="mb-4 flex items-center gap-2" data-ui="localization-plant-overrides-header">
        <Globe className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">Plant Overrides</h3>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        Override the system date/time formats for a specific plant. Select &quot;System
        Default&quot; to inherit the system-wide setting.
      </p>

      <div className="space-y-5">
        {/* Plant selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Plant</label>
          <select
            value={selectedPlantId ?? ''}
            onChange={(e) => handlePlantChange(Number(e.target.value))}
            className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>

        <FormatPicker
          label="Date Format"
          presets={DATE_PRESETS}
          value={effectiveDateFormat}
          onChange={setDateFormat}
          includeSystemDefault
        />
        <FormatPicker
          label="DateTime Format"
          presets={DATETIME_PRESETS}
          value={effectiveDatetimeFormat}
          onChange={setDatetimeFormat}
          includeSystemDefault
        />

        <FormatReference forceOpen={isCustomDate || isCustomDatetime} />

        <button
          onClick={handleSave}
          disabled={!hasChanges || updatePlantMutation.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
            hasChanges && !updatePlantMutation.isPending
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed border-border border',
          )}
        >
          {updatePlantMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {updatePlantMutation.isPending ? 'Saving...' : 'Save Plant Override'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Display Key Format Section (site-wide)
// ---------------------------------------------------------------------------

function dtoToDisplayKeyFormat(dto: DisplayKeyFormatDTO): DisplayKeyFormat {
  return {
    datePattern: dto.date_pattern,
    separator: dto.separator,
    numberPlacement: dto.number_placement,
    numberDigits: dto.number_digits,
  }
}

function displayKeyFormatToDto(fmt: DisplayKeyFormat): DisplayKeyFormatDTO {
  return {
    date_pattern: fmt.datePattern,
    separator: fmt.separator,
    number_placement: fmt.numberPlacement,
    number_digits: fmt.numberDigits,
  }
}

function DisplayKeySection() {
  const { data: settings, isLoading } = useSystemSettings()
  const updateMutation = useUpdateSystemSettings()

  // Derive initial state from server settings
  const serverFormat = settings?.display_key_format
    ? dtoToDisplayKeyFormat(settings.display_key_format)
    : DEFAULT_FORMAT

  const [format, setFormat] = useState<DisplayKeyFormat | null>(null)
  const effective = format ?? serverFormat

  const hasChanges =
    format !== null &&
    (format.datePattern !== serverFormat.datePattern ||
      format.separator !== serverFormat.separator ||
      format.numberPlacement !== serverFormat.numberPlacement ||
      format.numberDigits !== serverFormat.numberDigits)

  const errors = validateFormat(effective)
  const warnings = getFormatWarnings(effective)
  const preview = previewDisplayKey(effective)

  const handleChange = <K extends keyof DisplayKeyFormat>(key: K, value: DisplayKeyFormat[K]) => {
    setFormat((prev) => ({ ...(prev ?? serverFormat), [key]: value }))
  }

  const handleSave = () => {
    if (errors.length > 0) return
    updateMutation.mutate(
      { display_key_format: displayKeyFormatToDto(effective) },
      {
        onSuccess: () => {
          setFormat(null)
          // Push to the display-key module cache so all components pick it up
          setServerDisplayKeyFormat(effective)
        },
      },
    )
  }

  const handleReset = () => {
    setFormat(DEFAULT_FORMAT)
  }

  if (isLoading) {
    return (
      <div className="bg-muted rounded-xl p-6">
        <div className="text-muted-foreground text-sm">Loading settings...</div>
      </div>
    )
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="localization-display-key-section">
      <div className="mb-4 flex items-center justify-between" data-ui="localization-display-key-header">
        <div className="flex items-center gap-2">
          <Hash className="text-muted-foreground h-5 w-5" />
          <h3 className="font-semibold">Sample Display Key Format</h3>
        </div>
        <button
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
      <p className="text-muted-foreground mb-5 text-sm">
        Configure how sample identifiers appear in charts and tables across all users.
      </p>

      {/* Live Preview */}
      <div className="bg-background border-border mb-5 rounded-lg border p-4 text-center">
        <div className="text-muted-foreground mb-1 text-xs">Preview</div>
        <div className="font-mono text-xl font-semibold tracking-wide">{preview}</div>
        <div className="text-muted-foreground mt-1 text-xs">Sample 42 of today</div>
      </div>

      <div className="space-y-4">
        {/* Date Pattern */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Date Pattern</label>
              <p className="text-muted-foreground text-xs">
                Tokens:{' '}
                <code className="bg-background rounded px-1 py-0.5 text-[11px]">YYYY</code>{' '}
                <code className="bg-background rounded px-1 py-0.5 text-[11px]">YY</code>{' '}
                <code className="bg-background rounded px-1 py-0.5 text-[11px]">MM</code>{' '}
                <code className="bg-background rounded px-1 py-0.5 text-[11px]">MMM</code>{' '}
                <code className="bg-background rounded px-1 py-0.5 text-[11px]">DD</code>
              </p>
            </div>
            <input
              type="text"
              value={effective.datePattern}
              onChange={(e) => handleChange('datePattern', e.target.value)}
              placeholder="e.g. YYMMDD"
              className="bg-background border-input focus:ring-ring w-48 rounded-lg border px-3 py-2 font-mono text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PATTERN_PRESETS.map((p) => (
              <button
                key={p.pattern}
                onClick={() => handleChange('datePattern', p.pattern)}
                className={cn(
                  'rounded-md border px-2.5 py-1 font-mono text-xs transition-all',
                  effective.datePattern === p.pattern
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:border-primary/50 text-muted-foreground',
                )}
                title={p.pattern}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Separator */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Separator</label>
            <p className="text-muted-foreground text-xs">Character between date and number</p>
          </div>
          <div className="flex gap-2">
            {SEPARATOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('separator', opt.value)}
                className={cn(
                  'h-9 w-12 rounded-lg border-2 font-mono text-sm font-semibold transition-all',
                  effective.separator === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50',
                )}
                title={opt.label}
              >
                {opt.value}
              </button>
            ))}
          </div>
        </div>

        {/* Number Placement */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Number Placement</label>
            <p className="text-muted-foreground text-xs">Where the sequence number appears</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleChange('numberPlacement', 'after')}
              className={cn(
                'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                effective.numberPlacement === 'after'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/50',
              )}
            >
              After date
            </button>
            <button
              onClick={() => handleChange('numberPlacement', 'before')}
              className={cn(
                'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                effective.numberPlacement === 'before'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/50',
              )}
            >
              Before date
            </button>
          </div>
        </div>

        {/* Number Digits */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium">Number Digits</label>
            <p className="text-muted-foreground text-xs">Zero-padding for the sequence number</p>
          </div>
          <div className="flex gap-2">
            {NUMBER_DIGITS_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => handleChange('numberDigits', n)}
                className={cn(
                  'h-9 w-12 rounded-lg border-2 font-mono text-sm transition-all',
                  effective.numberDigits === n
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border hover:border-primary/50',
                )}
              >
                {String(42).padStart(n, '0')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Validation Warnings */}
      {warnings.length > 0 && (
        <div className="mt-4 space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className="text-warning flex items-center gap-2 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="mt-4 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="text-destructive text-xs">
              {e}
            </div>
          ))}
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!hasChanges || errors.length > 0 || updateMutation.isPending}
        className={cn(
          'mt-5 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
          hasChanges && errors.length === 0 && !updateMutation.isPending
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground cursor-not-allowed border-border border',
        )}
      >
        {updateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {updateMutation.isPending ? 'Saving...' : 'Save Display Key Format'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LocalizationSettings() {
  return (
    <div className="space-y-6" data-ui="localization-settings">
      <SystemDefaultsSection />
      <DisplayKeySection />
      <PlantOverridesSection />
    </div>
  )
}
