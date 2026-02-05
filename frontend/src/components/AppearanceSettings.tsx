import { useState, useEffect } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { Sun, Moon, Monitor, Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
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

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [selectedPreset, setSelectedPreset] = useState(getStoredPresetId())
  const [colors, setColors] = useState<ChartColors>(getStoredChartColors())
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

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
    <div className="space-y-8">
      {/* Theme Mode */}
      <div className="bg-card border border-border rounded-xl p-6">
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

      {/* Chart Color Presets */}
      <div className="bg-card border border-border rounded-xl p-6">
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
      <div className="bg-card border border-border rounded-xl overflow-hidden">
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
    </div>
  )
}
