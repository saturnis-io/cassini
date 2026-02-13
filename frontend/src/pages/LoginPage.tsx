import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/providers/AuthProvider'
import { useOIDCProviders } from '@/api/hooks'
import { oidcApi } from '@/api/client'
import { setAccessToken } from '@/api/client'

/**
 * Login page with username/password form and SSO buttons.
 *
 * Displayed outside the main Layout (no sidebar).
 * On successful login, redirects to the previously attempted URL or /dashboard.
 */
export function LoginPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const logoSrc = '/header-logo.svg'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [ssoLoading, setSsoLoading] = useState<number | null>(null)

  // Fetch active OIDC providers for SSO buttons
  const { data: oidcProviders } = useOIDCProviders()

  // Redirect destination after login (from ProtectedRoute)
  const from = (location.state as { from?: string })?.from || '/dashboard'

  // Handle OIDC callback — if we have code + state in URL params
  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (code && state && !isAuthenticated) {
      setSsoLoading(-1)
      setError(null)

      oidcApi
        .handleCallback(code, state)
        .then((result) => {
          setAccessToken(result.access_token)
          // Force a page reload to let AuthProvider pick up the new session
          window.location.href = from
        })
        .catch((err) => {
          setError((err as Error).message || t('errors.ssoFailed'))
          setSsoLoading(null)
        })
    }
  }, [searchParams, isAuthenticated, from, t])

  // If already authenticated, redirect via effect (not during render)
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, from, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(username, password, rememberMe)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message || t('errors.loginFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSSOLogin(providerId: number) {
    setError(null)
    setSsoLoading(providerId)

    try {
      // Build the callback URL pointing back to this login page
      const callbackUrl = `${window.location.origin}/login`
      const result = await oidcApi.getAuthorizationUrl(providerId, callbackUrl)
      // Redirect to the OIDC provider
      window.location.href = result.authorization_url
    } catch (err) {
      setError((err as Error).message || t('errors.ssoFailed'))
      setSsoLoading(null)
    }
  }

  const hasProviders = oidcProviders && oidcProviders.length > 0

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <img src={logoSrc} alt="OpenSPC logo" className="mx-auto mb-3 h-16 w-16 object-contain" />
          <h1 className="text-foreground text-3xl font-bold tracking-tight">OpenSPC</h1>
          <p className="text-muted-foreground mt-1 text-sm">{tCommon('statisticalProcessControl')}</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-lg border p-6 shadow-sm">
          <h2 className="text-foreground mb-4 text-lg font-semibold">{t('signIn')}</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">
                {error}
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-foreground block text-sm font-medium">
                {t('username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                placeholder={t('enterUsername')}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-foreground block text-sm font-medium">
                {t('password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                placeholder={t('enterPassword')}
              />
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="border-border text-primary focus:ring-ring h-4 w-4 rounded"
              />
              <label htmlFor="remember-me" className="text-muted-foreground text-sm">
                {t('rememberMe')}
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || !username || !password}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? t('signingIn') : t('signIn')}
            </button>
          </form>

          {/* SSO Providers */}
          {hasProviders && (
            <>
              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <span className="text-muted-foreground text-xs font-medium uppercase">{tCommon('or')}</span>
                <div className="bg-border h-px flex-1" />
              </div>

              {/* SSO Buttons */}
              <div className="space-y-2">
                {oidcProviders.map((provider) => (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => handleSSOLogin(provider.id)}
                    disabled={ssoLoading !== null}
                    className="border-border text-foreground hover:bg-muted w-full rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ssoLoading === provider.id
                      ? t('redirecting')
                      : t('signInWithProvider', { provider: provider.name })}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* OIDC callback loading indicator */}
          {ssoLoading === -1 && (
            <div className="mt-4 text-center">
              <div className="border-primary mx-auto h-6 w-6 animate-spin rounded-full border-4 border-t-transparent" />
              <p className="text-muted-foreground mt-2 text-sm">{t('completingSso')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-muted-foreground mt-4 text-center text-xs">OpenSPC v0.4.0</p>
      </div>
    </div>
  )
}
