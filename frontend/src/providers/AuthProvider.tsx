import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { authApi, setAccessToken } from '@/api/client'
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
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  clearMustChangePassword: () => void
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
    }

    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const login = useCallback(async (username: string, password: string, rememberMe?: boolean) => {
    const data = await authApi.login(username, password, rememberMe)
    setAccessToken(data.access_token)
    setUser(data.user)
    setMustChangePassword(data.must_change_password ?? false)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null)
    setUser(null)
    setMustChangePassword(false)
  }, [])

  const clearMustChangePassword = useCallback(() => setMustChangePassword(false), [])

  // Derive role from user's plant_roles and selected plant
  const role: Role = useMemo(() => {
    if (!user || !user.plant_roles || user.plant_roles.length === 0) {
      if (user) {
        console.warn(
          `[AuthProvider] User "${user.username}" has no plant_roles — defaulting to 'operator'. ` +
          'An admin should assign this user a role via the user management page.'
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
        login,
        logout,
        clearMustChangePassword,
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
