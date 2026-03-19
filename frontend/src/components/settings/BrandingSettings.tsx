import { useState, useCallback, useRef, useMemo } from 'react'
import { Upload, RotateCcw, Check } from 'lucide-react'
import { HelpTooltip } from '@/components/HelpTooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { VISUAL_STYLE_OPTIONS, type VisualStyle } from '@/lib/visual-styles'
import {
  type BrandConfig,
  autoAdjustForMode,
  deriveLogoColors,
  DEFAULT_LIGHT_BG,
  DEFAULT_DARK_BG,
} from '@/lib/brand-engine'
import { BRAND_PRESETS } from '@/lib/brand-presets'
import { FONT_PAIRINGS } from '@/lib/font-pairings'
import { CassiniLogo } from '@/components/login/CassiniLogo'
import { LivePreview } from '@/components/settings/BrandingLivePreview'
import {
  toDTO,
  SEMANTIC_COLORS,
  ColorSeedPicker,
  ContrastSample,
  LogoColorPicker,
  SECTIONS,
  type SectionId,
} from '@/components/settings/BrandingSubComponents'
import { useUpdateSystemSettings } from '@/api/hooks/systemSettings'

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
