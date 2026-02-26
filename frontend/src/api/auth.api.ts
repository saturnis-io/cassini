import type { LoginResponse, RefreshResponse } from '@/types'
import type {
  OIDCProviderPublic,
  OIDCConfigResponse,
  OIDCConfigCreate,
  OIDCConfigUpdate,
  OIDCAuthorizationResponse,
  OIDCCallbackResponse,
} from './client'
import { fetchApi, API_BASE } from './client'

// Auth API
export const authApi = {
  login: (username: string, password: string, rememberMe?: boolean) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember_me: rememberMe ?? false }),
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Login failed' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Login failed')
      }
      return res.json() as Promise<LoginResponse>
    }),

  refresh: () =>
    fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) throw new Error('Refresh failed')
      return res.json() as Promise<RefreshResponse>
    }),

  logout: (oidcProviderId?: number | null) =>
    fetch(`${API_BASE}/auth/logout${oidcProviderId ? `?oidc_provider_id=${oidcProviderId}` : ''}`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) throw new Error('Logout failed')
      return res.json() as Promise<{ message: string; oidc_logout_url?: string }>
    }),

  me: () => fetchApi<import('@/types').AuthUser>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    fetchApi<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  forgotPassword: (identifier: string) =>
    fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    }).then(async (res) => {
      if (!res.ok) throw new Error('Request failed')
      return res.json() as Promise<{ message: string }>
    }),

  resetPassword: (token: string, newPassword: string) =>
    fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Reset failed' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Reset failed')
      }
      return res.json() as Promise<{ message: string }>
    }),

  updateProfile: (data: { display_name?: string; email?: string }) =>
    fetchApi<{ message: string; email_verification_sent: boolean }>('/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// ---- OIDC SSO API ----

export const oidcApi = {
  /** List active OIDC providers (public, no auth) */
  getProviders: () =>
    fetch(`${API_BASE}/auth/oidc/providers`)
      .then(async (res) => {
        if (!res.ok) return [] as OIDCProviderPublic[]
        return res.json() as Promise<OIDCProviderPublic[]>
      })
      .catch(() => [] as OIDCProviderPublic[]),

  /** Get authorization URL for a provider */
  getAuthorizationUrl: (providerId: number, redirectUri: string) =>
    fetch(
      `${API_BASE}/auth/oidc/authorize/${providerId}?redirect_uri=${encodeURIComponent(redirectUri)}`,
    ).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Failed to start SSO' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Failed to start SSO')
      }
      return res.json() as Promise<OIDCAuthorizationResponse>
    }),

  /** Handle OIDC callback (exchange code for tokens) */
  handleCallback: (code: string, state: string) =>
    fetch(
      `${API_BASE}/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
      {
        credentials: 'include',
      },
    ).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'SSO callback failed' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'SSO callback failed')
      }
      return res.json() as Promise<OIDCCallbackResponse>
    }),

  /** List all OIDC configs (admin only) */
  getConfigs: () => fetchApi<OIDCConfigResponse[]>('/auth/oidc/config'),

  /** Create a new OIDC config (admin only) */
  createConfig: (data: OIDCConfigCreate) =>
    fetchApi<OIDCConfigResponse>('/auth/oidc/config', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Update an OIDC config (admin only) */
  updateConfig: (id: number, data: OIDCConfigUpdate) =>
    fetchApi<OIDCConfigResponse>(`/auth/oidc/config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /** Delete an OIDC config (admin only) */
  deleteConfig: (id: number) => fetchApi<void>(`/auth/oidc/config/${id}`, { method: 'DELETE' }),

  /** Get IdP logout URL for RP-initiated logout */
  logout: (providerId: number) =>
    fetchApi<{ logout_url: string | null; message: string }>(`/auth/oidc/logout/${providerId}`),

  /** Get current user's account links */
  getAccountLinks: () =>
    fetchApi<{ id: number; user_id: number; provider_id: number; provider_name: string; oidc_subject: string; linked_at: string }[]>('/auth/oidc/links'),

  /** Delete an account link */
  deleteAccountLink: (linkId: number) =>
    fetchApi<void>(`/auth/oidc/links/${linkId}`, { method: 'DELETE' }),
}
