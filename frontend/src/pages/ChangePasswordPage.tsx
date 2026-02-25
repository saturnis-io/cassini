import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/AuthProvider'
import { authApi } from '@/api/client'

/**
 * Forced password change page.
 *
 * Displayed when must_change_password is true after login.
 * Matches the LoginPage visual style (centered card, logo, same CSS classes).
 * Redirects to /dashboard after successful password change.
 */
export function ChangePasswordPage() {
  const { isAuthenticated, mustChangePassword, clearMustChangePassword, logout } = useAuth()
  const navigate = useNavigate()
  const logoSrc = '/header-logo.svg'

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { replace: true })
    }
  }, [isAuthenticated, navigate])

  // Redirect to dashboard if password change is not required
  useEffect(() => {
    if (isAuthenticated && !mustChangePassword) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, mustChangePassword, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate confirm password
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    setIsSubmitting(true)

    try {
      await authApi.changePassword(currentPassword, newPassword)
      clearMustChangePassword()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError((err as Error).message || 'Failed to change password')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSignOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <img src={logoSrc} alt="Cassini logo" className="mx-auto mb-3 h-16 w-16 object-contain" />
          <h1 className="text-foreground text-3xl font-bold tracking-tight">Cassini</h1>
          <p className="text-muted-foreground mt-1 text-sm">Statistical Process Control</p>
        </div>

        {/* Change Password Card */}
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h2 className="text-foreground mb-2 text-lg font-semibold">Change Password</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            Your password must be changed before continuing.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                {error}
              </div>
            )}

            {/* Current Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="current-password"
                className="text-foreground block text-sm font-medium"
              >
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                autoFocus
                className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                placeholder="Enter current password"
              />
            </div>

            {/* New Password */}
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-foreground block text-sm font-medium">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                placeholder="Enter new password (min 8 characters)"
              />
            </div>

            {/* Confirm New Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-password"
                className="text-foreground block text-sm font-medium"
              >
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                placeholder="Confirm new password"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !currentPassword || !newPassword || !confirmPassword}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>

          {/* Sign out link */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              Sign out instead
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-muted-foreground mt-4 text-center text-xs">Cassini v0.5.0</p>
      </div>
    </div>
  )
}
