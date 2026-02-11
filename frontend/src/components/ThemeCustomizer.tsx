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
      <label className="text-sm font-medium text-muted-foreground w-28">
        {label}:
      </label>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded border border-border"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-8 cursor-pointer rounded border border-border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 px-2 py-1 text-sm rounded border border-border bg-background"
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
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="text-xs font-medium text-muted-foreground mb-2">Preview</div>
      <div className="flex items-center gap-3 p-3 rounded bg-background border">
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
          className="px-3 py-1 rounded text-sm text-white"
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
      primaryColor: '#004A98',
      accentColor: '#62CBC9',
      logoUrl: null,
      appName: 'OpenSPC',
    })
    setIsDirty(false)
  }, [resetBrandConfig])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [updateLocalConfig])

  const handleLogoUrlChange = useCallback((url: string) => {
    updateLocalConfig({ logoUrl: url || null })
  }, [updateLocalConfig])

  if (!canCustomize) {
    return (
      <div className={cn('p-4 rounded-lg border bg-muted/30', className)}>
        <p className="text-sm text-muted-foreground">
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
            className="w-full max-w-xs px-3 py-2 rounded border border-border bg-background"
            placeholder="OpenSPC"
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
              className="flex items-center gap-2 px-3 py-2 rounded border border-border hover:bg-muted transition-colors"
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
              className="flex-1 max-w-xs px-3 py-2 rounded border border-border bg-background text-sm"
              placeholder="https://example.com/logo.png"
            />
          </div>
          {localConfig.logoUrl && (
            <div className="flex items-center gap-2 mt-2">
              <img
                src={localConfig.logoUrl}
                alt="Logo preview"
                className="h-10 w-10 object-contain border rounded"
              />
              <button
                onClick={() => updateLocalConfig({ logoUrl: null })}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
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
      <div className="flex items-center gap-3 pt-4 border-t">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 rounded border border-border hover:bg-muted transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
          Reset to Default
        </button>
        <button
          onClick={handleSave}
          disabled={!isDirty}
          className={cn(
            'px-4 py-2 rounded text-white transition-colors',
            isDirty
              ? 'bg-primary hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          Save Changes
        </button>
        {isDirty && (
          <span className="text-sm text-muted-foreground">
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  )
}
