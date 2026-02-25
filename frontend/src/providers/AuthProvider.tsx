import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useUIStore } from '@/stores/uiStore'
import { authApi, setAccessToken } from '@/api/client'
import { oidcApi } from '@/api/auth.api'
import type { AuthUser } from '@/types'
import type { Role } from '@/lib/roles'

/**
 * Context value for authentication state
 */
interface AuthContextValue {
  user: AuthUser | null
  role: Role
  isAuthenticated: boolean
  isLoading: boolean
  mustChangePassword: boolean
  oidcProviderId: number | null
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  clearMustChangePassword: () => void
  setOidcProviderId: (id: number | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Provider for JWT-based authentication.
 *
 * On mount, attempts to restore session via refresh token cookie.
 * Derives user role from plant_roles and the currently selected plant.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [oidcProviderId, setOidcProviderIdRaw] = useState<number | null>(() => {
    // Restore OIDC provider ID from sessionStorage (survives page reloads during SSO flow)
    const stored = sessionStorage.getItem('openspc_oidc_provider_id')
    return stored ? Number(stored) : null
  })
  // Wrapper that syncs OIDC provider ID to sessionStorage for cross-reload persistence
  const setOidcProviderId = useCallback((id: number | null) => {
    setOidcProviderIdRaw(id)
    if (id !== null) {
      sessionStorage.setItem('openspc_oidc_provider_id', String(id))
    } else {
      sessionStorage.removeItem('openspc_oidc_provider_id')
    }
  }, [])

  const selectedPlantId = useUIStore((s) => s.selectedPlantId)

  // Restore session on mount via refresh token cookie
  useEffect(() => {
    let mounted = true

    async function restoreSession() {
      try {
        const refreshData = await authApi.refresh()
        setAccessToken(refreshData.access_token)
        const userData = await authApi.me()
        if (mounted) {
          setUser(userData)
        }
      } catch {
        // No valid refresh token - user is not authenticated
        if (mounted) {
          setUser(null)
          setAccessToken(null)
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    restoreSession()

    return () => {
      mounted = false
    }
  }, [])

  // Listen for forced logout from API client (401 with failed refresh)
  useEffect(() => {
    function handleLogout() {
      setUser(null)
      setAccessToken(null)
      setOidcProviderId(null)
    }

    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [setOidcProviderId])

  const login = useCallback(async (username: string, password: string, rememberMe?: boolean) => {
    const data = await authApi.login(username, password, rememberMe)
    setAccessToken(data.access_token)
    setUser(data.user)
    setMustChangePassword(data.must_change_password ?? false)
  }, [])

  const logout = useCallback(async () => {
    try {
      let oidcLogoutUrl: string | null = null

      // If user logged in via OIDC, get the IdP logout URL
      if (oidcProviderId) {
        try {
          const result = await oidcApi.logout(oidcProviderId)
          oidcLogoutUrl = result.logout_url
        } catch {
          // Ignore — proceed with local logout
        }
      }

      await authApi.logout(oidcProviderId)
      setAccessToken(null)
      setUser(null)
      setMustChangePassword(false)
      setOidcProviderId(null)

      // Redirect to IdP logout if available
      if (oidcLogoutUrl) {
        window.location.href = oidcLogoutUrl
      }
    } catch {
      // Ensure we clear state even if API call fails
      setAccessToken(null)
      setUser(null)
      setMustChangePassword(false)
      setOidcProviderId(null)
    }
  }, [oidcProviderId])

  const clearMustChangePassword = useCallback(() => setMustChangePassword(false), [])

  // Derive role from user's plant_roles and selected plant
  const role: Role = useMemo(() => {
    if (!user || !user.plant_roles || user.plant_roles.length === 0) {
      if (user) {
        console.warn(
          `[AuthProvider] User "${user.username}" has no plant_roles — defaulting to 'operator'. ` +
            'An admin should assign this user a role via the user management page.',
        )
      }
      return 'operator'
    }

    if (selectedPlantId) {
      const assignment = user.plant_roles.find((pr) => pr.plant_id === selectedPlantId)
      if (assignment) {
        return assignment.role
      }
    }

    // Fall back to highest role across all plants
    const roleHierarchy: Record<string, number> = {
      operator: 1,
      supervisor: 2,
      engineer: 3,
      admin: 4,
    }
    let highest: Role = 'operator'
    for (const pr of user.plant_roles) {
      if ((roleHierarchy[pr.role] || 0) > (roleHierarchy[highest] || 0)) {
        highest = pr.role
      }
    }
    return highest
  }, [user, selectedPlantId])

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAuthenticated: user !== null,
        isLoading,
        mustChangePassword,
        oidcProviderId,
        login,
        logout,
        clearMustChangePassword,
        setOidcProviderId,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access authentication context
 *
 * @returns AuthContextValue with user info, role, and auth functions
 * @throws Error if used outside AuthProvider
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
