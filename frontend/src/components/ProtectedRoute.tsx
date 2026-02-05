import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess, ROLE_LABELS, type Role } from '@/lib/roles'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: Role
  redirectTo?: string
}

/**
 * Route wrapper for role-based access control
 *
 * Checks if the current user has sufficient privileges to access the route.
 * If not, shows a toast notification and redirects to the specified path.
 *
 * @param children - Content to render if access is granted
 * @param requiredRole - Minimum role required to access this route
 * @param redirectTo - Path to redirect to if access denied (default: '/dashboard')
 *
 * @example
 * <Route
 *   path="/settings"
 *   element={
 *     <ProtectedRoute requiredRole="admin">
 *       <SettingsView />
 *     </ProtectedRoute>
 *   }
 * />
 */
export function ProtectedRoute({
  children,
  requiredRole,
  redirectTo = '/dashboard',
}: ProtectedRouteProps) {
  const { role } = useAuth()

  const canAccess = hasAccess(role, requiredRole)

  // Show toast on access denied
  useEffect(() => {
    if (!canAccess) {
      toast.error('Access Denied', {
        description: `This page requires ${ROLE_LABELS[requiredRole]} or higher privileges.`,
        duration: 5000,
      })
    }
  }, [canAccess, requiredRole])

  if (!canAccess) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
