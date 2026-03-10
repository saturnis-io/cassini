import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { getLicenseStatus } from '@/api/license.api'

const COMMUNITY_DEFAULTS = {
  edition: 'community' as const,
  tier: 'community',
  licensed_tier: null,
  max_plants: 1,
  expires_at: null,
  days_until_expiry: null,
  is_expired: null,
}

export function useLicense() {
  const store = useLicenseStore()

  useEffect(() => {
    if (!store.loaded) {
      getLicenseStatus()
        .then((status) => store.setFromApi(status))
        .catch(() => {
          // On error, finalize as community so the app doesn't hang in limbo
          store.setFromApi(COMMUNITY_DEFAULTS)
        })
    }
  }, [store.loaded])

  return {
    isCommercial: store.edition === 'commercial',
    edition: store.edition,
    tier: store.tier,
    licensedTier: store.licensedTier,
    maxPlants: store.maxPlants,
    expiresAt: store.expiresAt,
    daysUntilExpiry: store.daysUntilExpiry,
    isExpired: store.isExpired ?? false,
    loaded: store.loaded,
  }
}
