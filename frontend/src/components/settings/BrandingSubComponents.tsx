import React, { useState } from 'react'
import {
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
import { cn } from '@/lib/utils'
import {
  type BrandConfig,
  type BrandColorSeed,
  isValidHexColor,
  autoAdjustForMode,
  contrastRatio,
} from '@/lib/brand-engine'
import type { BrandConfigDTO } from '@/types'

// ---------------------------------------------------------------------------
// Helper: camelCase BrandConfig -> snake_case BrandConfigDTO
// ---------------------------------------------------------------------------

export function toDTO(config: BrandConfig): BrandConfigDTO {
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

export const SEMANTIC_COLORS = [
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

export function ColorSeedPicker({
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

export function ContrastSample({
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

export function LogoColorPicker({
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
// Section navigation
// ---------------------------------------------------------------------------

export type SectionId = 'presets' | 'identity' | 'colors' | 'typography' | 'login' | 'style'

export const SECTIONS: { id: SectionId; label: string; icon: typeof Palette }[] = [
  { id: 'presets', label: 'Presets', icon: Palette },
  { id: 'identity', label: 'Identity', icon: Image },
  { id: 'colors', label: 'Colors', icon: Paintbrush },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'login', label: 'Login', icon: Monitor },
  { id: 'style', label: 'Visual Style', icon: Paintbrush },
]
