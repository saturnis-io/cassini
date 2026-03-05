/**
 * Chart color theme presets for SPC charts.
 * Each preset defines light and dark color sets that adapt to the current theme mode.
 */

export interface ChartColorPreset {
  id: string
  name: string
  description: string
  light: ChartColors
  dark: ChartColors
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

  // Annotations
  annotationColor: string

  // Secondary/comparison chart colors (for comparison mode)
  secondaryLineGradientStart: string
  secondaryLineGradientEnd: string
  secondaryNormalPoint: string
}

/**
 * Cassini Brand Colors Reference:
 * - Gold:   #D4AF37 -> hsl(46, 65%, 52%)
 * - Green:  #4C9C2E -> hsl(104, 55%, 40%)
 * - Navy:   #080C16 -> hsl(220, 80%, 8%)
 * - Orange: #D48232 -> hsl(32, 63%, 51%)
 * - Yellow: #FFCD00 -> hsl(48, 100%, 50%)
 * - Red:    #EC1C24 -> hsl(357, 80%, 52%)
 * - Purple: #7473C0 -> hsl(241, 33%, 60%)
 * - Cream:  #F0E8D0 -> hsl(45, 30%, 95%)
 */
export const defaultChartColors: ChartColors = {
  // Primary chart - Gold to Warm Cream gradient
  lineGradientStart: 'hsl(46, 70%, 55%)', // Cassini Gold (lighter)
  lineGradientEnd: 'hsl(45, 30%, 85%)', // Warm Cream
  centerLine: 'hsl(46, 65%, 52%)', // Cassini Gold
  uclLine: 'hsl(357, 80%, 52%)', // Cassini Red
  lclLine: 'hsl(357, 80%, 52%)', // Cassini Red
  zoneA: 'hsl(32, 63%, 51%)', // Cassini Orange
  zoneB: 'hsl(48, 100%, 50%)', // Cassini Yellow
  zoneC: 'hsl(104, 55%, 40%)', // Cassini Green
  normalPoint: 'hsl(46, 65%, 52%)', // Cassini Gold
  violationPoint: 'hsl(357, 80%, 52%)', // Cassini Red
  undersizedPoint: 'hsl(32, 63%, 51%)', // Cassini Orange
  excludedPoint: 'hsl(210, 8%, 46%)', // Muted gray
  outOfControl: 'hsl(357, 80%, 52%)', // Cassini Red
  annotationColor: 'hsl(46, 65%, 52%)', // Cassini Gold (brand primary)

  // Secondary/comparison chart - Navy gradient (Cassini brand)
  secondaryLineGradientStart: 'hsl(220, 60%, 20%)', // Deep Navy
  secondaryLineGradientEnd: 'hsl(220, 40%, 30%)', // Navy lighter
  secondaryNormalPoint: 'hsl(220, 60%, 18%)', // Deep Navy (darker)
}

export const defaultChartColorsDark: ChartColors = {
  // Primary chart - Gold to Warm Cream gradient (boosted for dark bg)
  lineGradientStart: 'hsl(46, 75%, 62%)', // Gold boosted
  lineGradientEnd: 'hsl(45, 35%, 82%)', // Warm Cream (keep warm)
  centerLine: 'hsl(46, 70%, 62%)', // Gold boosted
  uclLine: 'hsl(357, 85%, 62%)', // Red boosted
  lclLine: 'hsl(357, 85%, 62%)', // Red boosted
  zoneA: 'hsl(32, 68%, 58%)', // Orange boosted
  zoneB: 'hsl(48, 100%, 58%)', // Yellow boosted
  zoneC: 'hsl(104, 60%, 50%)', // Green boosted
  normalPoint: 'hsl(46, 70%, 60%)', // Gold boosted
  violationPoint: 'hsl(357, 85%, 62%)', // Red boosted
  undersizedPoint: 'hsl(32, 68%, 58%)', // Orange boosted
  excludedPoint: 'hsl(210, 12%, 58%)', // Gray lightened
  outOfControl: 'hsl(357, 85%, 62%)', // Red boosted
  annotationColor: 'hsl(46, 70%, 62%)', // Gold boosted

  // Secondary/comparison chart - Navy gradient (boosted significantly)
  secondaryLineGradientStart: 'hsl(220, 60%, 60%)', // Navy boosted to visible
  secondaryLineGradientEnd: 'hsl(220, 45%, 65%)', // Navy lighter boosted
  secondaryNormalPoint: 'hsl(220, 60%, 58%)', // Navy boosted
}

export const chartPresets: ChartColorPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Default Cassini colors',
    light: defaultChartColors,
    dark: defaultChartColorsDark,
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    description: 'Maximum visibility with bold, distinct colors',
    light: {
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
      annotationColor: 'hsl(220, 100%, 50%)',
      secondaryLineGradientStart: 'hsl(280, 100%, 50%)',
      secondaryLineGradientEnd: 'hsl(280, 100%, 50%)',
      secondaryNormalPoint: 'hsl(280, 100%, 45%)',
    },
    dark: {
      lineGradientStart: 'hsl(220, 100%, 65%)',
      lineGradientEnd: 'hsl(220, 100%, 65%)',
      centerLine: 'hsl(0, 0%, 100%)', // Black -> White for dark bg
      uclLine: 'hsl(0, 100%, 62%)',
      lclLine: 'hsl(0, 100%, 62%)',
      zoneA: 'hsl(0, 100%, 62%)',
      zoneB: 'hsl(45, 100%, 60%)',
      zoneC: 'hsl(120, 100%, 55%)',
      normalPoint: 'hsl(220, 100%, 65%)',
      violationPoint: 'hsl(0, 100%, 62%)',
      undersizedPoint: 'hsl(45, 100%, 60%)',
      excludedPoint: 'hsl(0, 0%, 60%)',
      outOfControl: 'hsl(0, 100%, 65%)',
      annotationColor: 'hsl(220, 100%, 65%)',
      secondaryLineGradientStart: 'hsl(280, 100%, 65%)',
      secondaryLineGradientEnd: 'hsl(280, 100%, 65%)',
      secondaryNormalPoint: 'hsl(280, 100%, 60%)',
    },
  },
  {
    id: 'colorblind-safe',
    name: 'Colorblind Safe',
    description: 'Optimized for deuteranopia and protanopia (red-green colorblindness)',
    light: {
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
      annotationColor: 'hsl(220, 80%, 50%)',
      secondaryLineGradientStart: 'hsl(270, 60%, 55%)',
      secondaryLineGradientEnd: 'hsl(270, 60%, 45%)',
      secondaryNormalPoint: 'hsl(270, 60%, 50%)',
    },
    dark: {
      lineGradientStart: 'hsl(220, 85%, 65%)',
      lineGradientEnd: 'hsl(200, 85%, 62%)',
      centerLine: 'hsl(220, 85%, 58%)',
      uclLine: 'hsl(30, 100%, 62%)',
      lclLine: 'hsl(30, 100%, 62%)',
      zoneA: 'hsl(30, 100%, 65%)',
      zoneB: 'hsl(55, 95%, 65%)',
      zoneC: 'hsl(200, 75%, 65%)',
      normalPoint: 'hsl(220, 85%, 65%)',
      violationPoint: 'hsl(30, 100%, 65%)',
      undersizedPoint: 'hsl(55, 95%, 62%)',
      excludedPoint: 'hsl(0, 0%, 65%)',
      outOfControl: 'hsl(30, 100%, 65%)',
      annotationColor: 'hsl(220, 85%, 65%)',
      secondaryLineGradientStart: 'hsl(270, 65%, 70%)',
      secondaryLineGradientEnd: 'hsl(270, 65%, 62%)',
      secondaryNormalPoint: 'hsl(270, 65%, 65%)',
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Grayscale with pattern differentiation for printing',
    light: {
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
      annotationColor: 'hsl(0, 0%, 25%)',
      secondaryLineGradientStart: 'hsl(0, 0%, 50%)',
      secondaryLineGradientEnd: 'hsl(0, 0%, 60%)',
      secondaryNormalPoint: 'hsl(0, 0%, 55%)',
    },
    dark: {
      // Inverted: dark grays become light grays
      lineGradientStart: 'hsl(0, 0%, 75%)',
      lineGradientEnd: 'hsl(0, 0%, 65%)',
      centerLine: 'hsl(0, 0%, 70%)',
      uclLine: 'hsl(0, 0%, 80%)',
      lclLine: 'hsl(0, 0%, 80%)',
      zoneA: 'hsl(0, 0%, 60%)',
      zoneB: 'hsl(0, 0%, 50%)',
      zoneC: 'hsl(0, 0%, 40%)',
      normalPoint: 'hsl(0, 0%, 75%)',
      violationPoint: 'hsl(0, 0%, 100%)', // Black -> White
      undersizedPoint: 'hsl(0, 0%, 60%)',
      excludedPoint: 'hsl(0, 0%, 45%)',
      outOfControl: 'hsl(0, 0%, 70%)',
      annotationColor: 'hsl(0, 0%, 75%)',
      secondaryLineGradientStart: 'hsl(0, 0%, 55%)',
      secondaryLineGradientEnd: 'hsl(0, 0%, 45%)',
      secondaryNormalPoint: 'hsl(0, 0%, 50%)',
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Steel blue tones matching the Blueprint visual style',
    light: {
      lineGradientStart: 'hsl(210, 60%, 45%)',
      lineGradientEnd: 'hsl(210, 40%, 60%)',
      centerLine: 'hsl(210, 50%, 50%)',
      uclLine: 'hsl(0, 65%, 50%)',
      lclLine: 'hsl(0, 65%, 50%)',
      zoneA: 'hsl(20, 60%, 50%)',
      zoneB: 'hsl(45, 70%, 50%)',
      zoneC: 'hsl(210, 50%, 55%)',
      normalPoint: 'hsl(210, 60%, 45%)',
      violationPoint: 'hsl(0, 70%, 48%)',
      undersizedPoint: 'hsl(30, 60%, 50%)',
      excludedPoint: 'hsl(210, 10%, 60%)',
      outOfControl: 'hsl(0, 65%, 50%)',
      annotationColor: 'hsl(210, 60%, 45%)',
      secondaryLineGradientStart: 'hsl(200, 70%, 35%)',
      secondaryLineGradientEnd: 'hsl(200, 50%, 50%)',
      secondaryNormalPoint: 'hsl(200, 70%, 30%)',
    },
    dark: {
      lineGradientStart: 'hsl(210, 65%, 62%)',
      lineGradientEnd: 'hsl(210, 45%, 68%)',
      centerLine: 'hsl(210, 55%, 62%)',
      uclLine: 'hsl(0, 70%, 62%)',
      lclLine: 'hsl(0, 70%, 62%)',
      zoneA: 'hsl(20, 65%, 58%)',
      zoneB: 'hsl(45, 75%, 58%)',
      zoneC: 'hsl(210, 55%, 62%)',
      normalPoint: 'hsl(210, 65%, 62%)',
      violationPoint: 'hsl(0, 75%, 62%)',
      undersizedPoint: 'hsl(30, 65%, 58%)',
      excludedPoint: 'hsl(210, 15%, 60%)',
      outOfControl: 'hsl(0, 70%, 62%)',
      annotationColor: 'hsl(210, 65%, 62%)',
      secondaryLineGradientStart: 'hsl(200, 75%, 58%)',
      secondaryLineGradientEnd: 'hsl(200, 55%, 62%)',
      secondaryNormalPoint: 'hsl(200, 75%, 55%)',
    },
  },
  {
    id: 'mission-control',
    name: 'Mission Control',
    description: 'Cyan telemetry tones matching the Mission Control visual style',
    light: {
      lineGradientStart: 'hsl(187, 80%, 42%)',
      lineGradientEnd: 'hsl(187, 60%, 55%)',
      centerLine: 'hsl(187, 70%, 45%)',
      uclLine: 'hsl(0, 80%, 55%)',
      lclLine: 'hsl(0, 80%, 55%)',
      zoneA: 'hsl(25, 80%, 55%)',
      zoneB: 'hsl(50, 90%, 50%)',
      zoneC: 'hsl(170, 60%, 42%)',
      normalPoint: 'hsl(187, 80%, 42%)',
      violationPoint: 'hsl(0, 85%, 55%)',
      undersizedPoint: 'hsl(40, 80%, 50%)',
      excludedPoint: 'hsl(200, 10%, 55%)',
      outOfControl: 'hsl(0, 80%, 55%)',
      annotationColor: 'hsl(187, 80%, 42%)',
      secondaryLineGradientStart: 'hsl(260, 50%, 55%)',
      secondaryLineGradientEnd: 'hsl(260, 40%, 65%)',
      secondaryNormalPoint: 'hsl(260, 50%, 50%)',
    },
    dark: {
      lineGradientStart: 'hsl(187, 85%, 58%)',
      lineGradientEnd: 'hsl(187, 65%, 62%)',
      centerLine: 'hsl(187, 75%, 58%)',
      uclLine: 'hsl(0, 85%, 65%)',
      lclLine: 'hsl(0, 85%, 65%)',
      zoneA: 'hsl(25, 85%, 62%)',
      zoneB: 'hsl(50, 95%, 58%)',
      zoneC: 'hsl(170, 65%, 55%)',
      normalPoint: 'hsl(187, 85%, 58%)',
      violationPoint: 'hsl(0, 90%, 65%)',
      undersizedPoint: 'hsl(40, 85%, 58%)',
      excludedPoint: 'hsl(200, 15%, 58%)',
      outOfControl: 'hsl(0, 85%, 65%)',
      annotationColor: 'hsl(187, 85%, 58%)',
      secondaryLineGradientStart: 'hsl(260, 55%, 65%)',
      secondaryLineGradientEnd: 'hsl(260, 45%, 70%)',
      secondaryNormalPoint: 'hsl(260, 55%, 60%)',
    },
  },
  {
    id: 'e-ink',
    name: 'E-Ink',
    description: 'High contrast ink tones matching the E-Ink visual style',
    light: {
      lineGradientStart: 'hsl(220, 15%, 25%)',
      lineGradientEnd: 'hsl(220, 10%, 40%)',
      centerLine: 'hsl(220, 12%, 30%)',
      uclLine: 'hsl(0, 60%, 40%)',
      lclLine: 'hsl(0, 60%, 40%)',
      zoneA: 'hsl(0, 50%, 45%)',
      zoneB: 'hsl(40, 50%, 45%)',
      zoneC: 'hsl(150, 30%, 40%)',
      normalPoint: 'hsl(220, 15%, 25%)',
      violationPoint: 'hsl(0, 65%, 38%)',
      undersizedPoint: 'hsl(35, 50%, 42%)',
      excludedPoint: 'hsl(0, 0%, 65%)',
      outOfControl: 'hsl(0, 55%, 42%)',
      annotationColor: 'hsl(220, 15%, 30%)',
      secondaryLineGradientStart: 'hsl(0, 0%, 45%)',
      secondaryLineGradientEnd: 'hsl(0, 0%, 55%)',
      secondaryNormalPoint: 'hsl(0, 0%, 40%)',
    },
    dark: {
      // Ink tones boosted: 25% -> 72%, saturation 15% -> 40%
      lineGradientStart: 'hsl(220, 40%, 72%)',
      lineGradientEnd: 'hsl(220, 35%, 68%)',
      centerLine: 'hsl(220, 38%, 70%)',
      uclLine: 'hsl(0, 65%, 62%)',
      lclLine: 'hsl(0, 65%, 62%)',
      zoneA: 'hsl(0, 55%, 62%)',
      zoneB: 'hsl(40, 55%, 62%)',
      zoneC: 'hsl(150, 38%, 60%)',
      normalPoint: 'hsl(220, 40%, 72%)',
      violationPoint: 'hsl(0, 70%, 62%)',
      undersizedPoint: 'hsl(35, 55%, 60%)',
      excludedPoint: 'hsl(0, 0%, 55%)',
      outOfControl: 'hsl(0, 60%, 62%)',
      annotationColor: 'hsl(220, 40%, 70%)',
      secondaryLineGradientStart: 'hsl(0, 0%, 62%)',
      secondaryLineGradientEnd: 'hsl(0, 0%, 68%)',
      secondaryNormalPoint: 'hsl(0, 0%, 58%)',
    },
  },
  {
    id: 'bento',
    name: 'Bento Box',
    description: 'Clean Apple-style tones matching the Bento Box visual style',
    light: {
      lineGradientStart: 'hsl(220, 90%, 56%)',
      lineGradientEnd: 'hsl(250, 70%, 60%)',
      centerLine: 'hsl(220, 80%, 50%)',
      uclLine: 'hsl(0, 75%, 55%)',
      lclLine: 'hsl(0, 75%, 55%)',
      zoneA: 'hsl(15, 80%, 55%)',
      zoneB: 'hsl(45, 90%, 52%)',
      zoneC: 'hsl(145, 60%, 42%)',
      normalPoint: 'hsl(220, 90%, 56%)',
      violationPoint: 'hsl(0, 80%, 55%)',
      undersizedPoint: 'hsl(38, 90%, 50%)',
      excludedPoint: 'hsl(0, 0%, 70%)',
      outOfControl: 'hsl(0, 75%, 55%)',
      annotationColor: 'hsl(220, 90%, 56%)',
      secondaryLineGradientStart: 'hsl(280, 65%, 55%)',
      secondaryLineGradientEnd: 'hsl(280, 50%, 65%)',
      secondaryNormalPoint: 'hsl(280, 65%, 50%)',
    },
    dark: {
      // Already fairly bright, modest boost +8-10%
      lineGradientStart: 'hsl(220, 92%, 64%)',
      lineGradientEnd: 'hsl(250, 75%, 68%)',
      centerLine: 'hsl(220, 85%, 60%)',
      uclLine: 'hsl(0, 80%, 63%)',
      lclLine: 'hsl(0, 80%, 63%)',
      zoneA: 'hsl(15, 85%, 63%)',
      zoneB: 'hsl(45, 92%, 60%)',
      zoneC: 'hsl(145, 65%, 52%)',
      normalPoint: 'hsl(220, 92%, 64%)',
      violationPoint: 'hsl(0, 85%, 63%)',
      undersizedPoint: 'hsl(38, 92%, 58%)',
      excludedPoint: 'hsl(0, 0%, 65%)',
      outOfControl: 'hsl(0, 80%, 63%)',
      annotationColor: 'hsl(220, 92%, 64%)',
      secondaryLineGradientStart: 'hsl(280, 70%, 63%)',
      secondaryLineGradientEnd: 'hsl(280, 55%, 72%)',
      secondaryNormalPoint: 'hsl(280, 70%, 58%)',
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Neon pink and cyan tones matching the Synthwave visual style',
    light: {
      lineGradientStart: 'hsl(325, 85%, 55%)',
      lineGradientEnd: 'hsl(280, 70%, 60%)',
      centerLine: 'hsl(185, 100%, 45%)',
      uclLine: 'hsl(340, 90%, 55%)',
      lclLine: 'hsl(340, 90%, 55%)',
      zoneA: 'hsl(340, 80%, 55%)',
      zoneB: 'hsl(280, 60%, 55%)',
      zoneC: 'hsl(185, 80%, 42%)',
      normalPoint: 'hsl(325, 85%, 55%)',
      violationPoint: 'hsl(0, 90%, 60%)',
      undersizedPoint: 'hsl(50, 100%, 55%)',
      excludedPoint: 'hsl(270, 15%, 55%)',
      outOfControl: 'hsl(340, 90%, 55%)',
      annotationColor: 'hsl(185, 100%, 45%)',
      secondaryLineGradientStart: 'hsl(185, 100%, 45%)',
      secondaryLineGradientEnd: 'hsl(200, 80%, 55%)',
      secondaryNormalPoint: 'hsl(185, 100%, 40%)',
    },
    dark: {
      // Already neon/bright, minimal boost +3-5%
      lineGradientStart: 'hsl(325, 88%, 58%)',
      lineGradientEnd: 'hsl(280, 73%, 63%)',
      centerLine: 'hsl(185, 100%, 48%)',
      uclLine: 'hsl(340, 92%, 58%)',
      lclLine: 'hsl(340, 92%, 58%)',
      zoneA: 'hsl(340, 83%, 58%)',
      zoneB: 'hsl(280, 63%, 58%)',
      zoneC: 'hsl(185, 83%, 45%)',
      normalPoint: 'hsl(325, 88%, 58%)',
      violationPoint: 'hsl(0, 92%, 63%)',
      undersizedPoint: 'hsl(50, 100%, 58%)',
      excludedPoint: 'hsl(270, 18%, 58%)',
      outOfControl: 'hsl(340, 92%, 58%)',
      annotationColor: 'hsl(185, 100%, 48%)',
      secondaryLineGradientStart: 'hsl(185, 100%, 48%)',
      secondaryLineGradientEnd: 'hsl(200, 83%, 58%)',
      secondaryNormalPoint: 'hsl(185, 100%, 43%)',
    },
  },
]

const STORAGE_KEY = 'cassini-chart-colors'
const PRESET_STORAGE_KEY = 'cassini-chart-preset'

export function getStoredChartColors(mode: 'light' | 'dark' = 'light'): ChartColors {
  if (typeof window === 'undefined') return mode === 'dark' ? defaultChartColorsDark : defaultChartColors

  const presetId = localStorage.getItem(PRESET_STORAGE_KEY)

  // Custom colors: return as-is regardless of mode
  if (presetId === 'custom') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return { ...defaultChartColors, ...JSON.parse(stored) }
      } catch {
        return mode === 'dark' ? defaultChartColorsDark : defaultChartColors
      }
    }
  }

  // Preset colors: resolve by mode
  if (presetId) {
    const preset = chartPresets.find((p) => p.id === presetId)
    if (preset) return preset[mode]
  }

  return mode === 'dark' ? defaultChartColorsDark : defaultChartColors
}

export function getStoredPresetId(): string {
  if (typeof window === 'undefined') return 'classic'
  const stored = localStorage.getItem(PRESET_STORAGE_KEY)
  if (stored === 'custom') return 'custom'
  if (stored && chartPresets.some((p) => p.id === stored)) return stored
  return 'classic'
}

export function saveChartPreset(presetId: string): void {
  localStorage.setItem(PRESET_STORAGE_KEY, presetId)
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent('chart-colors-changed'))
}

export function saveCustomChartColors(colors: ChartColors): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  localStorage.setItem(PRESET_STORAGE_KEY, 'custom')
  window.dispatchEvent(new CustomEvent('chart-colors-changed'))
}

export function saveChartColors(colors: ChartColors, presetId?: string): void {
  if (presetId && presetId !== 'custom') {
    saveChartPreset(presetId)
  } else {
    saveCustomChartColors(colors)
  }
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
  root.style.setProperty('--chart-annotation-color', colors.annotationColor)
}
