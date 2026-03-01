import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import {
  type BrandConfig as FullBrandConfig,
  hexToHsl,
  hslToCssString,
  resolveFullPalette,
  isValidHexColor,
} from '@/lib/brand-engine'
import { findPairing, loadFontPairing } from '@/lib/font-pairings'
import { systemSettingsApi } from '@/api/system-settings.api'
import { setServerDisplayKeyFormat, type DisplayKeyFormat } from '@/lib/display-key'
import type { BrandConfigDTO, DisplayKeyFormatDTO } from '@/types'

type Theme = 'light' | 'dark' | 'system'
export type VisualStyle = 'modern' | 'retro' | 'glass'

/**
 * Legacy brand config shape — kept for backward compatibility.
 * Components that access .primaryColor, .accentColor, .appName, .logoUrl
 * still work via this interface.
 */
export interface BrandConfig {
  primaryColor: string
  accentColor: string
  logoUrl: string | null
  appName: string
}

interface ThemeContextValue {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'

  // Visual style
  visualStyle: VisualStyle
  setVisualStyle: (style: VisualStyle) => void

  // Brand customization — legacy shape for existing consumers
  brandConfig: BrandConfig
  setBrandConfig: (config: Partial<BrandConfig>) => void
  resetBrandConfig: () => void

  // Full brand config from brand-engine (new consumers)
  fullBrandConfig: FullBrandConfig
  setFullBrandConfig: (config: Partial<FullBrandConfig>) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'cassini-theme'
const BRAND_STORAGE_KEY = 'cassini-brand'
const VISUAL_STYLE_KEY = 'cassini-visual-style'

/** Default full brand config (Cassini defaults) */
const DEFAULT_FULL_BRAND_CONFIG: FullBrandConfig = {
  appName: 'Cassini',
  logoUrl: null,
  logoColors: null,
  primary: { hex: '#D4AF37' },
  accent: { hex: '#080C16' },
  destructive: null,
  warning: null,
  success: null,
  headingFont: 'Sansation',
  bodyFont: 'Inter',
  visualStyle: null,
  loginMode: null,
  loginBackgroundUrl: null,
  presetId: null,
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

/**
 * Read the full brand config from localStorage, merging with defaults.
 */
function getStoredFullBrandConfig(): FullBrandConfig {
  if (typeof window === 'undefined') return DEFAULT_FULL_BRAND_CONFIG
  try {
    const stored = localStorage.getItem(BRAND_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Handle legacy format (primaryColor/accentColor) migrating to full format
      if (parsed.primaryColor && !parsed.primary) {
        return {
          ...DEFAULT_FULL_BRAND_CONFIG,
          appName: parsed.appName ?? DEFAULT_FULL_BRAND_CONFIG.appName,
          logoUrl: parsed.logoUrl ?? DEFAULT_FULL_BRAND_CONFIG.logoUrl,
          primary: { hex: parsed.primaryColor },
          accent: { hex: parsed.accentColor ?? '#080C16' },
        }
      }
      return { ...DEFAULT_FULL_BRAND_CONFIG, ...parsed }
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return DEFAULT_FULL_BRAND_CONFIG
}

function getStoredVisualStyle(): VisualStyle {
  if (typeof window === 'undefined') return 'modern'
  const stored = localStorage.getItem(VISUAL_STYLE_KEY)
  if (stored === 'modern' || stored === 'retro' || stored === 'glass') {
    return stored
  }
  return 'modern'
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Convert a server BrandConfigDTO (snake_case) to the client FullBrandConfig (camelCase).
 */
function dtoToFullBrandConfig(dto: BrandConfigDTO): Partial<FullBrandConfig> {
  const result: Partial<FullBrandConfig> = {}

  if (dto.app_name != null) result.appName = dto.app_name
  if (dto.logo_url != null) result.logoUrl = dto.logo_url
  if (dto.logo_colors != null) {
    result.logoColors = {
      planet: dto.logo_colors.planet,
      ring: dto.logo_colors.ring,
      line: dto.logo_colors.line,
      dot: dto.logo_colors.dot,
    }
  }
  if (dto.primary != null) {
    result.primary = {
      hex: dto.primary.hex,
      lightOverride: dto.primary.light_override,
      darkOverride: dto.primary.dark_override,
    }
  }
  if (dto.accent != null) {
    result.accent = {
      hex: dto.accent.hex,
      lightOverride: dto.accent.light_override,
      darkOverride: dto.accent.dark_override,
    }
  }
  if (dto.destructive != null) {
    result.destructive = {
      hex: dto.destructive.hex,
      lightOverride: dto.destructive.light_override,
      darkOverride: dto.destructive.dark_override,
    }
  }
  if (dto.warning != null) {
    result.warning = {
      hex: dto.warning.hex,
      lightOverride: dto.warning.light_override,
      darkOverride: dto.warning.dark_override,
    }
  }
  if (dto.success != null) {
    result.success = {
      hex: dto.success.hex,
      lightOverride: dto.success.light_override,
      darkOverride: dto.success.dark_override,
    }
  }
  if (dto.heading_font != null) result.headingFont = dto.heading_font
  if (dto.body_font != null) result.bodyFont = dto.body_font
  if (dto.visual_style != null) {
    result.visualStyle = dto.visual_style as FullBrandConfig['visualStyle']
  }
  if (dto.login_mode != null) {
    result.loginMode = dto.login_mode as FullBrandConfig['loginMode']
  }
  if (dto.login_background_url != null) result.loginBackgroundUrl = dto.login_background_url
  if (dto.preset_id != null) result.presetId = dto.preset_id

  return result
}

/**
 * Derive a legacy BrandConfig from a FullBrandConfig for backward compatibility.
 */
function toLegacyBrandConfig(full: FullBrandConfig): BrandConfig {
  return {
    primaryColor: full.primary?.hex ?? '#D4AF37',
    accentColor: full.accent?.hex ?? '#080C16',
    logoUrl: full.logoUrl ?? null,
    appName: full.appName ?? 'Cassini',
  }
}

/**
 * Convert an HSL object from brand-engine to a CSS value string for custom properties.
 */
function hexToCssHsl(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToCssString(h, s, l)
}

/**
 * Apply brand colors and fonts as CSS custom properties.
 *
 * Uses resolveFullPalette from brand-engine to get WCAG-compliant colors
 * for the current mode, then sets CSS vars on :root.
 */
function applyBrandColors(config: FullBrandConfig, mode: 'light' | 'dark') {
  const root = document.documentElement
  const palette = resolveFullPalette(config, mode)

  // Set color CSS vars using HSL format for Tailwind compatibility
  root.style.setProperty('--color-primary', `hsl(${hexToCssHsl(palette.primary)})`)
  root.style.setProperty('--color-destructive', `hsl(${hexToCssHsl(palette.destructive)})`)
  root.style.setProperty('--color-warning', `hsl(${hexToCssHsl(palette.warning)})`)
  root.style.setProperty('--color-success', `hsl(${hexToCssHsl(palette.success)})`)

  // Set font CSS vars
  const headingFont = config.headingFont ?? 'Sansation'
  const bodyFont = config.bodyFont ?? 'Inter'
  root.style.setProperty('--font-heading', `'${headingFont}', sans-serif`)
  root.style.setProperty('--font-body', `'${bodyFont}', sans-serif`)

  // Load font pairing if fonts changed
  const pairing = findPairing(headingFont, bodyFont)
  if (pairing) {
    loadFontPairing(pairing).catch(() => {
      // Font loading failed — fall back to existing fonts silently
    })
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
    theme === 'system' ? getSystemTheme() : theme,
  )
  const [fullBrandConfig, setFullBrandConfigState] =
    useState<FullBrandConfig>(getStoredFullBrandConfig)
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(getStoredVisualStyle)
  const serverFetched = useRef(false)

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }, [])

  const setVisualStyle = useCallback((style: VisualStyle) => {
    setVisualStyleState(style)
    localStorage.setItem(VISUAL_STYLE_KEY, style)
  }, [])

  /**
   * Update the full brand config. Merges with current state and persists.
   */
  const setFullBrandConfig = useCallback((config: Partial<FullBrandConfig>) => {
    setFullBrandConfigState((prev) => {
      const newConfig = { ...prev, ...config }
      localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(newConfig))
      return newConfig
    })
  }, [])

  /**
   * Legacy setBrandConfig — accepts the old shape (primaryColor, accentColor, etc.)
   * and translates to full brand config updates.
   */
  const setBrandConfig = useCallback(
    (config: Partial<BrandConfig>) => {
      setFullBrandConfigState((prev) => {
        const newConfig = { ...prev }

        if (config.primaryColor !== undefined) {
          if (isValidHexColor(config.primaryColor)) {
            newConfig.primary = { ...newConfig.primary, hex: config.primaryColor }
          }
        }
        if (config.accentColor !== undefined) {
          if (isValidHexColor(config.accentColor)) {
            newConfig.accent = { ...newConfig.accent, hex: config.accentColor }
          }
        }
        if (config.logoUrl !== undefined) {
          newConfig.logoUrl = config.logoUrl
        }
        if (config.appName !== undefined) {
          newConfig.appName = config.appName || 'Cassini'
        }

        localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(newConfig))
        return newConfig
      })
    },
    [],
  )

  const resetBrandConfig = useCallback(() => {
    setFullBrandConfigState(DEFAULT_FULL_BRAND_CONFIG)
    localStorage.removeItem(BRAND_STORAGE_KEY)
    // Reset CSS variables to theme defaults
    const root = document.documentElement
    root.style.removeProperty('--color-primary')
    root.style.removeProperty('--color-destructive')
    root.style.removeProperty('--color-warning')
    root.style.removeProperty('--color-success')
    root.style.removeProperty('--font-heading')
    root.style.removeProperty('--font-body')
  }, [])

  // Fetch resolved settings from server on mount (fire-and-forget)
  useEffect(() => {
    if (serverFetched.current) return
    serverFetched.current = true

    systemSettingsApi
      .getResolved()
      .then((settings) => {
        if (settings.brand_config) {
          const serverConfig = dtoToFullBrandConfig(settings.brand_config)
          setFullBrandConfigState((prev) => {
            // Server values win over localStorage, merged with defaults
            const merged = { ...DEFAULT_FULL_BRAND_CONFIG, ...prev, ...serverConfig }
            localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(merged))
            return merged
          })
        }
        // Push display key format into the display-key module cache
        if (settings.display_key_format) {
          const dkf = settings.display_key_format as DisplayKeyFormatDTO
          const format: DisplayKeyFormat = {
            datePattern: dkf.date_pattern,
            separator: dkf.separator,
            numberPlacement: dkf.number_placement,
            numberDigits: dkf.number_digits,
          }
          setServerDisplayKeyFormat(format)
        }
      })
      .catch(() => {
        // Server unavailable — use localStorage/defaults silently
      })
  }, [])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'system' ? getSystemTheme() : theme
    setResolvedTheme(resolved)

    if (resolved === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [theme])

  // Apply brand colors when config or resolved theme changes
  useEffect(() => {
    applyBrandColors(fullBrandConfig, resolvedTheme)
  }, [fullBrandConfig, resolvedTheme])

  // Apply visual style class to document
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('modern', 'retro', 'glass')
    if (visualStyle !== 'modern') {
      root.classList.add(visualStyle)
    }
  }, [visualStyle])

  // Listen for system theme changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? 'dark' : 'light'
      setResolvedTheme(newResolved)
      document.documentElement.classList.toggle('dark', e.matches)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // Derive the legacy brandConfig from the full config
  const legacyBrandConfig = toLegacyBrandConfig(fullBrandConfig)

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        visualStyle,
        setVisualStyle,
        brandConfig: legacyBrandConfig,
        setBrandConfig,
        resetBrandConfig,
        fullBrandConfig,
        setFullBrandConfig,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
