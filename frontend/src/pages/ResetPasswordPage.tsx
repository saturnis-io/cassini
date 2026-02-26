import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { CassiniLogo } from '@/components/login/CassiniLogo'

/**
 * Reset password page — Cassini retro aerospace style.
 *
 * Reads a `token` query param from the URL (sent via email link).
 * Lets the user set a new password, then redirects to /login.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Auto-redirect to login 3 seconds after success
  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => {
      navigate('/login', { replace: true })
    }, 3000)
    return () => clearTimeout(timer)
  }, [success, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsSubmitting(true)

    try {
      await authApi.resetPassword(token!, newPassword)
      setSuccess(true)
    } catch (err) {
      setError((err as Error).message || 'Failed to reset password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="cassini-login relative min-h-screen overflow-hidden">
      {/* Static dark background */}
      <div className="fixed inset-0 z-0" style={{ background: '#080C16' }} />

      {/* Form overlay */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="control-panel p-8">
            {/* Logo */}
            <div className="mb-8 flex select-none flex-col items-center text-center">
              <CassiniLogo size={120} className="mb-2" />
            </div>

            {/* Divider */}
            <div
              className="mb-6 h-0.5 w-full opacity-50"
              style={{ backgroundColor: '#4B5563' }}
            />

            {!token ? (
              /* No token — invalid link */
              <div className="space-y-5">
                <div className="mb-2">
                  <h2
                    className="text-lg font-semibold tracking-widest uppercase"
                    style={{ color: '#F4F1DE', fontFamily: 'monospace' }}
                  >
                    Invalid Link
                  </h2>
                </div>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#9CA3AF', fontFamily: 'monospace' }}
                >
                  This password reset link is missing or invalid. Please request a new one.
                </p>

                <Link
                  to="/forgot-password"
                  className="btn-primary mt-4 block w-full px-4 py-3 text-center text-sm transition-colors"
                >
                  Request New Link
                </Link>

                <div className="mt-3 text-center">
                  <Link
                    to="/login"
                    className="text-[10px] font-mono uppercase transition-colors hover:text-[#F4F1DE]"
                    style={{ color: '#4B5563' }}
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            ) : success ? (
              /* Success state */
              <div className="space-y-5">
                <div className="mb-2">
                  <h2
                    className="text-lg font-semibold tracking-widest uppercase"
                    style={{ color: '#F4F1DE', fontFamily: 'monospace' }}
                  >
                    Password Reset
                  </h2>
                </div>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#9CA3AF', fontFamily: 'monospace' }}
                >
                  Your password has been successfully reset. Redirecting to sign in...
                </p>

                <Link
                  to="/login"
                  className="btn-primary mt-4 block w-full px-4 py-3 text-center text-sm transition-colors"
                >
                  Sign In Now
                </Link>
              </div>
            ) : (
              /* Form state */
              <>
                <div className="mb-6">
                  <h2
                    className="text-lg font-semibold tracking-widest uppercase"
                    style={{ color: '#F4F1DE', fontFamily: 'monospace' }}
                  >
                    Set New Password
                  </h2>
                  <p
                    className="mt-2 text-xs tracking-wider uppercase"
                    style={{ color: '#4B5563', fontFamily: 'monospace' }}
                  >
                    Enter your new password below
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Error message */}
                  {error && (
                    <div
                      className="p-3 text-sm"
                      style={{
                        backgroundColor: 'rgba(224, 90, 61, 0.15)',
                        color: '#E05A3D',
                      }}
                    >
                      {error}
                    </div>
                  )}

                  {/* New Password */}
                  <div className="space-y-2">
                    <label
                      htmlFor="new-password"
                      className="block text-xs font-mono tracking-widest uppercase"
                      style={{ color: '#D4AF37' }}
                    >
                      New Password
                    </label>
                    <input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="new-password"
                      className="input-field w-full px-4 py-3 text-sm focus:outline-none"
                      placeholder="Min 8 characters"
                    />
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <label
                      htmlFor="confirm-password"
                      className="block text-xs font-mono tracking-widest uppercase"
                      style={{ color: '#D4AF37' }}
                    >
                      Confirm Password
                    </label>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      className="input-field w-full px-4 py-3 text-sm focus:outline-none"
                      placeholder="Repeat new password"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !newPassword || !confirmPassword}
                    className="btn-primary mt-4 w-full px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? 'Resetting...' : 'Reset Password'}
                  </button>
                </form>

                {/* Back to login */}
                <div className="mt-5 text-center">
                  <Link
                    to="/login"
                    className="text-[10px] font-mono uppercase transition-colors hover:text-[#F4F1DE]"
                    style={{ color: '#4B5563' }}
                  >
                    Back to Sign In
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <p
            className="mt-6 text-center font-mono tracking-widest uppercase"
            style={{ fontSize: '10px', color: '#4B5563' }}
          >
            Cassini v0.4.0 &bull; Saturnis
          </p>
        </div>
      </div>
    </div>
  )
}
