import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { getLicenseStatus } from '@/api/license.api'

export function useLicense() {
  const store = useLicenseStore()

  useEffect(() => {
    if (!store.loaded) {
      getLicenseStatus()
        .then((status) => store.setFromApi(status))
        .catch(() => {
          // On error, default to community (safe fallback)
        })
    }
  }, [store.loaded])

  return {
    isCommercial: store.edition === 'commercial',
    edition: store.edition,
    tier: store.tier,
    maxPlants: store.maxPlants,
    expiresAt: store.expiresAt,
    daysUntilExpiry: store.daysUntilExpiry,
    isExpired: store.isExpired ?? false,
    loaded: store.loaded,
  }
}
