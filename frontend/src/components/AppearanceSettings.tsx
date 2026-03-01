import { useState, useEffect } from 'react'
import { useTheme, type VisualStyle } from '@/providers/ThemeProvider'
import {
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Paintbrush,
} from 'lucide-react'
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
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hslToHex(value)}
          onChange={(e) => onChange(hexToHsl(e.target.value))}
          className="border-border h-8 w-10 cursor-pointer rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="bg-background w-44 rounded border px-2 py-1 font-mono text-xs"
          placeholder="hsl(0, 0%, 0%)"
        />
      </div>
    </div>
  )
}

type AppearanceSubTab = 'theme' | 'visual-style' | 'chart-colors'

const SUB_TABS: { id: AppearanceSubTab; label: string }[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'visual-style', label: 'Visual Style' },
  { id: 'chart-colors', label: 'Chart Colors' },
]

const VISUAL_STYLE_OPTIONS: { value: VisualStyle; label: string; desc: string }[] = [
  { value: 'modern', label: 'Modern', desc: 'Clean, rounded, standard look' },
  { value: 'retro', label: 'Retro', desc: 'Sharp edges, monospace accents, industrial control-panel feel' },
  { value: 'glass', label: 'Glass', desc: 'Frosted panels, blur effects, rounded and luminous' },
]

export function AppearanceSettings() {
  const { theme, setTheme, visualStyle, setVisualStyle } = useTheme()
  const [subTab, setSubTab] = useState<AppearanceSubTab>('theme')
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
    <div className="space-y-5">
      {/* Pill Sub-Navigation */}
      <div className="flex gap-1.5">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              subTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Theme Mode */}
      {subTab === 'theme' && (
        <div className="bg-muted rounded-xl p-6">
          <h3 className="mb-4 font-semibold">Theme Mode</h3>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                  theme === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <option.icon className="h-6 w-6" />
                <span className="text-sm font-medium">{option.label}</span>
                {theme === option.value && <Check className="text-primary h-4 w-4" />}
              </button>
            ))}
          </div>
        </div>
      )}


      {/* Visual Style — personal preference */}
      {subTab === 'visual-style' && (
        <div className="bg-muted rounded-xl p-6">
          <div className="mb-2 flex items-center gap-2">
            <Paintbrush className="h-5 w-5" />
            <h3 className="font-semibold">Visual Style</h3>
          </div>
          <p className="text-muted-foreground mb-4 text-sm">
            Choose your personal visual style preference. Your organization may set a default, but
            you can override it here.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {VISUAL_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setVisualStyle(opt.value)}
                className={cn(
                  'rounded-lg border-2 p-4 text-left transition-all',
                  visualStyle === opt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {visualStyle === opt.value && <Check className="text-primary h-4 w-4" />}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart Color Presets */}
      {subTab === 'chart-colors' && (
        <>
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Chart Color Preset</h3>
              <button
                onClick={handleReset}
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {chartPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all',
                    selectedPreset === preset.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  {/* Color preview swatches */}
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-6 w-6 rounded"
                      style={{ backgroundColor: preset.colors.lineGradientStart }}
                    />
                    <div
                      className="h-6 w-6 rounded"
                      style={{ backgroundColor: preset.colors.violationPoint }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{preset.name}</span>
                      {selectedPreset === preset.id && <Check className="text-primary h-4 w-4" />}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">{preset.description}</p>
                  </div>
                </button>
              ))}

              {/* Custom option */}
              {selectedPreset === 'custom' && (
                <div className="border-primary bg-primary/5 flex items-start gap-3 rounded-lg border-2 p-4">
                  <div className="flex flex-col gap-1">
                    <div
                      className="h-6 w-6 rounded"
                      style={{ backgroundColor: colors.lineGradientStart }}
                    />
                    <div
                      className="h-6 w-6 rounded"
                      style={{ backgroundColor: colors.violationPoint }}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Custom</span>
                      <Check className="text-primary h-4 w-4" />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Your custom color configuration
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Color Customization */}
          <div className="bg-muted overflow-hidden rounded-xl">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="hover:bg-muted/50 flex w-full items-center justify-between p-6 transition-colors"
            >
              <div>
                <h3 className="text-left font-semibold">Advanced Color Customization</h3>
                <p className="text-muted-foreground text-left text-sm">
                  Fine-tune individual chart colors
                </p>
              </div>
              {showAdvanced ? (
                <ChevronUp className="text-muted-foreground h-5 w-5" />
              ) : (
                <ChevronDown className="text-muted-foreground h-5 w-5" />
              )}
            </button>

            {showAdvanced && (
              <div className="border-border space-y-6 border-t p-6">
                {/* Data Line */}
                <div>
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">Data Line</h4>
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
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">Control Lines</h4>
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
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">Zone Colors</h4>
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
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">Point Markers</h4>
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
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">
                    Out of Control Region
                  </h4>
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
                  <h4 className="text-muted-foreground mb-3 text-sm font-medium">Annotations</h4>
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
                  <div className="border-border flex justify-end border-t pt-4">
                    <button
                      onClick={handleSaveCustom}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium"
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

    </div>
  )
}
