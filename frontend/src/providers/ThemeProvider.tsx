import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

/**
 * Brand customization configuration
 */
export interface BrandConfig {
  /** Primary color (hex format, e.g., '#3b82f6') */
  primaryColor: string
  /** Accent color (hex format, e.g., '#8b5cf6') */
  accentColor: string
  /** Custom logo URL or data URI */
  logoUrl: string | null
  /** Custom app name to override 'OpenSPC' */
  appName: string
}

interface ThemeContextValue {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'

  // Brand customization
  brandConfig: BrandConfig
  setBrandConfig: (config: Partial<BrandConfig>) => void
  resetBrandConfig: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const THEME_STORAGE_KEY = 'openspc-theme'
const BRAND_STORAGE_KEY = 'openspc-brand'

/**
 * Default brand configuration
 */
const DEFAULT_BRAND_CONFIG: BrandConfig = {
  primaryColor: '#3b82f6', // blue-500
  accentColor: '#8b5cf6',  // violet-500
  logoUrl: null,
  appName: 'OpenSPC',
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

function getStoredBrandConfig(): BrandConfig {
  if (typeof window === 'undefined') return DEFAULT_BRAND_CONFIG
  try {
    const stored = localStorage.getItem(BRAND_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_BRAND_CONFIG, ...parsed }
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return DEFAULT_BRAND_CONFIG
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Validate hex color format
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}

/**
 * Convert hex color to HSL values for Tailwind CSS variables
 */
function hexToHsl(hex: string): string {
  // Remove # if present
  hex = hex.replace('#', '')

  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

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

  // Return as HSL values for CSS
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * Apply brand colors as CSS custom properties
 */
function applyBrandColors(config: BrandConfig) {
  const root = document.documentElement

  if (isValidHexColor(config.primaryColor)) {
    root.style.setProperty('--primary', hexToHsl(config.primaryColor))
  }

  if (isValidHexColor(config.accentColor)) {
    root.style.setProperty('--accent', hexToHsl(config.accentColor))
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(
    theme === 'system' ? getSystemTheme() : theme
  )
  const [brandConfig, setBrandConfigState] = useState<BrandConfig>(getStoredBrandConfig)

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(THEME_STORAGE_KEY, newTheme)
  }, [])

  const setBrandConfig = useCallback((config: Partial<BrandConfig>) => {
    setBrandConfigState((prev) => {
      // Validate colors before applying
      const newConfig = { ...prev }

      if (config.primaryColor !== undefined) {
        if (isValidHexColor(config.primaryColor)) {
          newConfig.primaryColor = config.primaryColor
        }
      }
      if (config.accentColor !== undefined) {
        if (isValidHexColor(config.accentColor)) {
          newConfig.accentColor = config.accentColor
        }
      }
      if (config.logoUrl !== undefined) {
        newConfig.logoUrl = config.logoUrl
      }
      if (config.appName !== undefined) {
        newConfig.appName = config.appName || 'OpenSPC'
      }

      // Persist to localStorage
      localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(newConfig))

      return newConfig
    })
  }, [])

  const resetBrandConfig = useCallback(() => {
    setBrandConfigState(DEFAULT_BRAND_CONFIG)
    localStorage.removeItem(BRAND_STORAGE_KEY)
    // Reset CSS variables
    const root = document.documentElement
    root.style.removeProperty('--primary')
    root.style.removeProperty('--accent')
  }, [])

  // Apply theme to document - intentional DOM sync
   
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

  // Apply brand colors when config changes
  useEffect(() => {
    applyBrandColors(brandConfig)
  }, [brandConfig])

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

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        resolvedTheme,
        brandConfig,
        setBrandConfig,
        resetBrandConfig,
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
