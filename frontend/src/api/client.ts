import i18n from 'i18next'
import type { RefreshResponse } from '@/types'

// ---- Exported types (extracted to api/types.ts, re-exported for backward compatibility) ----
export type * from './types'

// ---- Core API infrastructure ----

export const API_BASE = '/api/v1'

/** Minimum seconds before token expiry to trigger proactive refresh */
const TOKEN_EXPIRY_BUFFER_SEC = 120

/** Cooldown period (ms) after a refresh completes before allowing another */
const REFRESH_COOLDOWN_MS = 5_000

// Access token stored in memory only (not localStorage).
// Module-scope is acceptable here: this runs in a single browser JS context
// and the token is never persisted to storage. Only fetchApi and auth hooks
// access it via the exported getter/setter.
let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null
let lastRefreshTime = 0

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * Decode JWT payload without signature verification (just base64).
 * Returns the exp timestamp in seconds, or null if unparseable.
 */
function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * Check if the access token is about to expire (within 2 minutes).
 */
function isTokenExpiringSoon(): boolean {
  if (!accessToken) return false
  const exp = getTokenExpiry(accessToken)
  if (exp === null) return false
  const nowSec = Math.floor(Date.now() / 1000)
  return exp - nowSec < TOKEN_EXPIRY_BUFFER_SEC
}

/**
 * Perform a token refresh. If a refresh is already in flight, return the
 * existing promise so all concurrent 401 callers wait on the same refresh.
 */
function doRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  // If a refresh just completed within the cooldown window, skip to avoid overlap
  // between proactive refresh and 401-triggered refresh
  if (Date.now() - lastRefreshTime < REFRESH_COOLDOWN_MS && accessToken) {
    return Promise.resolve(accessToken)
  }

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (res.ok) {
        const data: RefreshResponse = await res.json()
        accessToken = data.access_token
        return accessToken
      }
      // Refresh failed — force logout
      accessToken = null
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return null
    })
    .catch(() => {
      accessToken = null
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return null
    })
    .finally(() => {
      lastRefreshTime = Date.now()
      refreshPromise = null
    })

  return refreshPromise
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Proactively refresh token before it expires to avoid 401 round-trips
  if (accessToken && isTokenExpiringSoon() && !endpoint.startsWith('/auth/')) {
    await doRefresh()
  }

  const buildHeaders = () => {
    const h: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    }
    // Only set Content-Type for requests that have a body.
    // Skip for FormData — browser must set multipart boundary automatically.
    if (options?.body && !(options.body instanceof FormData)) {
      h['Content-Type'] = h['Content-Type'] || 'application/json'
    }
    if (accessToken) {
      h['Authorization'] = `Bearer ${accessToken}`
    }
    h['Accept-Language'] = i18n.language || 'en'
    return h
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: buildHeaders(),
    credentials: 'include',
  })

  // Handle 401 with automatic token refresh (skip for auth endpoints)
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const newToken = await doRefresh()
    if (newToken) {
      // Retry with the refreshed token
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: buildHeaders(),
        credentials: 'include',
      })
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(
          typeof error.detail === 'string' ? error.detail : `HTTP ${retryResponse.status}`,
        )
      }
      // Contract: 204 returns undefined. All DELETE callers ignore the return value via mutation hooks.
      if (retryResponse.status === 204) return undefined as T
      return retryResponse.json()
    }
    throw new Error('Session expired')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    // Handle Pydantic validation errors (array of errors) and standard errors
    let message = 'Unknown error'
    if (typeof error.detail === 'string') {
      message = error.detail
    } else if (Array.isArray(error.detail)) {
      // Pydantic validation error format: [{loc: [...], msg: "...", type: "..."}]
      message = error.detail
        .map((e: { msg: string; loc?: string[] }) =>
          e.loc ? `${e.loc.join('.')}: ${e.msg}` : e.msg,
        )
        .join('; ')
    } else if (error.detail) {
      message = JSON.stringify(error.detail)
    }
    throw new Error(message || `HTTP ${response.status}`)
  }

  // Handle 204 No Content responses (e.g., DELETE operations).
  // Contract: 204 returns undefined. All DELETE callers ignore the return value via mutation hooks.
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// ---- Re-export all domain API namespaces for backward compatibility ----

export { authApi, oidcApi } from './auth.api'
export { plantApi, hierarchyApi } from './plants.api'
export { characteristicApi, sampleApi, dataEntryApi, annotationApi } from './characteristics.api'
export { violationApi, anomalyApi, distributionApi, capabilityApi, rulePresetApi } from './quality.api'
export { brokerApi, providerApi, opcuaApi, tagApi, gageBridgeApi } from './connectivity.api'
export { databaseApi, userApi, auditApi, retentionApi, importApi, devtoolsApi, apiKeysApi } from './admin.api'
export { notificationApi } from './notifications.api'
export { signatureApi } from './signatures.api'
export { reportScheduleApi } from './reports.api'
export { msaApi } from './msa.api'
export { faiApi } from './fai.api'
export { pushApi } from './push.api'
export { erpApi } from './erp.api'
export { predictionApi, aiApi } from './predictions.api'
