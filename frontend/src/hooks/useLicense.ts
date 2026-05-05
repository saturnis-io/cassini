import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { getLicenseStatus } from '@/api/license.api'
import type { LicenseTier } from '@/api/license.api'

const COMMUNITY_DEFAULTS = {
  edition: 'community' as const,
  tier: 'community' as LicenseTier,
  licensed_tier: null,
  max_plants: 1,
  expires_at: null,
  days_until_expiry: null,
  is_expired: null,
  instance_id: null,
}

export function useLicense() {
  const store = useLicenseStore()
  const { loaded, setFromApi } = store

  useEffect(() => {
    if (!loaded) {
      getLicenseStatus()
        .then((status) => setFromApi(status))
        .catch(() => {
          // On error, finalize as community so the app doesn't hang in limbo
          setFromApi(COMMUNITY_DEFAULTS)
        })
    }
  }, [loaded, setFromApi])

  return {
    isCommercial: store.edition === 'commercial',
    isPro: store.tier === 'pro',
    isEnterprise: store.tier === 'enterprise',
    isProOrAbove: store.tier === 'pro' || store.tier === 'enterprise',
    edition: store.edition,
    tier: store.tier as LicenseTier,
    licensedTier: store.licensedTier,
    maxPlants: store.maxPlants,
    expiresAt: store.expiresAt,
    daysUntilExpiry: store.daysUntilExpiry,
    isExpired: store.isExpired ?? false,
    loaded: store.loaded,
  }
}
