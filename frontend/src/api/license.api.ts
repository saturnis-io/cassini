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

export interface ActivationFile {
  type: 'cassini-activation' | 'cassini-deactivation'
  version: number
  licenseId: string
  instanceId: string
  timestamp: string
}

export interface LicenseRemoveResponse {
  status: LicenseStatus
  deactivation_file: ActivationFile | null
}

export async function getActivationFile(): Promise<ActivationFile> {
  return fetchApi<ActivationFile>('/license/activation-file')
}

export async function removeLicense(): Promise<LicenseRemoveResponse> {
  return fetchApi<LicenseRemoveResponse>('/license', { method: 'DELETE' })
}

export function downloadJsonFile(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
