import { createContext, useContext, useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import type { Role } from '@/lib/roles'

/**
 * User definition for authentication context
 */
export interface User {
  id: string
  name: string
  email: string
  role: Role
}

/**
 * Context value for authentication state
 */
interface AuthContextValue {
  user: User | null
  role: Role
  setRole: (role: Role) => void // For dev/testing
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Mock user for development
 * In production, this would come from authentication
 */
const MOCK_USER: User = {
  id: 'dev-user-1',
  name: 'Dev User',
  email: 'dev@openspc.local',
  role: 'operator', // Default role, overridden by stored value
}

interface AuthProviderProps {
  children: ReactNode
}

/**
 * Provider for authentication context
 *
 * Manages the current user and their role. In development mode,
 * provides ability to switch roles for testing purposes.
 * Syncs with uiStore for role persistence.
 *
 * @example
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { currentRole, setCurrentRole } = useUIStore()

  // Derive user with current role from store
  const [user] = useState<User>(() => ({
    ...MOCK_USER,
    role: currentRole,
  }))

  // Keep user.role in sync with store
  const effectiveUser: User = {
    ...user,
    role: currentRole,
  }

  const setRole = (role: Role) => {
    setCurrentRole(role)
  }

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        role: currentRole,
        setRole,
        isAuthenticated: true, // Always authenticated in mock mode
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook to access authentication context
 *
 * @returns AuthContextValue with user info and role controls
 * @throws Error if used outside AuthProvider
 *
 * @example
 * const { user, role, setRole } = useAuth()
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
