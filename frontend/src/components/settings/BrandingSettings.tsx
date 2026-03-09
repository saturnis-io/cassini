import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  Upload,
  RotateCcw,
  Check,
  ChevronDown,
  Palette,
  Type,
  Monitor,
  Image,
  Paintbrush,
  Sun,
  Moon,
  X,
} from 'lucide-react'
import { HelpTooltip } from '@/components/HelpTooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { VISUAL_STYLE_OPTIONS, type VisualStyle } from '@/lib/visual-styles'
import {
  type BrandConfig,
  type BrandColorSeed,
  isValidHexColor,
  autoAdjustForMode,
  contrastRatio,
  deriveLogoColors,
  DEFAULT_LIGHT_BG,
  DEFAULT_DARK_BG,
} from '@/lib/brand-engine'
import { BRAND_PRESETS } from '@/lib/brand-presets'
import { FONT_PAIRINGS } from '@/lib/font-pairings'
import { CassiniLogo } from '@/components/login/CassiniLogo'
import { useUpdateSystemSettings } from '@/api/hooks/systemSettings'
import type { BrandConfigDTO } from '@/types'

// ---------------------------------------------------------------------------
// Helper: camelCase BrandConfig -> snake_case BrandConfigDTO
// ---------------------------------------------------------------------------

function toDTO(config: BrandConfig): BrandConfigDTO {
  return {
    app_name: config.appName,
    logo_url: config.logoUrl,
    logo_colors: config.logoColors
      ? {
          planet: config.logoColors.planet,
          ring: config.logoColors.ring,
          line: config.logoColors.line,
          dot: config.logoColors.dot,
        }
      : null,
    primary: config.primary
      ? {
          hex: config.primary.hex,
          light_override: config.primary.lightOverride,
          dark_override: config.primary.darkOverride,
        }
      : null,
    accent: config.accent
      ? {
          hex: config.accent.hex,
          light_override: config.accent.lightOverride,
          dark_override: config.accent.darkOverride,
        }
      : null,
    destructive: config.destructive
      ? {
          hex: config.destructive.hex,
          light_override: config.destructive.lightOverride,
          dark_override: config.destructive.darkOverride,
        }
      : null,
    warning: config.warning
      ? {
          hex: config.warning.hex,
          light_override: config.warning.lightOverride,
          dark_override: config.warning.darkOverride,
        }
      : null,
    success: config.success
      ? {
          hex: config.success.hex,
          light_override: config.success.lightOverride,
          dark_override: config.success.darkOverride,
        }
      : null,
    heading_font: config.headingFont,
    body_font: config.bodyFont,
    visual_style: config.visualStyle,
    login_mode: config.loginMode,
    login_background_url: config.loginBackgroundUrl,
    preset_id: config.presetId,
  }
}

// ---------------------------------------------------------------------------
// Semantic color metadata
// ---------------------------------------------------------------------------

const SEMANTIC_COLORS = [
  {
    key: 'destructive' as const,
    label: 'Destructive',
    defaultHex: '#EC1C24',
    helpKey: 'brand-color-destructive',
  },
  {
    key: 'warning' as const,
    label: 'Warning',
    defaultHex: '#D48232',
    helpKey: 'brand-color-warning',
  },
  {
    key: 'success' as const,
    label: 'Success',
    defaultHex: '#4C9C2E',
    helpKey: 'brand-color-success',
  },
] as const

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Compact override picker for a single mode (Light or Dark).
 * Shows one color picker with the effective color. If the user picks a color
 * it becomes an override; they can clear it to revert to auto.
 */
function MiniOverridePicker({
  mode,
  autoColor,
  override,
  onChange,
  onClear,
}: {
  mode: 'Light' | 'Dark'
  autoColor: string
  override: string | null | undefined
  onChange: (hex: string) => void
  onClear: () => void
}) {
  const hasOverride = !!override && isValidHexColor(override)
  const displayColor = hasOverride ? override : autoColor
  const ModeIcon = mode === 'Light' ? Sun : Moon

  return (
    <div className="flex items-center gap-2">
      <ModeIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <div
        className="border-border h-6 w-8 shrink-0 overflow-hidden rounded border"
        title={hasOverride ? `Override: ${override}` : `Auto: ${autoColor}`}
      >
        <input
          type="color"
          value={displayColor}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 -translate-x-1 -translate-y-1 cursor-pointer border-0 p-0"
        />
      </div>
      <span className="font-mono text-[10px]" style={{ color: displayColor }}>
        {displayColor}
      </span>
      {hasOverride ? (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:text-foreground rounded p-0.5 transition-colors"
          title="Revert to auto"
        >
          <X className="h-3 w-3" />
        </button>
      ) : (
        <span className="text-muted-foreground text-[10px]">auto</span>
      )}
    </div>
  )
}

function ColorSeedPicker({
  label,
  seed,
  onChange,
  helpKey,
}: {
  label: string
  seed: BrandColorSeed | null | undefined
  onChange: (seed: BrandColorSeed) => void
  helpKey?: string
}) {
  const hex = seed?.hex ?? '#000000'
  const [showOverrides, setShowOverrides] = useState(false)

  const lightAuto = autoAdjustForMode(hex, 'light')
  const darkAuto = autoAdjustForMode(hex, 'dark')

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex w-28 items-center gap-1.5">
          <label className="text-muted-foreground text-sm font-medium">
            {label}
          </label>
          {helpKey && (
            <HelpTooltip helpKey={helpKey} placement="right" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className="border-border h-8 w-8 rounded border"
            style={{ backgroundColor: hex }}
          />
          <div className="border-border h-8 w-12 overflow-hidden rounded border">
            <input
              type="color"
              value={hex}
              onChange={(e) => onChange({ ...seed, hex: e.target.value })}
              className="h-10 w-14 -translate-x-1 -translate-y-1 cursor-pointer border-0 p-0"
            />
          </div>
          <input
            type="text"
            value={hex}
            onChange={(e) => {
              if (isValidHexColor(e.target.value))
                onChange({ ...seed, hex: e.target.value })
            }}
            className="border-border bg-background w-24 rounded border px-2 py-1 font-mono text-sm"
            placeholder="#000000"
          />
        </div>
      </div>

      {/* Overrides toggle */}
      <div className="ml-31">
        <button
          onClick={() => setShowOverrides((p) => !p)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[11px] transition-colors"
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform',
              showOverrides && 'rotate-180',
            )}
          />
          Overrides
          {(seed?.lightOverride || seed?.darkOverride) && (
            <span className="bg-primary/20 text-primary rounded-full px-1.5 text-[9px]">
              custom
            </span>
          )}
        </button>
        {showOverrides && (
          <div className="mt-1.5 space-y-1.5">
            <MiniOverridePicker
              mode="Light"
              autoColor={lightAuto}
              override={seed?.lightOverride}
              onChange={(c) =>
                onChange({ ...seed, hex, lightOverride: c })
              }
              onClear={() =>
                onChange({ ...seed, hex, lightOverride: null })
              }
            />
            <MiniOverridePicker
              mode="Dark"
              autoColor={darkAuto}
              override={seed?.darkOverride}
              onChange={(c) =>
                onChange({ ...seed, hex, darkOverride: c })
              }
              onClear={() =>
                onChange({ ...seed, hex, darkOverride: null })
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Visual contrast preview — shows actual text rendered in the color against the
 * background, with a WCAG AA pass/fail indicator. Users can *see* whether the
 * color is readable rather than interpreting abstract ratio numbers.
 */
function ContrastSample({
  fg,
  bg,
  modeLabel,
}: {
  fg: string
  bg: string
  modeLabel: 'Light' | 'Dark'
}) {
  const ratio = contrastRatio(fg, bg)
  const passes = ratio >= 4.5
  const icon = modeLabel === 'Light' ? Sun : Moon

  return (
    <div className="flex items-center gap-2">
      {React.createElement(icon, {
        className: 'h-3 w-3 text-muted-foreground shrink-0',
      })}
      <div
        className="flex items-center gap-2 rounded-md px-3 py-1.5"
        style={{ backgroundColor: bg }}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: fg }}
        >
          Sample Text
        </span>
        {!passes && (
          <HelpTooltip helpKey="brand-contrast-ratio" placement="right">
            <span className="inline-flex items-center gap-0.5 rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
              Low contrast
            </span>
          </HelpTooltip>
        )}
      </div>
    </div>
  )
}

function LogoColorPicker({
  label,
  color,
  onChange,
}: {
  label: string
  color: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="border-border h-6 w-6 rounded border"
        style={{ backgroundColor: color }}
      />
      <div className="border-border h-6 w-8 overflow-hidden rounded border">
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 -translate-x-1 -translate-y-1 cursor-pointer border-0 p-0"
        />
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mini control chart SVG for preview
// ---------------------------------------------------------------------------

function MiniControlChart({
  primaryColor,
  destructiveColor,
  borderColor,
}: {
  primaryColor: string
  destructiveColor: string
  borderColor: string
}) {
  return (
    <svg
      width="100%"
      height="48"
      viewBox="0 0 240 48"
      fill="none"
      className="block"
    >
      {/* UCL */}
      <line
        x1="0"
        y1="8"
        x2="240"
        y2="8"
        stroke={borderColor}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* Center */}
      <line
        x1="0"
        y1="24"
        x2="240"
        y2="24"
        stroke={borderColor}
        strokeWidth="0.5"
        strokeDasharray="2 4"
      />
      {/* LCL */}
      <line
        x1="0"
        y1="40"
        x2="240"
        y2="40"
        stroke={borderColor}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      {/* Data line */}
      <polyline
        points="0,24 30,20 60,28 90,18 120,30 150,14 170,10 190,35 210,22 240,26"
        stroke={primaryColor}
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Normal dots */}
      {[
        [30, 20],
        [60, 28],
        [90, 18],
        [120, 30],
        [150, 14],
        [210, 22],
        [240, 26],
      ].map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="2.5"
          fill={primaryColor}
        />
      ))}
      {/* OOC dot */}
      <circle cx="170" cy="10" r="3.5" fill={destructiveColor} />
      <circle cx="190" cy="35" r="3.5" fill={destructiveColor} />
      {/* Labels */}
      <text x="2" y="6" fill={borderColor} fontSize="5" fontFamily="monospace">
        UCL
      </text>
      <text x="2" y="47" fill={borderColor} fontSize="5" fontFamily="monospace">
        LCL
      </text>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Comprehensive Live Preview Panel
// ---------------------------------------------------------------------------

function LivePreview({
  draft,
  previewMode,
  logoMode,
  logoColors,
}: {
  draft: BrandConfig
  previewMode: 'light' | 'dark'
  logoMode: 'cassini' | 'custom'
  logoColors: { planet: string; ring: string; line: string; dot: string }
}) {
  const bgColor = previewMode === 'light' ? DEFAULT_LIGHT_BG : DEFAULT_DARK_BG
  const fgColor = previewMode === 'light' ? '#080C16' : '#F2F2F2'
  const mutedFg = previewMode === 'light' ? '#6b7280' : '#9ca3af'
  const borderColor =
    previewMode === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'
  const subtleBg =
    previewMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'

  const primaryHex = draft.primary?.hex ?? '#D4AF37'
  const accentHex = draft.accent?.hex ?? '#080C16'
  const destructiveHex = draft.destructive?.hex ?? '#EC1C24'
  const warningHex = draft.warning?.hex ?? '#D48232'
  const successHex = draft.success?.hex ?? '#4C9C2E'

  const primaryAdj = autoAdjustForMode(primaryHex, previewMode)
  const accentAdj = autoAdjustForMode(accentHex, previewMode)
  const destructiveAdj = autoAdjustForMode(destructiveHex, previewMode)
  const warningAdj = autoAdjustForMode(warningHex, previewMode)
  const successAdj = autoAdjustForMode(successHex, previewMode)

  const headingFont = `'${draft.headingFont ?? 'Sansation'}', sans-serif`
  const bodyFont = `'${draft.bodyFont ?? 'Inter'}', sans-serif`

  const currentStyle = draft.visualStyle ?? 'modern'

  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        backgroundColor: bgColor,
        color: fgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header mockup */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: accentAdj }}
      >
        {logoMode === 'cassini' || !draft.logoUrl ? (
          <CassiniLogo variant="icon" size={20} brandColors={logoColors} />
        ) : (
          <img
            src={draft.logoUrl}
            alt="Logo"
            className="h-5 w-5 object-contain"
          />
        )}
        <span
          className="text-xs font-semibold"
          style={{
            fontFamily: headingFont,
            color:
              contrastRatio('#ffffff', accentAdj) > contrastRatio('#000000', accentAdj)
                ? '#ffffff'
                : '#000000',
          }}
        >
          {draft.appName || 'Cassini'}
        </span>
      </div>

      {/* Nav items mockup */}
      <div
        className="space-y-0.5 px-2 py-2"
        style={{ borderBottom: `1px solid ${borderColor}` }}
      >
        <div
          className="flex items-center gap-2 rounded px-2 py-1"
          style={{ backgroundColor: primaryAdj + '18' }}
        >
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: primaryAdj }}
          />
          <span
            className="text-[10px] font-medium"
            style={{ color: primaryAdj }}
          >
            Dashboard
          </span>
        </div>
        <div className="flex items-center gap-2 rounded px-2 py-1">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: mutedFg }}
          />
          <span className="text-[10px]" style={{ color: mutedFg }}>
            Control Charts
          </span>
        </div>
      </div>

      <div className="space-y-2.5 p-3">
        {/* Typography sample */}
        <div>
          <p className="mb-0.5 text-[9px]" style={{ color: mutedFg }}>
            Typography
          </p>
          <h5
            className="text-xs font-semibold"
            style={{ fontFamily: headingFont }}
          >
            Heading Font ({draft.headingFont ?? 'Sansation'})
          </h5>
          <p
            className="text-[10px]"
            style={{ fontFamily: bodyFont, color: mutedFg }}
          >
            Body text in {draft.bodyFont ?? 'Inter'} -- monitor your
            manufacturing processes in real time.
          </p>
        </div>

        {/* Button row */}
        <div className="flex items-center gap-2">
          <button
            className="rounded px-2.5 py-1 text-[10px] font-medium text-white"
            style={{ backgroundColor: primaryAdj }}
          >
            Primary
          </button>
          <button
            className="rounded px-2.5 py-1 text-[10px] font-medium text-white"
            style={{ backgroundColor: destructiveAdj }}
          >
            Delete
          </button>
        </div>

        {/* Alert / badge row */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: warningAdj + '20',
              color: warningAdj,
            }}
          >
            <span>Warning alert</span>
          </div>
          <div
            className="rounded-full px-2 py-0.5 text-[9px] font-medium text-white"
            style={{ backgroundColor: successAdj }}
          >
            Passed
          </div>
        </div>

        {/* Mini control chart */}
        <div
          className="overflow-hidden rounded border p-1.5"
          style={{ borderColor }}
        >
          <p className="mb-1 text-[9px]" style={{ color: mutedFg }}>
            Control Chart
          </p>
          <MiniControlChart
            primaryColor={primaryAdj}
            destructiveColor={destructiveAdj}
            borderColor={mutedFg}
          />
        </div>

        {/* Visual style pill */}
        <div className="flex items-center gap-2">
          <span className="text-[9px]" style={{ color: mutedFg }}>
            Style:
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-medium"
            style={{
              backgroundColor: subtleBg,
              border: `1px solid ${borderColor}`,
            }}
          >
            {currentStyle.charAt(0).toUpperCase() + currentStyle.slice(1)}
          </span>
        </div>

        {/* Readability check — show actual text in each color */}
        <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 8 }}>
          <p className="mb-1.5 text-[9px]" style={{ color: mutedFg }}>
            Readability
          </p>
          <div className="space-y-1">
            {[
              { label: 'Primary', color: primaryAdj },
              { label: 'Destructive', color: destructiveAdj },
              { label: 'Warning', color: warningAdj },
              { label: 'Success', color: successAdj },
            ].map((item) => {
              const ratio = contrastRatio(item.color, bgColor)
              const passes = ratio >= 4.5
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: item.color }}
                  >
                    {item.label}
                  </span>
                  {!passes && (
                    <span
                      className="rounded px-1 text-[8px] font-medium"
                      style={{
                        color: destructiveAdj,
                        backgroundColor: destructiveAdj + '18',
                      }}
                    >
                      hard to read
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section navigation
// ---------------------------------------------------------------------------

type SectionId = 'presets' | 'identity' | 'colors' | 'typography' | 'login' | 'style'

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette }[] = [
  { id: 'presets', label: 'Presets', icon: Palette },
  { id: 'identity', label: 'Identity', icon: Image },
  { id: 'colors', label: 'Colors', icon: Paintbrush },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'login', label: 'Login', icon: Monitor },
  { id: 'style', label: 'Visual Style', icon: Paintbrush },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BrandingSettings() {
  const { fullBrandConfig, setFullBrandConfig, setVisualStyle, visualStyle } =
    useTheme()
  const updateSettings = useUpdateSystemSettings()

  // Draft state -- local copy for editing
  const [draft, setDraft] = useState<BrandConfig>(() => ({
    ...fullBrandConfig,
  }))
  const [isDirty, setIsDirty] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionId>('presets')
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light')
  const [logoMode, setLogoMode] = useState<'cassini' | 'custom'>(
    draft.logoUrl ? 'custom' : 'cassini',
  )
  const [plantOverride, setPlantOverride] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  // Derived logo colors from draft
  const logoColors = useMemo(() => deriveLogoColors(draft), [draft])

  // Update draft helper
  const updateDraft = useCallback((patch: Partial<BrandConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
    setIsDirty(true)
  }, [])

  // Save handler
  const handleSave = useCallback(() => {
    const dto = toDTO(draft)
    updateSettings.mutate(
      { brand_config: dto },
      {
        onSuccess: () => {
          setFullBrandConfig(draft)
          if (draft.visualStyle) {
            setVisualStyle(draft.visualStyle as VisualStyle)
          }
          setIsDirty(false)
        },
      },
    )
  }, [draft, updateSettings, setFullBrandConfig, setVisualStyle])

  // Reset handler
  const handleReset = useCallback(() => {
    const cassiniPreset = BRAND_PRESETS.find((p) => p.id === 'cassini')
    if (cassiniPreset) {
      setDraft({ ...cassiniPreset.config })
      setIsDirty(true)
      setLogoMode('cassini')
    }
  }, [])

  // Logo file upload handler
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 500 * 1024) {
        toast.error('Logo file must be under 500KB')
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUri = event.target?.result as string
        updateDraft({ logoUrl: dataUri })
      }
      reader.readAsDataURL(file)
    },
    [updateDraft],
  )

  // Background file upload handler
  const handleBgFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Background image must be under 2MB')
        return
      }
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUri = event.target?.result as string
        updateDraft({ loginBackgroundUrl: dataUri })
      }
      reader.readAsDataURL(file)
    },
    [updateDraft],
  )

  // Find matching font pairing for dropdown
  const headingPairingId = useMemo(() => {
    const match = FONT_PAIRINGS.find(
      (p) => p.headingFont === (draft.headingFont ?? 'Sansation'),
    )
    return match?.id ?? FONT_PAIRINGS[0].id
  }, [draft.headingFont])

  const bodyPairingId = useMemo(() => {
    const match = FONT_PAIRINGS.find(
      (p) => p.bodyFont === (draft.bodyFont ?? 'Inter'),
    )
    return match?.id ?? FONT_PAIRINGS[0].id
  }, [draft.bodyFont])

  return (
    <div className="flex gap-6" data-ui="branding-settings">
      {/* Left: Main content */}
      <div className="min-w-0 flex-1 space-y-6">
        {/* Section Navigation (mobile) */}
        <div className="flex flex-wrap gap-1.5 lg:hidden">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                activeSection === s.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Section 1: Preset Gallery */}
        <section
          className={cn(activeSection !== 'presets' && 'hidden lg:block')}
          id="section-presets"
          data-ui="branding-presets-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2" data-ui="branding-presets-header">
              <Palette className="h-5 w-5" />
              <h3 className="font-semibold">Industry Presets</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {BRAND_PRESETS.map((preset) => {
                const isActive = draft.presetId === preset.id
                const pairingMatch = FONT_PAIRINGS.find(
                  (p) =>
                    p.headingFont === preset.config.headingFont &&
                    p.bodyFont === preset.config.bodyFont,
                )
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setDraft({ ...preset.config })
                      setIsDirty(true)
                      setLogoMode('cassini')
                    }}
                    title={
                      pairingMatch
                        ? `Font pairing: ${pairingMatch.label}`
                        : undefined
                    }
                    className={cn(
                      'flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all',
                      isActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="flex gap-0.5">
                      <div
                        className="h-6 w-6 rounded-l"
                        style={{
                          backgroundColor:
                            preset.config.primary?.hex ?? '#D4AF37',
                        }}
                      />
                      <div
                        className="h-6 w-6 rounded-r"
                        style={{
                          backgroundColor:
                            preset.config.accent?.hex ?? '#080C16',
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {preset.name}
                        </span>
                        {isActive && <Check className="text-primary h-4 w-4" />}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* Section 2: Identity */}
        <section
          className={cn(activeSection !== 'identity' && 'hidden lg:block')}
          id="section-identity"
          data-ui="branding-identity-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2" data-ui="branding-identity-header">
              <Image className="h-5 w-5" />
              <h3 className="font-semibold">Identity</h3>
            </div>

            {/* App Name */}
            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium">
                Application Name
              </label>
              <input
                type="text"
                value={draft.appName ?? ''}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 50)
                  updateDraft({ appName: val })
                }}
                maxLength={50}
                className="border-border bg-background w-full max-w-xs rounded border px-3 py-2 text-sm"
                placeholder="Cassini"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {(draft.appName ?? '').length}/50 characters
              </p>
            </div>

            {/* Logo Mode Toggle */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">Logo</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setLogoMode('cassini')
                    updateDraft({ logoUrl: null })
                  }}
                  className={cn(
                    'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                    logoMode === 'cassini'
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  Cassini Logo
                </button>
                <button
                  onClick={() => setLogoMode('custom')}
                  className={cn(
                    'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                    logoMode === 'custom'
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  Custom Upload
                </button>
              </div>
            </div>

            {/* Cassini Logo Colors */}
            {logoMode === 'cassini' && (
              <div className="space-y-3">
                <p className="text-muted-foreground text-xs">
                  Customize the colors used by the Cassini mission-patch logo.
                </p>
                <div className="flex flex-wrap gap-4">
                  <LogoColorPicker
                    label="Planet"
                    color={draft.logoColors?.planet ?? logoColors.planet}
                    onChange={(c) =>
                      updateDraft({
                        logoColors: { ...draft.logoColors, planet: c },
                      })
                    }
                  />
                  <LogoColorPicker
                    label="Ring"
                    color={draft.logoColors?.ring ?? logoColors.ring}
                    onChange={(c) =>
                      updateDraft({
                        logoColors: { ...draft.logoColors, ring: c },
                      })
                    }
                  />
                  <LogoColorPicker
                    label="Line"
                    color={draft.logoColors?.line ?? logoColors.line}
                    onChange={(c) =>
                      updateDraft({
                        logoColors: { ...draft.logoColors, line: c },
                      })
                    }
                  />
                  <LogoColorPicker
                    label="Dot"
                    color={draft.logoColors?.dot ?? logoColors.dot}
                    onChange={(c) =>
                      updateDraft({
                        logoColors: { ...draft.logoColors, dot: c },
                      })
                    }
                  />
                </div>

                {/* Logo preview at 3 sizes */}
                <div className="mt-3 flex items-end gap-4">
                  <div className="text-center">
                    <CassiniLogo
                      variant="icon"
                      size={24}
                      brandColors={logoColors}
                    />
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      24px
                    </p>
                  </div>
                  <div className="text-center">
                    <CassiniLogo
                      variant="icon"
                      size={48}
                      brandColors={logoColors}
                    />
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      48px
                    </p>
                  </div>
                  <div className="text-center">
                    <CassiniLogo
                      variant="icon"
                      size={72}
                      brandColors={logoColors}
                    />
                    <p className="text-muted-foreground mt-1 text-[10px]">
                      72px
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Logo Upload */}
            {logoMode === 'custom' && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border-border hover:bg-background flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <span className="text-muted-foreground text-xs">or</span>
                  <input
                    type="text"
                    value={draft.logoUrl ?? ''}
                    onChange={(e) =>
                      updateDraft({ logoUrl: e.target.value || null })
                    }
                    className="border-border bg-background max-w-xs flex-1 rounded border px-3 py-2 text-sm"
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                {draft.logoUrl && (
                  <div className="flex items-center gap-3">
                    <img
                      src={draft.logoUrl}
                      alt="Logo preview"
                      className="h-12 w-12 rounded border object-contain"
                    />
                    <button
                      onClick={() => updateDraft({ logoUrl: null })}
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  Max 500KB. Recommended: 64x64px PNG or SVG.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Brand Colors */}
        <section
          className={cn(activeSection !== 'colors' && 'hidden lg:block')}
          id="section-colors"
          data-ui="branding-colors-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2" data-ui="branding-colors-header">
              <Paintbrush className="h-5 w-5" />
              <h3 className="font-semibold">Brand Colors</h3>
            </div>

            <div className="space-y-5">
              {/* Primary */}
              <ColorSeedPicker
                label="Primary"
                seed={draft.primary}
                onChange={(s) => updateDraft({ primary: s })}
              />

              {/* Accent */}
              <ColorSeedPicker
                label="Accent"
                seed={draft.accent}
                onChange={(s) => updateDraft({ accent: s })}
              />

              {/* Semantic Colors -- shown openly */}
              <div className="border-border border-t pt-4">
                <div className="mb-4 flex items-center gap-1.5">
                  <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    Semantic Colors
                  </p>
                  <HelpTooltip
                    helpKey="brand-semantic-colors"
                    placement="right"
                  />
                </div>
                <div className="space-y-5">
                  {SEMANTIC_COLORS.map((sc) => {
                    const seed = draft[sc.key] ?? { hex: sc.defaultHex }
                    const lightResolved =
                      seed.lightOverride && isValidHexColor(seed.lightOverride)
                        ? seed.lightOverride
                        : autoAdjustForMode(seed.hex, 'light')
                    const darkResolved =
                      seed.darkOverride && isValidHexColor(seed.darkOverride)
                        ? seed.darkOverride
                        : autoAdjustForMode(seed.hex, 'dark')
                    return (
                      <div key={sc.key}>
                        <ColorSeedPicker
                          label={sc.label}
                          seed={seed}
                          onChange={(s) => updateDraft({ [sc.key]: s })}
                          helpKey={sc.helpKey}
                        />
                        <div className="mt-1.5 ml-31 flex flex-wrap items-center gap-3">
                          <ContrastSample
                            fg={lightResolved}
                            bg={DEFAULT_LIGHT_BG}
                            modeLabel="Light"
                          />
                          <ContrastSample
                            fg={darkResolved}
                            bg={DEFAULT_DARK_BG}
                            modeLabel="Dark"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4: Typography */}
        <section
          className={cn(activeSection !== 'typography' && 'hidden lg:block')}
          id="section-typography"
          data-ui="branding-typography-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2" data-ui="branding-typography-header">
              <Type className="h-5 w-5" />
              <h3 className="font-semibold">Typography</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Heading Font
                </label>
                <select
                  value={headingPairingId}
                  onChange={(e) => {
                    const p = FONT_PAIRINGS.find(
                      (f) => f.id === e.target.value,
                    )
                    if (p) updateDraft({ headingFont: p.headingFont })
                  }}
                  className="border-border bg-background w-full max-w-xs rounded border px-3 py-2 text-sm"
                >
                  {FONT_PAIRINGS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.headingFont}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Body Font
                </label>
                <select
                  value={bodyPairingId}
                  onChange={(e) => {
                    const p = FONT_PAIRINGS.find(
                      (f) => f.id === e.target.value,
                    )
                    if (p) updateDraft({ bodyFont: p.bodyFont })
                  }}
                  className="border-border bg-background w-full max-w-xs rounded border px-3 py-2 text-sm"
                >
                  {FONT_PAIRINGS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.bodyFont}
                    </option>
                  ))}
                </select>
              </div>

              {/* Typography preview */}
              <div className="bg-background border-border rounded-lg border p-4">
                <p className="text-muted-foreground mb-2 text-xs">Preview</p>
                <h4
                  className="mb-1 text-lg font-semibold"
                  style={{
                    fontFamily: `'${draft.headingFont ?? 'Sansation'}', sans-serif`,
                  }}
                >
                  Statistical Process Control
                </h4>
                <p
                  className="text-muted-foreground text-sm"
                  style={{
                    fontFamily: `'${draft.bodyFont ?? 'Inter'}', sans-serif`,
                  }}
                >
                  Monitor your manufacturing processes with real-time control
                  charts, capability analysis, and automated Nelson rule
                  detection.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Login Experience */}
        <section
          className={cn(activeSection !== 'login' && 'hidden lg:block')}
          id="section-login"
          data-ui="branding-login-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-4 flex items-center gap-2" data-ui="branding-login-header">
              <Monitor className="h-5 w-5" />
              <h3 className="font-semibold">Login Experience</h3>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                onClick={() => updateDraft({ loginMode: 'saturn' })}
                className={cn(
                  'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                  (draft.loginMode ?? 'saturn') === 'saturn'
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border hover:border-primary/50',
                )}
              >
                Saturn Animation
              </button>
              <button
                onClick={() => updateDraft({ loginMode: 'static' })}
                className={cn(
                  'rounded-lg border-2 px-3 py-2 text-sm transition-all',
                  draft.loginMode === 'static'
                    ? 'border-primary bg-primary/10 font-medium'
                    : 'border-border hover:border-primary/50',
                )}
              >
                Static Background
              </button>
            </div>

            {draft.loginMode === 'static' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Background Image
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => bgFileInputRef.current?.click()}
                      className="border-border hover:bg-background flex items-center gap-2 rounded border px-3 py-2 text-sm transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      Upload File
                    </button>
                    <input
                      ref={bgFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBgFileUpload}
                      className="hidden"
                    />
                    <span className="text-muted-foreground text-xs">
                      or enter URL
                    </span>
                  </div>
                </div>
                <input
                  type="text"
                  value={draft.loginBackgroundUrl ?? ''}
                  onChange={(e) =>
                    updateDraft({
                      loginBackgroundUrl: e.target.value || null,
                    })
                  }
                  className="border-border bg-background w-full max-w-md rounded border px-3 py-2 text-sm"
                  placeholder="https://example.com/background.jpg"
                />
                <p className="text-muted-foreground text-xs">
                  Max 2MB. Recommended: 1920x1080 or higher.
                </p>
                {draft.loginBackgroundUrl && (
                  <div className="space-y-2">
                    <div className="border-border overflow-hidden rounded-lg border">
                      <img
                        src={draft.loginBackgroundUrl}
                        alt="Login background preview"
                        className="h-32 w-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() =>
                        updateDraft({ loginBackgroundUrl: null })
                      }
                      className="text-muted-foreground hover:text-foreground text-xs"
                    >
                      Remove background
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section 6: Visual Style */}
        <section
          className={cn(activeSection !== 'style' && 'hidden lg:block')}
          id="section-style"
          data-ui="branding-style-section"
        >
          <div className="bg-muted rounded-xl p-6">
            <div className="mb-2 flex items-center gap-2" data-ui="branding-style-header">
              <Paintbrush className="h-5 w-5" />
              <h3 className="font-semibold">Visual Style</h3>
            </div>
            <p className="text-muted-foreground mb-4 text-sm">
              Sets the default visual style for your organization. Individual
              users can override this in their personal Appearance settings.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {VISUAL_STYLE_OPTIONS.map((opt) => {
                const isActive =
                  (draft.visualStyle ?? visualStyle) === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateDraft({ visualStyle: opt.value })}
                    className={cn(
                      'rounded-lg border-2 p-4 text-left transition-all',
                      isActive
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{opt.label}</span>
                      {isActive && <Check className="text-primary h-4 w-4" />}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        {/* Save / Reset */}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            onClick={handleReset}
            className="border-border hover:bg-muted flex items-center gap-2 rounded border px-4 py-2 text-sm transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset to Default
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty || updateSettings.isPending}
            className={cn(
              'rounded px-4 py-2 text-sm font-medium text-white transition-colors',
              isDirty && !updateSettings.isPending
                ? 'bg-primary hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed',
            )}
          >
            {updateSettings.isPending ? 'Saving...' : 'Save Changes'}
          </button>
          {isDirty && (
            <span className="text-muted-foreground text-sm">
              Unsaved changes
            </span>
          )}
        </div>

        {/* Per-Plant Override (placeholder) */}
        <div className="bg-muted rounded-xl p-6" data-ui="branding-plant-override-card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Per-Plant Override</h3>
              <p className="text-muted-foreground text-sm">
                {plantOverride
                  ? 'This plant uses custom branding. Configure below.'
                  : 'This plant uses global branding.'}
              </p>
            </div>
            <button
              onClick={() => setPlantOverride((p) => !p)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                plantOverride ? 'bg-primary' : 'bg-border',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                  plantOverride && 'translate-x-5',
                )}
              />
            </button>
          </div>
          {plantOverride && (
            <div className="text-muted-foreground mt-4 rounded-lg border border-dashed p-6 text-center text-sm">
              Plant-specific branding controls will appear here. Use the same
              controls above, then save via the per-plant override API.
            </div>
          )}
        </div>
      </div>

      {/* Right: Live Preview (sticky) */}
      <div className="hidden w-72 shrink-0 lg:block" data-ui="branding-preview-panel">
        <div className="sticky top-6 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Live Preview</h4>
            <div className="flex gap-1">
              <button
                onClick={() => setPreviewMode('light')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  previewMode === 'light'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground',
                )}
                title="Light mode preview"
              >
                <Sun className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPreviewMode('dark')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  previewMode === 'dark'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground',
                )}
                title="Dark mode preview"
              >
                <Moon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <LivePreview
            draft={draft}
            previewMode={previewMode}
            logoMode={logoMode}
            logoColors={logoColors}
          />
        </div>
      </div>
    </div>
  )
}
