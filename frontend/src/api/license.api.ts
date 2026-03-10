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
  instance_id: string | null
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
  license_key: string | null
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

const PORTAL_BASE_URL = 'https://saturnis.io'

/**
 * Register this Cassini instance with the saturnis.io portal (online activation).
 *
 * The license JWT IS the authentication — no session/cookie needed.
 * Called automatically after license upload if the instance has internet access.
 */
export async function registerOnPortal(
  licenseKey: string,
  instanceName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/licenses/public-activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey, instanceName }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch {
    // Network error — instance is likely air-gapped
    return { ok: false, error: 'Network unreachable' }
  }
}

/**
 * Deregister this Cassini instance from the saturnis.io portal (online deactivation).
 *
 * Called automatically when removing a license if the instance has internet access.
 */
export async function deregisterFromPortal(
  licenseKey: string,
  instanceName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${PORTAL_BASE_URL}/api/licenses/public-deactivate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey, instanceName }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      return { ok: false, error: data?.error || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch {
    // Network error — instance is likely air-gapped
    return { ok: false, error: 'Network unreachable' }
  }
}
