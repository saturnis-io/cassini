import { useState, useCallback, useRef } from 'react'
import {
  Shield,
  Upload,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Clock,
  Crown,
  Factory,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLicense } from '@/hooks/useLicense'
import {
  useActivateLicense,
  useRemoveLicense,
  useDownloadActivationFile,
  usePlants,
} from '@/api/hooks'
import { PlantUsageBar } from '@/components/PlantUsageBar'
import { LicenseComparisonDialog } from '@/components/LicenseComparisonDialog'
import type { LicenseStatus } from '@/api/license.api'

/**
 * Parse the body (payload) of a JWT token without verifying its signature.
 * Used client-side only for previewing incoming license details.
 */
function parseJwtBody(token: string): Record<string, unknown> | null {
  try {
    const [, body] = token.split('.')
    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function LicenseSettings() {
  const license = useLicense()
  const activateLicense = useActivateLicense()
  const removeLicenseMutation = useRemoveLicense()
  const downloadActivation = useDownloadActivationFile()
  const { data: activePlants = [] } = usePlants(true)

  // Upload state
  const [dragOver, setDragOver] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Comparison dialog state (for replacing an active license)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [incomingPreview, setIncomingPreview] = useState<{
    tier: string
    max_plants: number
    expires_at: string | null
    license_name: string | null
  } | null>(null)

  // Remove confirmation state
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [removeInput, setRemoveInput] = useState('')

  const { isCommercial, tier, licensedTier, maxPlants, expiresAt, daysUntilExpiry, isExpired } =
    license

  // An expired license that once was commercial
  const wasCommercial = isExpired && licensedTier !== null
  const showDangerZone = isCommercial || wasCommercial

  const processKeyContent = useCallback(
    (content: string) => {
      const key = content.trim()
      if (!key) return

      // If currently commercial, show comparison dialog
      if (isCommercial) {
        const parsed = parseJwtBody(key)
        if (parsed) {
          setIncomingPreview({
            tier: (parsed.tier as string) || 'professional',
            max_plants: (parsed.max_plants as number) || 1,
            expires_at: (parsed.expires_at as string) || null,
            license_name: (parsed.sub as string) || null,
          })
          setPendingKey(key)
          return
        }
      }

      // Direct upload (community edition or parse failed)
      activateLicense.mutate(key, {
        onSuccess: () => {
          setUploadSuccess(true)
          setTimeout(() => setUploadSuccess(false), 3000)
        },
      })
    },
    [isCommercial, activateLicense],
  )

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          processKeyContent(reader.result)
        }
      }
      reader.readAsText(file)
    },
    [processKeyContent],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          processKeyContent(reader.result)
        }
      }
      reader.readAsText(file)
      // Reset input so the same file can be selected again
      e.target.value = ''
    },
    [processKeyContent],
  )

  const handleComparisonConfirm = useCallback(() => {
    if (!pendingKey) return
    activateLicense.mutate(pendingKey, {
      onSuccess: () => {
        setPendingKey(null)
        setIncomingPreview(null)
        setUploadSuccess(true)
        setTimeout(() => setUploadSuccess(false), 3000)
      },
    })
  }, [pendingKey, activateLicense])

  const handleRemove = useCallback(() => {
    removeLicenseMutation.mutate(undefined, {
      onSuccess: () => {
        setShowRemoveConfirm(false)
        setRemoveInput('')
      },
    })
  }, [removeLicenseMutation])

  // Build the current LicenseStatus object for comparison dialog
  const currentStatus: LicenseStatus = {
    edition: license.edition,
    tier: license.tier,
    licensed_tier: license.licensedTier,
    max_plants: license.maxPlants,
    expires_at: license.expiresAt,
    days_until_expiry: license.daysUntilExpiry,
    is_expired: license.isExpired,
  }

  return (
    <div className="space-y-5" data-ui="license-settings">
      {/* Section 1: License Status Card */}
      <div className="bg-muted rounded-xl p-6" data-ui="license-status-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-muted-foreground h-5 w-5" />
            <h3 className="font-semibold">License Status</h3>
          </div>
          <EditionBadge
            isCommercial={isCommercial}
            isExpired={isExpired}
            wasCommercial={wasCommercial}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-card border-border rounded-lg border p-3">
            <div className="text-muted-foreground mb-1 text-xs">Tier</div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Crown className="h-3.5 w-3.5" />
              {isCommercial ? tier : wasCommercial ? licensedTier : 'Community'}
            </div>
          </div>
          <div className="bg-card border-border rounded-lg border p-3">
            <div className="text-muted-foreground mb-1 text-xs">License Name</div>
            <div className="truncate text-sm font-medium">
              {isCommercial ? tier : 'N/A'}
            </div>
          </div>
          <div className="bg-card border-border rounded-lg border p-3">
            <div className="text-muted-foreground mb-1 text-xs">Expires</div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(expiresAt)}
            </div>
          </div>
          <div className="bg-card border-border rounded-lg border p-3">
            <div className="text-muted-foreground mb-1 text-xs">Days Remaining</div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-3.5 w-3.5" />
              {daysUntilExpiry !== null ? daysUntilExpiry : 'N/A'}
            </div>
          </div>
        </div>

        {/* Plant usage bar (commercial only) */}
        {isCommercial && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
              <Factory className="h-3.5 w-3.5" />
              Plant Usage
            </div>
            <PlantUsageBar used={activePlants.length} max={maxPlants} />
          </div>
        )}

        {/* Download activation file (commercial only) */}
        {isCommercial && (
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => downloadActivation.mutate()}
              disabled={downloadActivation.isPending}
              className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
            >
              {downloadActivation.isPending ? 'Generating...' : 'Download Activation File'}
            </button>
            <span className="text-muted-foreground text-xs">
              Upload this to your saturnis.io portal to register this installation
            </span>
          </div>
        )}

        {/* Inline warning for expiring soon */}
        {isCommercial &&
          daysUntilExpiry !== null &&
          daysUntilExpiry <= 30 &&
          daysUntilExpiry > 0 && (
            <div className="bg-warning/10 border-warning/20 text-warning mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your license expires in {daysUntilExpiry} day
                {daysUntilExpiry === 1 ? '' : 's'}.{' '}
                <a
                  href="https://saturnis.io/cassini/pricing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:opacity-80"
                >
                  Renew now
                </a>
              </span>
            </div>
          )}

        {/* Inline warning for expired */}
        {wasCommercial && (
          <div className="bg-warning/10 border-warning/20 text-warning mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Your {licensedTier} license has expired. Enterprise features are read-only.{' '}
              <a
                href="https://saturnis.io/cassini/pricing"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
              >
                Renew now
              </a>
            </span>
          </div>
        )}
      </div>

      {/* Section 2: Upload License Key */}
      <div className="bg-muted rounded-xl p-6" data-ui="license-upload-card">
        <div className="mb-4 flex items-center gap-2">
          <Upload className="text-muted-foreground h-5 w-5" />
          <h3 className="font-semibold">
            {isCommercial ? 'Replace License Key' : 'Upload License Key'}
          </h3>
        </div>

        <p className="text-muted-foreground mb-4 text-sm">
          {isCommercial
            ? 'Upload a new license key file to replace your current license.'
            : 'Upload a license key file (.license) to unlock commercial features.'}
        </p>

        {/* Drag-and-drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'border-border cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors',
            dragOver
              ? 'border-primary bg-primary/5'
              : 'hover:border-primary/50 hover:bg-muted/50',
          )}
        >
          <Upload
            className={cn(
              'mx-auto mb-2 h-8 w-8',
              dragOver ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <p className="text-sm font-medium">
            {dragOver ? 'Drop license key here' : 'Drag & drop your license key'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            or click to browse for a .license or .key file
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".key,.license,.txt,.jwt"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Success indicator */}
        {uploadSuccess && (
          <div className="text-success mt-3 flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4" />
            License key uploaded successfully
          </div>
        )}

        {/* Loading indicator */}
        {activateLicense.isPending && (
          <div className="text-muted-foreground mt-3 text-sm">
            Validating license key...
          </div>
        )}
      </div>

      {/* Section 3: Danger Zone (commercial or expired-commercial only) */}
      {showDangerZone && (
        <div className="pt-4">
          <div
            className="bg-destructive/5 border-destructive/20 rounded-xl border p-6"
            data-ui="license-danger-zone"
          >
            <div className="mb-4 flex items-center gap-2">
              <Trash2 className="text-destructive h-5 w-5" />
              <h3 className="text-destructive font-semibold">Danger Zone</h3>
            </div>

            <div className="bg-card border-border rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Remove License</div>
                  <div className="text-muted-foreground text-xs">
                    Revert to Community Edition. All commercial features will become
                    read-only.
                  </div>
                </div>
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Remove License
                </button>
              </div>

              {/* Inline confirmation */}
              {showRemoveConfirm && (
                <div className="border-border mt-3 border-t pt-3">
                  <p className="text-muted-foreground mb-2 text-sm">
                    Type <strong>REMOVE</strong> to confirm license removal.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={removeInput}
                      onChange={(e) => setRemoveInput(e.target.value)}
                      placeholder="REMOVE"
                      className="border-border w-40 rounded-lg border px-3 py-2 text-sm font-mono"
                    />
                    <button
                      onClick={handleRemove}
                      disabled={removeInput !== 'REMOVE' || removeLicenseMutation.isPending}
                      className={cn(
                        'rounded-lg px-4 py-2 text-sm font-medium',
                        'bg-destructive text-destructive-foreground',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {removeLicenseMutation.isPending ? 'Removing...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => {
                        setShowRemoveConfirm(false)
                        setRemoveInput('')
                      }}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison dialog for replacing an active license */}
      {incomingPreview && pendingKey && (
        <LicenseComparisonDialog
          isOpen
          current={currentStatus}
          incoming={incomingPreview}
          onConfirm={handleComparisonConfirm}
          onCancel={() => {
            setPendingKey(null)
            setIncomingPreview(null)
          }}
          isPending={activateLicense.isPending}
        />
      )}
    </div>
  )
}

function EditionBadge({
  isCommercial,
  isExpired,
  wasCommercial,
}: {
  isCommercial: boolean
  isExpired: boolean
  wasCommercial: boolean
}) {
  if (isCommercial) {
    return (
      <span className="bg-success/10 text-success inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
        Commercial
      </span>
    )
  }
  if (wasCommercial) {
    return (
      <span className="bg-warning/10 text-warning inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
        Expired
      </span>
    )
  }
  return (
    <span className="bg-muted text-muted-foreground border-border inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
      Community
    </span>
  )
}
