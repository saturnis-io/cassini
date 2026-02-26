import { useState, useMemo } from 'react'
import { Globe, ChevronDown, ChevronRight, Save, Loader2 } from 'lucide-react'
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
  const selectedKey = value === '' ? '' : findPresetKey(presets, value)
  const isCustom = selectedKey === CUSTOM_KEY
  const [customValue, setCustomValue] = useState(isCustom ? value : '')

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
    if (key === '') {
      onChange('')
      return
    }
    if (key === CUSTOM_KEY) {
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
        value={isCustom ? CUSTOM_KEY : value === '' ? '' : selectedKey}
        onChange={(e) => handleSelectChange(e.target.value)}
        className="border-border bg-card w-full rounded-lg border px-3 py-2 text-sm"
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
          placeholder="e.g. YYYY-MM-DD HH:mm"
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
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
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
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
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
// Main Component
// ---------------------------------------------------------------------------

export function LocalizationSettings() {
  return (
    <div className="space-y-6">
      <SystemDefaultsSection />
      <PlantOverridesSection />
    </div>
  )
}
