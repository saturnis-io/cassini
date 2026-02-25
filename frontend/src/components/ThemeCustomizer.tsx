import { useState, useCallback, useRef } from 'react'
import { Upload, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type BrandConfig } from '@/providers/ThemeProvider'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'

interface ThemeCustomizerProps {
  className?: string
}

/**
 * Color input with preview swatch
 */
function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-muted-foreground w-28 text-sm font-medium">{label}:</label>
      <div className="flex items-center gap-2">
        <div className="border-border h-8 w-8 rounded border" style={{ backgroundColor: value }} />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-border h-8 w-12 cursor-pointer rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="border-border bg-background w-24 rounded border px-2 py-1 text-sm"
          pattern="^#[0-9A-Fa-f]{6}$"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}

/**
 * Preview panel showing brand customization effects
 */
function PreviewPanel({
  appName,
  logoUrl,
  primaryColor,
  accentColor,
}: {
  appName: string
  logoUrl: string | null
  primaryColor: string
  accentColor: string
}) {
  return (
    <div className="bg-muted/30 rounded-lg border p-4">
      <div className="text-muted-foreground mb-2 text-xs font-medium">Preview</div>
      <div className="bg-background flex items-center gap-3 rounded border p-3">
        {/* Logo/App name preview */}
        <div className="flex items-center gap-2">
          <img
            src={logoUrl || '/header-logo.svg'}
            alt="Logo preview"
            className="h-6 w-6 object-contain"
          />
          <span className="font-semibold">{appName}</span>
        </div>

        <div className="flex-1" />

        {/* Button previews */}
        <button
          className="rounded px-3 py-1 text-sm text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Primary
        </button>
        <span className="text-sm" style={{ color: accentColor }}>
          Accent Link
        </span>
      </div>
    </div>
  )
}

/**
 * Admin UI for brand customization
 *
 * Features:
 * - Color pickers for primary and accent colors
 * - Text input for app name
 * - File upload or URL input for logo
 * - Live preview panel
 * - Save and reset functionality
 *
 * Only accessible to admin role users.
 *
 * @example
 * <ThemeCustomizer />
 */
export function ThemeCustomizer({ className }: ThemeCustomizerProps) {
  const { brandConfig, setBrandConfig, resetBrandConfig } = useTheme()
  const { role } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local state for editing (not saved until user clicks Save)
  const [localConfig, setLocalConfig] = useState<BrandConfig>(brandConfig)
  const [isDirty, setIsDirty] = useState(false)

  // Check admin access
  const canCustomize = hasAccess(role, 'admin')

  const updateLocalConfig = useCallback((updates: Partial<BrandConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
    setIsDirty(true)
  }, [])

  const handleSave = useCallback(() => {
    setBrandConfig(localConfig)
    setIsDirty(false)
  }, [localConfig, setBrandConfig])

  const handleReset = useCallback(() => {
    resetBrandConfig()
    setLocalConfig({
      primaryColor: '#D4AF37',
      accentColor: '#080C16',
      logoUrl: null,
      appName: 'Cassini',
    })
    setIsDirty(false)
  }, [resetBrandConfig])

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      // Check file size (max 200KB)
      if (file.size > 200 * 1024) {
        alert('Logo file must be under 200KB')
        return
      }

      // Read as data URI
      const reader = new FileReader()
      reader.onload = (event) => {
        const dataUri = event.target?.result as string
        updateLocalConfig({ logoUrl: dataUri })
      }
      reader.readAsDataURL(file)
    },
    [updateLocalConfig],
  )

  const handleLogoUrlChange = useCallback(
    (url: string) => {
      updateLocalConfig({ logoUrl: url || null })
    },
    [updateLocalConfig],
  )

  if (!canCustomize) {
    return (
      <div className={cn('bg-muted/30 rounded-lg border p-4', className)}>
        <p className="text-muted-foreground text-sm">
          Brand customization requires Administrator privileges.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('space-y-5', className)}>
      {/* App Name */}
      <div className="bg-muted rounded-xl p-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium">App Name</label>
          <input
            type="text"
            value={localConfig.appName}
            onChange={(e) => updateLocalConfig({ appName: e.target.value })}
            className="border-border bg-background w-full max-w-xs rounded border px-3 py-2"
            placeholder="Cassini"
          />
        </div>
      </div>

      {/* Colors */}
      <div className="bg-muted rounded-xl p-6">
        <div className="space-y-3">
          <label className="block text-sm font-medium">Brand Colors</label>
          <ColorInput
            label="Primary"
            value={localConfig.primaryColor}
            onChange={(color) => updateLocalConfig({ primaryColor: color })}
          />
          <ColorInput
            label="Accent"
            value={localConfig.accentColor}
            onChange={(color) => updateLocalConfig({ accentColor: color })}
          />
        </div>
      </div>

      {/* Logo */}
      <div className="bg-muted rounded-xl p-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Logo</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border-border hover:bg-muted flex items-center gap-2 rounded border px-3 py-2 transition-colors"
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
            <span className="text-muted-foreground">or</span>
            <input
              type="text"
              value={localConfig.logoUrl ?? ''}
              onChange={(e) => handleLogoUrlChange(e.target.value)}
              className="border-border bg-background max-w-xs flex-1 rounded border px-3 py-2 text-sm"
              placeholder="https://example.com/logo.png"
            />
          </div>
          {localConfig.logoUrl && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={localConfig.logoUrl}
                alt="Logo preview"
                className="h-10 w-10 rounded border object-contain"
              />
              <button
                onClick={() => updateLocalConfig({ logoUrl: null })}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Remove
              </button>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            Max size: 200KB. Recommended: 64x64px PNG or SVG.
          </p>
        </div>
      </div>

      {/* Preview */}
      <PreviewPanel
        appName={localConfig.appName}
        logoUrl={localConfig.logoUrl}
        primaryColor={localConfig.primaryColor}
        accentColor={localConfig.accentColor}
      />

      {/* Actions */}
      <div className="flex items-center gap-3 border-t pt-4">
        <button
          onClick={handleReset}
          className="border-border hover:bg-muted flex items-center gap-2 rounded border px-4 py-2 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Default
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={cn(
            'rounded px-4 py-2 text-white transition-colors',
            isDirty
              ? 'bg-primary hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          Save Changes
        </button>
        {isDirty && <span className="text-muted-foreground text-sm">Unsaved changes</span>}
      </div>
    </div>
  )
}
