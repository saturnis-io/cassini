/**
 * Visual Style Registry — single source of truth for all visual styles.
 *
 * Adding a new style:
 * 1. Add an entry to VISUAL_STYLES below
 * 2. Add the corresponding CSS block in index.css (light + dark variants)
 * 3. That's it — ThemeProvider, AppearanceSettings, and BrandingSettings
 *    all read from this registry automatically.
 */

export const VISUAL_STYLES = {
  modern: {
    label: 'Modern',
    desc: 'Clean, rounded, standard look',
    cssClass: null,
  },
  retro: {
    label: 'Retro',
    desc: 'Sharp edges, monospace accents, industrial control-panel feel',
    cssClass: 'retro',
  },
  glass: {
    label: 'Glass',
    desc: 'Frosted panels, blur effects, rounded and luminous',
    cssClass: 'glass',
  },
  blueprint: {
    label: 'Blueprint',
    desc: 'Engineering drafting paper, technical grid lines, construction aesthetic',
    cssClass: 'blueprint',
  },
  'mission-control': {
    label: 'Mission Control',
    desc: 'Space telemetry HUD, cyan glow accents, data-forward cockpit feel',
    cssClass: 'mission-control',
  },
  'e-ink': {
    label: 'E-Ink',
    desc: 'Paper-like, high contrast, distraction-free — optimized for readability',
    cssClass: 'e-ink',
  },
  bento: {
    label: 'Bento Box',
    desc: 'Apple-style modular tiles, generous radius, soft shadows',
    cssClass: 'bento',
  },
  synthwave: {
    label: 'Synthwave',
    desc: '80s retro-futuristic, sunset gradients, neon glow accents',
    cssClass: 'synthwave',
  },
} as const

export type VisualStyle = keyof typeof VISUAL_STYLES

/** All valid style keys — used for validation and classList cleanup. */
export const ALL_STYLE_KEYS = Object.keys(VISUAL_STYLES) as VisualStyle[]

/** All CSS class names that need to be removed when switching styles. */
export const ALL_STYLE_CSS_CLASSES: string[] = Object.values(VISUAL_STYLES)
  .map((s) => s.cssClass)
  .filter((c): c is string => c !== null)

/** Options array for UI selectors (AppearanceSettings, BrandingSettings). */
export const VISUAL_STYLE_OPTIONS = ALL_STYLE_KEYS.map((key) => ({
  value: key,
  label: VISUAL_STYLES[key].label,
  desc: VISUAL_STYLES[key].desc,
}))
