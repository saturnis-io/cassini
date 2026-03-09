/**
 * Brand Engine — Pure color math utilities for the Cassini enterprise branding system.
 *
 * All functions are pure (no React imports, no side effects, no DOM access).
 * Provides hex/HSL conversion, WCAG contrast checking, automatic light/dark
 * mode adjustment, and full palette resolution from a BrandConfig.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandColorSeed {
  hex: string // e.g. "#004A98"
  lightOverride?: string | null // manual light variant
  darkOverride?: string | null // manual dark variant
}

export interface LogoColors {
  planet?: string | null // default: accent color
  ring?: string | null // default: foreground
  line?: string | null // default: primary
  dot?: string | null // default: destructive
}

export interface BrandConfig {
  appName?: string | null
  logoUrl?: string | null
  logoColors?: LogoColors | null
  primary?: BrandColorSeed | null
  accent?: BrandColorSeed | null
  destructive?: BrandColorSeed | null
  warning?: BrandColorSeed | null
  success?: BrandColorSeed | null
  headingFont?: string | null
  bodyFont?: string | null
  visualStyle?: string | null
  loginMode?: 'saturn' | 'static' | null
  loginBackgroundUrl?: string | null
  presetId?: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT_BG = '#f5f3ee'
export const DEFAULT_DARK_BG = '#080C16'

/** Cassini brand defaults used when BrandConfig fields are null/missing. */
const DEFAULT_PRIMARY = '#D4AF37' // Cassini Gold
const DEFAULT_ACCENT = '#7473C0' // Cassini Purple
const DEFAULT_DESTRUCTIVE = '#EC1C24' // Cassini Red
const DEFAULT_WARNING = '#D48232' // Cassini Orange
const DEFAULT_SUCCESS = '#4C9C2E' // Cassini Green
const DEFAULT_FOREGROUND_LIGHT = '#080C16' // Deep Space Navy
const DEFAULT_FOREGROUND_DARK = '#F2F2F2' // Near-white

/** Minimum WCAG AA contrast ratio for normal text. */
const WCAG_AA_RATIO = 4.5

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const HEX_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/

/**
 * Returns true when `color` is a valid 3- or 6-digit hex color string
 * (with leading `#`).
 */
export function isValidHexColor(color: string): boolean {
  return HEX_RE.test(color)
}

// ---------------------------------------------------------------------------
// Hex ↔ HSL conversion
// ---------------------------------------------------------------------------

/**
 * Normalize a hex string to a full 6-digit lowercase form.
 * Returns the original string (lowered) if it cannot be parsed, so callers
 * can still pass the value through without crashing.
 */
function normalizeHex(hex: string): string {
  const h = hex.trim()
  if (h.length === 4 && h[0] === '#') {
    // Expand shorthand: #abc → #aabbcc
    return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`.toLowerCase()
  }
  return h.toLowerCase()
}

/**
 * Convert a hex color string to HSL components.
 *
 * Returns `{ h, s, l }` where h is in [0, 360), s and l in [0, 100].
 * Invalid input falls back to `{ h: 0, s: 0, l: 0 }` (black).
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const norm = normalizeHex(hex)
  if (!isValidHexColor(norm)) {
    return { h: 0, s: 0, l: 0 }
  }

  const r = parseInt(norm.slice(1, 3), 16) / 255
  const g = parseInt(norm.slice(3, 5), 16) / 255
  const b = parseInt(norm.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6
    } else {
      h = ((r - g) / d + 4) / 6
    }
  }

  return {
    h: Math.round(h * 3600) / 10, // one decimal
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10,
  }
}

/**
 * Convert HSL values to a hex string.
 *
 * `h` in [0, 360], `s` and `l` in [0, 100].
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100
  const lN = l / 100

  const c = (1 - Math.abs(2 * lN - 1)) * sN
  const hPrime = ((((h % 360) + 360) % 360) / 60) // normalize hue
  const x = c * (1 - Math.abs((hPrime % 2) - 1))
  const m = lN - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (hPrime < 1) {
    r = c; g = x; b = 0
  } else if (hPrime < 2) {
    r = x; g = c; b = 0
  } else if (hPrime < 3) {
    r = 0; g = c; b = x
  } else if (hPrime < 4) {
    r = 0; g = x; b = c
  } else if (hPrime < 5) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }

  const toHexByte = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`
}

/**
 * Return an HSL value in the Tailwind CSS custom property format:
 * `"210 50% 40%"` (space-separated, no commas, no `hsl()` wrapper).
 */
export function hslToCssString(h: number, s: number, l: number): string {
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`
}

// ---------------------------------------------------------------------------
// WCAG luminance & contrast
// ---------------------------------------------------------------------------

/**
 * Linearize an sRGB channel value (0-255 scale → linear 0-1).
 */
function linearize(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * WCAG 2.x relative luminance of a hex color.
 * Returns a value in [0, 1] where 0 is darkest and 1 is lightest.
 * Invalid hex falls back to 0 (black).
 */
export function relativeLuminance(hex: string): number {
  const norm = normalizeHex(hex)
  if (!isValidHexColor(norm)) return 0

  const r = linearize(parseInt(norm.slice(1, 3), 16))
  const g = linearize(parseInt(norm.slice(3, 5), 16))
  const b = linearize(parseInt(norm.slice(5, 7), 16))

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * WCAG contrast ratio between two hex colors.
 * Always returns a value >= 1 (lighter / darker + 0.05 each).
 */
export function contrastRatio(fg: string, bg: string): number {
  const lum1 = relativeLuminance(fg)
  const lum2 = relativeLuminance(bg)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Returns `true` when the foreground/background pair meets WCAG AA
 * for normal text (contrast ratio >= 4.5:1).
 */
export function meetsWCAG_AA(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= WCAG_AA_RATIO
}

// ---------------------------------------------------------------------------
// Automatic light/dark adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust a seed hex color so it works well against the canonical
 * light (`#f5f3ee`) or dark (`#080C16`) background.
 *
 * Strategy:
 * - Light mode: if the color is too light (low contrast), darken it.
 * - Dark mode: if the color is too dark (low contrast), lighten it.
 *
 * Saturation is also nudged to keep colors vivid after lightness changes.
 * Returns a hex string.
 */
export function autoAdjustForMode(seedHex: string, mode: 'light' | 'dark'): string {
  const norm = normalizeHex(seedHex)
  if (!isValidHexColor(norm)) {
    return mode === 'light' ? DEFAULT_PRIMARY : DEFAULT_PRIMARY
  }

  const bgHex = mode === 'light' ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG
  const { h, s, l } = hexToHsl(norm)

  let adjustedL = l
  let adjustedS = s

  if (mode === 'light') {
    // Light mode: ensure the color is dark enough to read on light bg.
    // Pull lightness down and keep saturation punchy.
    if (l > 55) {
      adjustedL = Math.max(25, l - 20)
    }
    if (l > 40 && s > 30) {
      // Boost saturation slightly when darkening vivid colors
      adjustedS = Math.min(100, s + 5)
    }
  } else {
    // Dark mode: ensure the color is light enough to read on dark bg.
    if (l < 45) {
      adjustedL = Math.min(75, l + 20)
    }
    if (l < 55 && s > 30) {
      adjustedS = Math.min(100, s + 8)
    }
  }

  // Iteratively nudge lightness until WCAG AA is met (max 20 steps)
  let candidate = hslToHex(h, adjustedS, adjustedL)
  let iterations = 0
  while (!meetsWCAG_AA(candidate, bgHex) && iterations < 20) {
    if (mode === 'light') {
      adjustedL = Math.max(5, adjustedL - 3)
    } else {
      adjustedL = Math.min(95, adjustedL + 3)
    }
    candidate = hslToHex(h, adjustedS, adjustedL)
    iterations++
  }

  return candidate
}

// ---------------------------------------------------------------------------
// Resolve seed with overrides
// ---------------------------------------------------------------------------

/**
 * Resolve a `BrandColorSeed` to a concrete hex color for the given mode.
 *
 * 1. If the seed has a manual override for this mode, use it (if valid hex).
 * 2. Otherwise, auto-adjust the seed hex for the mode, checking contrast
 *    against the provided `bgHex`.
 */
export function resolveColorForMode(
  seed: BrandColorSeed,
  mode: 'light' | 'dark',
  bgHex: string,
): string {
  const override = mode === 'light' ? seed.lightOverride : seed.darkOverride
  if (override && isValidHexColor(override)) {
    return normalizeHex(override)
  }

  const base = isValidHexColor(seed.hex) ? seed.hex : DEFAULT_PRIMARY

  // Use autoAdjustForMode which targets the canonical bg for the mode.
  // If the caller's bgHex differs from canonical, do an extra contrast check
  // and nudge if needed.
  let adjusted = autoAdjustForMode(base, mode)
  const canonicalBg = mode === 'light' ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG

  if (normalizeHex(bgHex) !== normalizeHex(canonicalBg)) {
    // Re-check against the actual bg
    const { h, s } = hexToHsl(adjusted)
    let { l } = hexToHsl(adjusted)
    let iterations = 0
    while (!meetsWCAG_AA(adjusted, bgHex) && iterations < 20) {
      if (mode === 'light') {
        l = Math.max(5, l - 3)
      } else {
        l = Math.min(95, l + 3)
      }
      adjusted = hslToHex(h, s, l)
      iterations++
    }
  }

  return adjusted
}

// ---------------------------------------------------------------------------
// Logo color derivation
// ---------------------------------------------------------------------------

/**
 * Derive full logo colors from a BrandConfig, filling in defaults from
 * the brand palette.
 *
 * Defaults:
 * - `planet`: accent seed hex (or Cassini Purple)
 * - `ring`: foreground (Deep Space Navy light / near-white dark)
 * - `line`: primary seed hex (or Cassini Gold)
 * - `dot`: destructive seed hex (or Cassini Red)
 */
export function deriveLogoColors(brand: BrandConfig): { planet: string; ring: string; line: string; dot: string } {
  const accentHex = brand.accent?.hex ?? DEFAULT_ACCENT
  const primaryHex = brand.primary?.hex ?? DEFAULT_PRIMARY
  const destructiveHex = brand.destructive?.hex ?? DEFAULT_DESTRUCTIVE

  return {
    planet: brand.logoColors?.planet ?? accentHex,
    ring: brand.logoColors?.ring ?? DEFAULT_FOREGROUND_LIGHT,
    line: brand.logoColors?.line ?? primaryHex,
    dot: brand.logoColors?.dot ?? destructiveHex,
  }
}

// ---------------------------------------------------------------------------
// Full palette resolution
// ---------------------------------------------------------------------------

/**
 * Resolve every brandable CSS variable value for the given mode.
 *
 * Returns a flat `Record<string, string>` keyed by logical name (e.g.
 * `"primary"`, `"accent"`, `"destructive"`, `"warning"`, `"success"`,
 * `"foreground"`, `"background"`).
 *
 * All values are hex strings suitable for further conversion to CSS custom
 * properties via `hslToCssString(hexToHsl(...))`.
 */
export function resolveFullPalette(
  brand: BrandConfig,
  mode: 'light' | 'dark',
): Record<string, string> {
  const bg = mode === 'light' ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG
  const fg = mode === 'light' ? DEFAULT_FOREGROUND_LIGHT : DEFAULT_FOREGROUND_DARK

  const resolve = (seed: BrandColorSeed | null | undefined, fallback: string): string => {
    if (!seed) {
      return autoAdjustForMode(fallback, mode)
    }
    return resolveColorForMode(seed, mode, bg)
  }

  return {
    background: bg,
    foreground: fg,
    primary: resolve(brand.primary, DEFAULT_PRIMARY),
    accent: resolve(brand.accent, DEFAULT_ACCENT),
    destructive: resolve(brand.destructive, DEFAULT_DESTRUCTIVE),
    warning: resolve(brand.warning, DEFAULT_WARNING),
    success: resolve(brand.success, DEFAULT_SUCCESS),
  }
}
