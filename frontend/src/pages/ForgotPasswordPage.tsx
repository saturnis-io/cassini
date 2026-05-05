import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { CassiniLogo } from '@/components/login/CassiniLogo'

/**
 * Forgot password page — Cassini retro aerospace style.
 *
 * Collects a username or email and fires a reset request.
 * Always shows the same success message regardless of whether the account
 * exists, preventing user enumeration.
 */
export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await authApi.forgotPassword(identifier)
    } catch {
      // Always show success to prevent user enumeration
    } finally {
      setSubmitted(true)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="cassini-login relative min-h-screen overflow-hidden">
      {/* Static dark background — no Saturn scene needed */}
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

            {submitted ? (
              /* Success state */
              <div className="space-y-5">
                <div className="mb-2">
                  <h2
                    className="text-lg font-semibold tracking-widest uppercase"
                    style={{ color: '#F4F1DE', fontFamily: 'monospace' }}
                  >
                    Check Your Email
                  </h2>
                </div>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: '#9CA3AF', fontFamily: 'monospace' }}
                >
                  If an account with that identifier exists, a reset link has been sent to the
                  associated email address.
                </p>

                <Link
                  to="/login"
                  className="btn-primary mt-4 block w-full px-4 py-3 text-center text-sm transition-colors"
                >
                  Back to Sign In
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
                    Reset Your Password
                  </h2>
                  <p
                    className="mt-2 text-xs tracking-wider uppercase"
                    style={{ color: '#4B5563', fontFamily: 'monospace' }}
                  >
                    Enter your username or email address
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Identifier */}
                  <div className="space-y-2">
                    <label
                      htmlFor="identifier"
                      className="block text-xs font-mono tracking-widest uppercase"
                      style={{ color: '#D4AF37' }}
                    >
                      Username or Email
                    </label>
                    <input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      autoFocus
                      autoComplete="username"
                      className="input-field w-full px-4 py-3 text-sm focus:outline-none"
                      placeholder="Enter username or email"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !identifier.trim()}
                    className="btn-primary mt-4 w-full px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSubmitting ? 'Sending...' : 'Send Reset Link'}
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
            Cassini v{__APP_VERSION__} &bull; Saturnis
          </p>
        </div>
      </div>
    </div>
  )
}
