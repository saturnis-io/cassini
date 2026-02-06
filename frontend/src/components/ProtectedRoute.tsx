import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess, ROLE_LABELS, type Role } from '@/lib/roles'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole: Role
  redirectTo?: string
}

/**
 * Route wrapper for authentication and role-based access control.
 *
 * 1. If not authenticated and not loading: redirect to /login
 * 2. If authenticated but insufficient role: redirect to dashboard with toast
 * 3. While loading: show nothing (prevents flash)
 */
export function ProtectedRoute({
  children,
  requiredRole,
  redirectTo = '/dashboard',
}: ProtectedRouteProps) {
  const { role, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  const canAccess = hasAccess(role, requiredRole)

  // Show toast on access denied (only when authenticated but wrong role)
  useEffect(() => {
    if (isAuthenticated && !canAccess) {
      toast.error('Access Denied', {
        description: `This page requires ${ROLE_LABELS[requiredRole]} or higher privileges.`,
        duration: 5000,
      })
    }
  }, [isAuthenticated, canAccess, requiredRole])

  // Still checking auth state
  if (isLoading) {
    return null
  }

  // Not authenticated - redirect to login with return URL
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  // Authenticated but insufficient role
  if (!canAccess) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
