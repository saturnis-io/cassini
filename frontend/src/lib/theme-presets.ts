/**
 * Chart color theme presets for SPC charts.
 * Each preset defines colors for chart elements that work well together.
 */

export interface ChartColorPreset {
  id: string
  name: string
  description: string
  colors: ChartColors
}

export interface ChartColors {
  // Data line gradient
  lineGradientStart: string
  lineGradientEnd: string

  // Control lines
  centerLine: string
  uclLine: string
  lclLine: string

  // Zone fills (with opacity applied via CSS)
  zoneA: string
  zoneB: string
  zoneC: string

  // Point markers
  normalPoint: string
  violationPoint: string
  undersizedPoint: string
  excludedPoint: string

  // Out of control region
  outOfControl: string
}

export const defaultChartColors: ChartColors = {
  lineGradientStart: 'hsl(212, 100%, 35%)',
  lineGradientEnd: 'hsl(179, 50%, 55%)',
  centerLine: 'hsl(212, 100%, 30%)',
  uclLine: 'hsl(357, 80%, 52%)',
  lclLine: 'hsl(357, 80%, 52%)',
  zoneA: 'hsl(32, 63%, 51%)',
  zoneB: 'hsl(48, 100%, 50%)',
  zoneC: 'hsl(104, 55%, 40%)',
  normalPoint: 'hsl(212, 100%, 30%)',
  violationPoint: 'hsl(357, 80%, 52%)',
  undersizedPoint: 'hsl(32, 63%, 51%)',
  excludedPoint: 'hsl(210, 8%, 46%)',
  outOfControl: 'hsl(357, 80%, 52%)',
}

export const chartPresets: ChartColorPreset[] = [
  {
    id: 'classic',
    name: 'Classic (Sepasoft)',
    description: 'Default Sepasoft brand colors - professional and clean',
    colors: defaultChartColors,
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Maximum visibility with bold, distinct colors',
    colors: {
      lineGradientStart: 'hsl(220, 100%, 50%)',
      lineGradientEnd: 'hsl(220, 100%, 50%)',
      centerLine: 'hsl(0, 0%, 0%)',
      uclLine: 'hsl(0, 100%, 40%)',
      lclLine: 'hsl(0, 100%, 40%)',
      zoneA: 'hsl(0, 100%, 50%)',
      zoneB: 'hsl(45, 100%, 50%)',
      zoneC: 'hsl(120, 100%, 35%)',
      normalPoint: 'hsl(220, 100%, 50%)',
      violationPoint: 'hsl(0, 100%, 40%)',
      undersizedPoint: 'hsl(45, 100%, 45%)',
      excludedPoint: 'hsl(0, 0%, 50%)',
      outOfControl: 'hsl(0, 100%, 50%)',
    },
  },
  {
    id: 'colorblind-safe',
    name: 'Colorblind Safe',
    description: 'Optimized for deuteranopia and protanopia (red-green colorblindness)',
    colors: {
      lineGradientStart: 'hsl(220, 80%, 50%)',
      lineGradientEnd: 'hsl(200, 80%, 45%)',
      centerLine: 'hsl(220, 80%, 40%)',
      uclLine: 'hsl(30, 100%, 45%)',
      lclLine: 'hsl(30, 100%, 45%)',
      zoneA: 'hsl(30, 100%, 50%)',
      zoneB: 'hsl(55, 90%, 50%)',
      zoneC: 'hsl(200, 70%, 50%)',
      normalPoint: 'hsl(220, 80%, 50%)',
      violationPoint: 'hsl(30, 100%, 50%)',
      undersizedPoint: 'hsl(55, 90%, 45%)',
      excludedPoint: 'hsl(0, 0%, 60%)',
      outOfControl: 'hsl(30, 100%, 50%)',
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Grayscale with pattern differentiation for printing',
    colors: {
      lineGradientStart: 'hsl(0, 0%, 25%)',
      lineGradientEnd: 'hsl(0, 0%, 35%)',
      centerLine: 'hsl(0, 0%, 30%)',
      uclLine: 'hsl(0, 0%, 15%)',
      lclLine: 'hsl(0, 0%, 15%)',
      zoneA: 'hsl(0, 0%, 40%)',
      zoneB: 'hsl(0, 0%, 55%)',
      zoneC: 'hsl(0, 0%, 70%)',
      normalPoint: 'hsl(0, 0%, 25%)',
      violationPoint: 'hsl(0, 0%, 0%)',
      undersizedPoint: 'hsl(0, 0%, 45%)',
      excludedPoint: 'hsl(0, 0%, 75%)',
      outOfControl: 'hsl(0, 0%, 30%)',
    },
  },
  {
    id: 'dark-optimized',
    name: 'Dark Mode Optimized',
    description: 'Bright colors optimized for dark backgrounds',
    colors: {
      lineGradientStart: 'hsl(200, 100%, 60%)',
      lineGradientEnd: 'hsl(170, 80%, 55%)',
      centerLine: 'hsl(200, 100%, 65%)',
      uclLine: 'hsl(0, 90%, 65%)',
      lclLine: 'hsl(0, 90%, 65%)',
      zoneA: 'hsl(25, 100%, 60%)',
      zoneB: 'hsl(50, 100%, 55%)',
      zoneC: 'hsl(140, 70%, 50%)',
      normalPoint: 'hsl(200, 100%, 65%)',
      violationPoint: 'hsl(0, 90%, 65%)',
      undersizedPoint: 'hsl(45, 100%, 60%)',
      excludedPoint: 'hsl(0, 0%, 55%)',
      outOfControl: 'hsl(0, 90%, 60%)',
    },
  },
]

const STORAGE_KEY = 'openspc-chart-colors'
const PRESET_STORAGE_KEY = 'openspc-chart-preset'

export function getStoredChartColors(): ChartColors {
  if (typeof window === 'undefined') return defaultChartColors

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return { ...defaultChartColors, ...JSON.parse(stored) }
    } catch {
      return defaultChartColors
    }
  }
  return defaultChartColors
}

export function getStoredPresetId(): string {
  if (typeof window === 'undefined') return 'classic'
  return localStorage.getItem(PRESET_STORAGE_KEY) || 'classic'
}

export function saveChartColors(colors: ChartColors, presetId?: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  if (presetId) {
    localStorage.setItem(PRESET_STORAGE_KEY, presetId)
  } else {
    localStorage.setItem(PRESET_STORAGE_KEY, 'custom')
  }
  // Dispatch custom event for same-tab updates
  window.dispatchEvent(new CustomEvent('chart-colors-changed'))
}

export function applyChartColors(colors: ChartColors): void {
  const root = document.documentElement

  root.style.setProperty('--chart-line-gradient-start', colors.lineGradientStart)
  root.style.setProperty('--chart-line-gradient-end', colors.lineGradientEnd)
  root.style.setProperty('--chart-center-line-color', colors.centerLine)
  root.style.setProperty('--chart-ucl-color', colors.uclLine)
  root.style.setProperty('--chart-lcl-color', colors.lclLine)
  root.style.setProperty('--chart-zone-a-color', colors.zoneA)
  root.style.setProperty('--chart-zone-b-color', colors.zoneB)
  root.style.setProperty('--chart-zone-c-color', colors.zoneC)
  root.style.setProperty('--chart-point-normal', colors.normalPoint)
  root.style.setProperty('--chart-point-violation', colors.violationPoint)
  root.style.setProperty('--chart-point-undersized', colors.undersizedPoint)
  root.style.setProperty('--chart-point-excluded', colors.excludedPoint)
  root.style.setProperty('--chart-ooc-color', colors.outOfControl)
}
