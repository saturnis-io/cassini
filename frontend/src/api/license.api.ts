import { fetchApi } from '@/api/client'

export interface LicenseStatus {
  edition: 'community' | 'commercial'
  tier: string
  licensed_tier: string | null
  max_plants: number
  expires_at: string | null
  days_until_expiry: number | null
  is_expired: boolean | null
  license_name?: string | null
}

export interface LicenseCompliance {
  active_plant_count: number
  total_plant_count: number
  max_plants: number
  excess: number
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  return fetchApi<LicenseStatus>('/license/status')
}

export async function removeLicense(): Promise<LicenseStatus> {
  return fetchApi<LicenseStatus>('/license', { method: 'DELETE' })
}

export async function getLicenseCompliance(): Promise<LicenseCompliance> {
  return fetchApi<LicenseCompliance>('/license/compliance')
}

export async function activateLicense(key: string): Promise<LicenseStatus> {
  return fetchApi<LicenseStatus>('/license/activate', {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
}
