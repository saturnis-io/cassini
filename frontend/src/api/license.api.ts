import { fetchApi } from '@/api/client'

export interface LicenseStatus {
  edition: 'community' | 'commercial'
  tier: string
  max_plants: number
  expires_at: string | null
  days_until_expiry: number | null
  is_expired: boolean | null
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return fetchApi<LicenseStatus>('license/status')
}
