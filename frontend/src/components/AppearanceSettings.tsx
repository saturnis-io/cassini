import { useState, useEffect } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { Sun, Moon, Monitor, Check, ChevronDown, ChevronUp, RotateCcw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  chartPresets,
  defaultChartColors,
  getStoredChartColors,
  getStoredPresetId,
  saveChartColors,
  applyChartColors,
  type ChartColors,
} from '@/lib/theme-presets'
import {
  getDisplayKeyFormat,
  saveDisplayKeyFormat,
  validateFormat,
  getFormatWarnings,
  previewDisplayKey,
  DEFAULT_FORMAT,
  DATE_PATTERN_PRESETS,
  SEPARATOR_OPTIONS,
  NUMBER_DIGITS_OPTIONS,
  type DisplayKeyFormat,
} from '@/lib/display-key'
import { toast } from 'sonner'

type ThemeOption = 'light' | 'dark' | 'system'

const themeOptions: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

interface ColorInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
}

function ColorInput({ label, value, onChange, description }: ColorInputProps) {
  // Convert HSL to hex for the color picker
  const hslToHex = (hsl: string): string => {
    const match = hsl.match(/hsl\((\d+),?\s*(\d+)%?,?\s*(\d+)%?\)/)
    if (!match) return '#000000'

    const h = parseInt(match[1]) / 360
    const s = parseInt(match[2]) / 100
    const l = parseInt(match[3]) / 100

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    let r, g, b
    if (s === 0) {
      r = g = b = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1 / 3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1 / 3)
    }

    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  // Convert hex to HSL
  const hexToHsl = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return value

    const r = parseInt(result[1], 16) / 255
    const g = parseInt(result[2], 16) / 255
    const b = parseInt(result[3], 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6
          break
        case g:
          h = ((b - r) / d + 2) / 6
          break
        case b:
          h = ((r - g) / d + 4) / 6
          break
      }
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <label className="text-sm font-medium">{label}</label>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hslToHex(value)}
          onChange={(e) => onChange(hexToHsl(e.target.value))}
          className="w-10 h-8 rounded border border-border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-44 px-2 py-1 text-xs font-mono border rounded bg-background"
          placeholder="hsl(0, 0%, 0%)"
        />
      </div>
    </div>
  )
}

type AppearanceSubTab = 'theme' | 'chart-colors' | 'display-key'

const SUB_TABS: { id: AppearanceSubTab; label: string }[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'chart-colors', label: 'Chart Colors' },
  { id: 'display-key', label: 'Display Key' },
]

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [subTab, setSubTab] = useState<AppearanceSubTab>('theme')
  const [selectedPreset, setSelectedPreset] = useState(getStoredPresetId())
  const [colors, setColors] = useState<ChartColors>(getStoredChartColors())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Display Key Format state
  const [dkFormat, setDkFormat] = useState<DisplayKeyFormat>(getDisplayKeyFormat)
  const [dkHasChanges, setDkHasChanges] = useState(false)
  const dkErrors = validateFormat(dkFormat)
  const dkWarnings = getFormatWarnings(dkFormat)
  const dkPreview = previewDisplayKey(dkFormat)

  const handleDkChange = <K extends keyof DisplayKeyFormat>(key: K, value: DisplayKeyFormat[K]) => {
    setDkFormat(prev => ({ ...prev, [key]: value }))
    setDkHasChanges(true)
  }

  const handleDkSave = () => {
    if (dkErrors.length > 0) return
    saveDisplayKeyFormat(dkFormat)
    setDkHasChanges(false)
    toast.success('Display key format saved')
  }

  const handleDkReset = () => {
    setDkFormat(DEFAULT_FORMAT)
    saveDisplayKeyFormat(DEFAULT_FORMAT)
    setDkHasChanges(false)
    toast.success('Display key format reset to default')
  }

  // Apply colors on mount
  useEffect(() => {
    applyChartColors(colors)
  }, [])

  const handlePresetChange = (presetId: string) => {
    const preset = chartPresets.find((p) => p.id === presetId)
    if (preset) {
      setSelectedPreset(presetId)
      setColors(preset.colors)
      applyChartColors(preset.colors)
      saveChartColors(preset.colors, presetId)
      setHasChanges(false)
      toast.success(`Applied "${preset.name}" theme`)
    }
  }

  const handleColorChange = (key: keyof ChartColors, value: string) => {
    const newColors = { ...colors, [key]: value }
    setColors(newColors)
    setSelectedPreset('custom')
    setHasChanges(true)
    applyChartColors(newColors)
  }

  const handleSaveCustom = () => {
    saveChartColors(colors)
    setHasChanges(false)
    toast.success('Custom colors saved')
  }

  const handleReset = () => {
    setColors(defaultChartColors)
    setSelectedPreset('classic')
    applyChartColors(defaultChartColors)
    saveChartColors(defaultChartColors, 'classic')
    setHasChanges(false)
    toast.success('Reset to default colors')
  }

  return (
    <div className="space-y-5">
      {/* Pill Sub-Navigation */}
      <div className="flex gap-1.5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors',
              subTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Theme Mode */}
      {subTab === 'theme' && (
      <div className="bg-muted rounded-xl p-6">
        <h3 className="font-semibold mb-4">Theme Mode</h3>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                theme === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <option.icon className="h-6 w-6" />
              <span className="text-sm font-medium">{option.label}</span>
              {theme === option.value && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Chart Color Presets */}
      {subTab === 'chart-colors' && (
      <>
      <div className="bg-muted rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Chart Color Preset</h3>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {chartPresets.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handlePresetChange(preset.id)}
              className={cn(
                'flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-all',
                selectedPreset === preset.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {/* Color preview swatches */}
              <div className="flex flex-col gap-1">
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: preset.colors.lineGradientStart }}
                />
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: preset.colors.violationPoint }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{preset.name}</span>
                  {selectedPreset === preset.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {preset.description}
                </p>
              </div>
            </button>
          ))}

          {/* Custom option */}
          {selectedPreset === 'custom' && (
            <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-primary bg-primary/5">
              <div className="flex flex-col gap-1">
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: colors.lineGradientStart }}
                />
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: colors.violationPoint }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Custom</span>
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your custom color configuration
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advanced Color Customization */}
      <div className="bg-muted rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-6 hover:bg-muted/50 transition-colors"
        >
          <div>
            <h3 className="font-semibold text-left">Advanced Color Customization</h3>
            <p className="text-sm text-muted-foreground text-left">
              Fine-tune individual chart colors
            </p>
          </div>
          {showAdvanced ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-t border-border p-6 space-y-6">
            {/* Data Line */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Data Line</h4>
              <div className="space-y-3">
                <ColorInput
                  label="Gradient Start"
                  value={colors.lineGradientStart}
                  onChange={(v) => handleColorChange('lineGradientStart', v)}
                />
                <ColorInput
                  label="Gradient End"
                  value={colors.lineGradientEnd}
                  onChange={(v) => handleColorChange('lineGradientEnd', v)}
                />
              </div>
            </div>

            {/* Control Lines */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Control Lines</h4>
              <div className="space-y-3">
                <ColorInput
                  label="Center Line"
                  value={colors.centerLine}
                  onChange={(v) => handleColorChange('centerLine', v)}
                />
                <ColorInput
                  label="UCL (Upper Control Limit)"
                  value={colors.uclLine}
                  onChange={(v) => handleColorChange('uclLine', v)}
                />
                <ColorInput
                  label="LCL (Lower Control Limit)"
                  value={colors.lclLine}
                  onChange={(v) => handleColorChange('lclLine', v)}
                />
              </div>
            </div>

            {/* Zone Fills */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Zone Colors</h4>
              <div className="space-y-3">
                <ColorInput
                  label="Zone A (2-3 sigma)"
                  value={colors.zoneA}
                  onChange={(v) => handleColorChange('zoneA', v)}
                  description="Warning zone near control limits"
                />
                <ColorInput
                  label="Zone B (1-2 sigma)"
                  value={colors.zoneB}
                  onChange={(v) => handleColorChange('zoneB', v)}
                  description="Caution zone"
                />
                <ColorInput
                  label="Zone C (0-1 sigma)"
                  value={colors.zoneC}
                  onChange={(v) => handleColorChange('zoneC', v)}
                  description="Normal zone near center"
                />
              </div>
            </div>

            {/* Point Markers */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Point Markers</h4>
              <div className="space-y-3">
                <ColorInput
                  label="Normal Points"
                  value={colors.normalPoint}
                  onChange={(v) => handleColorChange('normalPoint', v)}
                />
                <ColorInput
                  label="Violation Points"
                  value={colors.violationPoint}
                  onChange={(v) => handleColorChange('violationPoint', v)}
                />
                <ColorInput
                  label="Undersized Points"
                  value={colors.undersizedPoint}
                  onChange={(v) => handleColorChange('undersizedPoint', v)}
                />
                <ColorInput
                  label="Excluded Points"
                  value={colors.excludedPoint}
                  onChange={(v) => handleColorChange('excludedPoint', v)}
                />
              </div>
            </div>

            {/* Out of Control */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Out of Control Region</h4>
              <div className="space-y-3">
                <ColorInput
                  label="OOC Background"
                  value={colors.outOfControl}
                  onChange={(v) => handleColorChange('outOfControl', v)}
                />
              </div>
            </div>

            {/* Annotations */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Annotations</h4>
              <div className="space-y-3">
                <ColorInput
                  label="Annotation Marker"
                  value={colors.annotationColor}
                  onChange={(v) => handleColorChange('annotationColor', v)}
                  description="Color for annotation markers and brackets on the chart"
                />
              </div>
            </div>

            {/* Save Button */}
            {hasChanges && (
              <div className="flex justify-end pt-4 border-t border-border">
                <button
                  onClick={handleSaveCustom}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Save Custom Colors
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      {/* Display Key Format */}
      {subTab === 'display-key' && (
      <div className="bg-muted rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Sample Display Key Format</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure how sample identifiers appear in charts and tables
            </p>
          </div>
          <button
            onClick={handleDkReset}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Live Preview */}
        <div className="mb-5 p-4 bg-background border border-border rounded-lg text-center">
          <div className="text-xs text-muted-foreground mb-1">Preview</div>
          <div className="text-xl font-mono font-semibold tracking-wide">{dkPreview}</div>
          <div className="text-xs text-muted-foreground mt-1">Sample 42 of today</div>
        </div>

        <div className="space-y-4">
          {/* Date Pattern */}
          <div>
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex-1">
                <label className="text-sm font-medium">Date Pattern</label>
                <p className="text-xs text-muted-foreground">
                  Tokens: <code className="px-1 py-0.5 bg-background rounded text-[11px]">YYYY</code>{' '}
                  <code className="px-1 py-0.5 bg-background rounded text-[11px]">YY</code>{' '}
                  <code className="px-1 py-0.5 bg-background rounded text-[11px]">MM</code>{' '}
                  <code className="px-1 py-0.5 bg-background rounded text-[11px]">MMM</code>{' '}
                  <code className="px-1 py-0.5 bg-background rounded text-[11px]">DD</code>
                </p>
              </div>
              <input
                type="text"
                value={dkFormat.datePattern}
                onChange={(e) => handleDkChange('datePattern', e.target.value)}
                placeholder="e.g. YYMMDD"
                className="w-48 px-3 py-2 text-sm font-mono bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DATE_PATTERN_PRESETS.map((p) => (
                <button
                  key={p.pattern}
                  onClick={() => handleDkChange('datePattern', p.pattern)}
                  className={cn(
                    'px-2.5 py-1 text-xs font-mono rounded-md border transition-all',
                    dkFormat.datePattern === p.pattern
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/50 text-muted-foreground'
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
              <p className="text-xs text-muted-foreground">Character between date and number</p>
            </div>
            <div className="flex gap-2">
              {SEPARATOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleDkChange('separator', opt.value)}
                  className={cn(
                    'w-12 h-9 text-sm font-mono font-semibold rounded-lg border-2 transition-all',
                    dkFormat.separator === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50'
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
              <p className="text-xs text-muted-foreground">Where the sequence number appears</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleDkChange('numberPlacement', 'after')}
                className={cn(
                  'px-3 py-2 text-sm rounded-lg border-2 transition-all',
                  dkFormat.numberPlacement === 'after'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-primary/50'
                )}
              >
                After date
              </button>
              <button
                onClick={() => handleDkChange('numberPlacement', 'before')}
                className={cn(
                  'px-3 py-2 text-sm rounded-lg border-2 transition-all',
                  dkFormat.numberPlacement === 'before'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-primary/50'
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
              <p className="text-xs text-muted-foreground">Zero-padding for the sequence number</p>
            </div>
            <div className="flex gap-2">
              {NUMBER_DIGITS_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => handleDkChange('numberDigits', n)}
                  className={cn(
                    'w-12 h-9 text-sm font-mono rounded-lg border-2 transition-all',
                    dkFormat.numberDigits === n
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {String(42).padStart(n, '0')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Validation Warnings */}
        {dkWarnings.length > 0 && (
          <div className="mt-4 space-y-1">
            {dkWarnings.map((w, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Validation Errors */}
        {dkErrors.length > 0 && (
          <div className="mt-4 space-y-1">
            {dkErrors.map((e, i) => (
              <div key={i} className="text-xs text-destructive">{e}</div>
            ))}
          </div>
        )}

        {/* Save Button */}
        {dkHasChanges && (
          <div className="flex justify-end pt-4 mt-4 border-t border-border">
            <button
              onClick={handleDkSave}
              disabled={dkErrors.length > 0}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg',
                dkErrors.length > 0
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              Save Format
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
