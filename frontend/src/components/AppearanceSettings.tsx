import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useECharts } from '@/hooks/useECharts'
import { graphic } from '@/lib/echarts'
import { VISUAL_STYLE_OPTIONS } from '@/lib/visual-styles'
import { useAccessibilityStore } from '@/stores/accessibilityStore'
import {
  Sun,
  Moon,
  Monitor,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Fingerprint,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  chartPresets,
  getStoredChartColors,
  getStoredPresetId,
  saveChartPreset,
  saveCustomChartColors,
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

// Synthetic SPC data for the preview chart
const PREVIEW_CL = 50
const PREVIEW_UCL = 56
const PREVIEW_LCL = 44
const PREVIEW_VALUES = [
  51.2, 49.5, 50.8, 48.3, 52.1, 49.0, 50.5, 47.8, 51.9, 53.2, 50.1, 48.7, 52.8, 49.3, 57.5,
  50.6, 48.9, 51.4, 49.8, 50.2, 53.1, 47.2, 50.7, 49.1, 51.8,
]
const PREVIEW_VIOLATION_IDX = 14 // index of the OOC point (57.5 > UCL)
const PREVIEW_EXCLUDED_IDX = 21 // index 21 is 47.2, mark as excluded for demo

function ChartPreview({ colors }: { colors: ChartColors }) {
  const { resolvedTheme } = useTheme()

  const option = useMemo(() => {
    const sigma1 = (PREVIEW_UCL - PREVIEW_CL) / 3
    const zoneAbove = [
      { from: PREVIEW_CL + 2 * sigma1, to: PREVIEW_UCL, color: colors.zoneA },
      { from: PREVIEW_CL + sigma1, to: PREVIEW_CL + 2 * sigma1, color: colors.zoneB },
      { from: PREVIEW_CL, to: PREVIEW_CL + sigma1, color: colors.zoneC },
    ]
    const zoneBelow = [
      { from: PREVIEW_LCL, to: PREVIEW_CL - 2 * sigma1, color: colors.zoneA },
      { from: PREVIEW_CL - 2 * sigma1, to: PREVIEW_CL - sigma1, color: colors.zoneB },
      { from: PREVIEW_CL - sigma1, to: PREVIEW_CL, color: colors.zoneC },
    ]
    const markAreaData = [...zoneAbove, ...zoneBelow].map((z) => [
      {
        yAxis: z.from,
        itemStyle: { color: z.color, opacity: 0.12 },
      },
      { yAxis: z.to },
    ])

    const normalData: (number | null)[][] = []
    const violationData: (number | null)[][] = []
    const excludedData: (number | null)[][] = []
    PREVIEW_VALUES.forEach((v, i) => {
      if (i === PREVIEW_VIOLATION_IDX) {
        violationData.push([i + 1, v])
      } else if (i === PREVIEW_EXCLUDED_IDX) {
        excludedData.push([i + 1, v])
      } else {
        normalData.push([i + 1, v])
      }
    })

    const isDark = resolvedTheme === 'dark'
    const axisColor = isDark ? 'hsl(220, 10%, 40%)' : 'hsl(220, 10%, 75%)'
    const labelColor = isDark ? 'hsl(220, 10%, 55%)' : 'hsl(220, 10%, 50%)'

    return {
      animation: false,
      grid: { top: 12, right: 12, bottom: 24, left: 40 },
      xAxis: {
        type: 'value' as const,
        min: 1,
        max: PREVIEW_VALUES.length,
        splitLine: { show: false },
        axisLine: { lineStyle: { color: axisColor } },
        axisTick: { lineStyle: { color: axisColor } },
        axisLabel: { color: labelColor, fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        min: 42,
        max: 59,
        splitLine: { lineStyle: { color: axisColor, opacity: 0.4 } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: labelColor, fontSize: 10 },
      },
      series: [
        // Data line
        {
          type: 'line' as const,
          data: PREVIEW_VALUES.map((v, i) => [i + 1, v]),
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: colors.lineGradientStart },
              { offset: 1, color: colors.lineGradientEnd },
            ]),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            data: [
              {
                yAxis: PREVIEW_CL,
                lineStyle: { color: colors.centerLine, width: 2, type: 'solid' as const },
              },
              {
                yAxis: PREVIEW_UCL,
                lineStyle: { color: colors.uclLine, width: 1.5, type: 'dashed' as const },
              },
              {
                yAxis: PREVIEW_LCL,
                lineStyle: { color: colors.lclLine, width: 1.5, type: 'dashed' as const },
              },
            ],
          },
          markArea: {
            silent: true,
            data: markAreaData,
          },
        },
        // Normal points
        {
          type: 'scatter' as const,
          data: normalData,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: colors.normalPoint },
          z: 10,
        },
        // Violation point
        {
          type: 'scatter' as const,
          data: violationData,
          symbol: 'diamond',
          symbolSize: 10,
          itemStyle: { color: colors.violationPoint },
          z: 11,
        },
        // Excluded point
        {
          type: 'scatter' as const,
          data: excludedData,
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: {
            color: 'transparent',
            borderColor: colors.excludedPoint,
            borderWidth: 2,
          },
          z: 10,
        },
      ],
      tooltip: { show: false },
    }
  }, [colors, resolvedTheme])

  const { containerRef } = useECharts({ option })

  return (
    <div className="bg-card border-border overflow-hidden rounded-lg border">
      <div className="text-muted-foreground flex items-center justify-between px-3 pt-2 text-xs">
        <span>Preview — X-bar Chart</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colors.normalPoint }}
            />
            Normal
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rotate-45"
              style={{ backgroundColor: colors.violationPoint }}
            />
            Violation
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full border-2"
              style={{ borderColor: colors.excludedPoint, backgroundColor: 'transparent' }}
            />
            Excluded
          </span>
        </span>
      </div>
      <div ref={containerRef} style={{ width: '100%', height: 180 }} />
    </div>
  )
}

export function AppearanceSettings() {
  const { theme, setTheme, visualStyle, setVisualStyle, resolvedTheme } = useTheme()
  const touchMode = useAccessibilityStore((s) => s.touchMode)
  const toggleTouchMode = useAccessibilityStore((s) => s.toggleTouchMode)
  const [selectedPreset, setSelectedPreset] = useState(getStoredPresetId())
  const [colors, setColors] = useState<ChartColors>(() => getStoredChartColors(resolvedTheme))
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    if (selectedPreset !== 'custom') {
      setColors(getStoredChartColors(resolvedTheme))
    }
  }, [resolvedTheme, selectedPreset])

  const handlePresetChange = (presetId: string) => {
    const preset = chartPresets.find((p) => p.id === presetId)
    if (preset) {
      setSelectedPreset(presetId)
      const modeColors = preset[resolvedTheme]
      setColors(modeColors)
      applyChartColors(modeColors)
      saveChartPreset(presetId)
      setHasChanges(false)
      toast.success(`Applied "${preset.name}" chart colors`)
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
    saveCustomChartColors(colors)
    setHasChanges(false)
    toast.success('Custom colors saved')
  }

  const handleReset = () => {
    const modeColors = chartPresets[0][resolvedTheme]
    setColors(modeColors)
    setSelectedPreset('classic')
    applyChartColors(modeColors)
    saveChartPreset('classic')
    setHasChanges(false)
    toast.success('Reset to default colors')
  }

  return (
    <div className="space-y-6" data-ui="appearance-settings">
      {/* Theme Mode — compact toggle */}
      <section className="bg-muted rounded-xl p-5" data-ui="appearance-theme-section">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">Theme</h3>
        <div className="inline-flex gap-1 rounded-lg border p-1">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                theme === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {/* Visual Style */}
      <section className="bg-muted rounded-xl p-5" data-ui="appearance-visual-style-section">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide">Visual Style</h3>
        <p className="text-muted-foreground mb-3 text-xs">
          Controls the overall look — borders, shadows, typography feel
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {VISUAL_STYLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setVisualStyle(opt.value)}
              className={cn(
                'rounded-lg border-2 px-3 py-2.5 text-left transition-all',
                visualStyle === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50',
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{opt.label}</span>
                {visualStyle === opt.value && <Check className="text-primary h-3.5 w-3.5" />}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{opt.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Touch Mode */}
      <section className="bg-muted rounded-xl p-5" data-ui="appearance-touch-mode-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Fingerprint className="text-muted-foreground h-5 w-5" />
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide">Touch Mode</h3>
              <p className="text-muted-foreground text-xs">
                Larger buttons, inputs, and spacing for touchscreen use on the shop floor
              </p>
            </div>
          </div>
          <button
            onClick={toggleTouchMode}
            role="switch"
            aria-checked={touchMode}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors',
              touchMode ? 'bg-primary' : 'bg-input',
            )}
          >
            <span
              className={cn(
                'pointer-events-none block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform',
                touchMode ? 'translate-x-5.5' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      </section>

      {/* Chart Colors */}
      <section className="bg-muted rounded-xl p-5" data-ui="appearance-chart-colors-section">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide">Chart Colors</h3>
            <p className="text-muted-foreground text-xs">
              Adapts automatically to light and dark mode
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {chartPresets.map((preset) => {
            const presetColors = preset[resolvedTheme]
            return (
              <button
                key={preset.id}
                onClick={() => handlePresetChange(preset.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5 text-left transition-all',
                  selectedPreset === preset.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <div className="grid grid-cols-2 gap-0.5">
                  <div
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{ backgroundColor: presetColors.lineGradientStart }}
                  />
                  <div
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{ backgroundColor: presetColors.centerLine }}
                  />
                  <div
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{ backgroundColor: presetColors.violationPoint }}
                  />
                  <div
                    className="h-3.5 w-3.5 rounded-sm"
                    style={{ backgroundColor: presetColors.zoneC }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{preset.name}</span>
                    {selectedPreset === preset.id && (
                      <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">{preset.description}</p>
                </div>
              </button>
            )
          })}

          {selectedPreset === 'custom' && (
            <div className="border-primary bg-primary/5 flex items-center gap-2.5 rounded-lg border-2 px-3 py-2.5">
              <div className="grid grid-cols-2 gap-0.5">
                <div
                  className="h-3.5 w-3.5 rounded-sm"
                  style={{ backgroundColor: colors.lineGradientStart }}
                />
                <div
                  className="h-3.5 w-3.5 rounded-sm"
                  style={{ backgroundColor: colors.centerLine }}
                />
                <div
                  className="h-3.5 w-3.5 rounded-sm"
                  style={{ backgroundColor: colors.violationPoint }}
                />
                <div
                  className="h-3.5 w-3.5 rounded-sm"
                  style={{ backgroundColor: colors.zoneC }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">Custom</span>
                  <Check className="text-primary h-3.5 w-3.5 shrink-0" />
                </div>
                <p className="text-muted-foreground text-xs">Your custom color configuration</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Live Preview */}
      <ChartPreview colors={colors} />

      {/* Advanced Color Customization (collapsed) */}
      <section className="bg-muted overflow-hidden rounded-xl" data-ui="appearance-advanced-colors-section">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="hover:bg-muted/50 flex w-full items-center justify-between px-5 py-4 transition-colors"
        >
          <div>
            <h3 className="text-left text-sm font-semibold uppercase tracking-wide">
              Advanced Color Customization
            </h3>
            <p className="text-muted-foreground text-left text-xs">
              Fine-tune individual chart colors
            </p>
          </div>
          {showAdvanced ? (
            <ChevronUp className="text-muted-foreground h-4 w-4" />
          ) : (
            <ChevronDown className="text-muted-foreground h-4 w-4" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-border space-y-6 border-t px-5 py-5">
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
      </section>
    </div>
  )
}
