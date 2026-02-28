import { create } from 'zustand'
import type { LicenseStatus } from '@/api/license.api'

interface LicenseState {
  edition: 'community' | 'commercial'
  tier: string
  maxPlants: number
  expiresAt: string | null
  daysUntilExpiry: number | null
  isExpired: boolean | null
  loaded: boolean
  setFromApi: (status: LicenseStatus) => void
}

export const useLicenseStore = create<LicenseState>()((set) => ({
  edition: 'community',
  tier: 'community',
  maxPlants: 1,
  expiresAt: null,
  daysUntilExpiry: null,
  isExpired: null,
  loaded: false,

  setFromApi: (status) =>
    set({
      edition: status.edition,
      tier: status.tier,
      maxPlants: status.max_plants,
      expiresAt: status.expires_at,
      daysUntilExpiry: status.days_until_expiry,
      isExpired: status.is_expired,
      loaded: true,
    }),
}))
