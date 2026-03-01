import React, { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/providers/AuthProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { useOIDCProviders } from '@/api/hooks'
import { oidcApi } from '@/api/client'
import { setAccessToken } from '@/api/client'
import { CassiniLogo } from '@/components/login/CassiniLogo'
import { deriveLogoColors } from '@/lib/brand-engine'
import type { BrandConfig as FullBrandConfig } from '@/lib/brand-engine'

const SaturnScene = React.lazy(() => import('@/components/login/SaturnScene'))

/**
 * Cassini-branded login page with animated Three.js Saturn background.
 *
 * Displayed outside the main Layout (no sidebar).
 * On successful login, redirects to the previously attempted URL or /dashboard.
 */
export function LoginPage() {
  const { t } = useTranslation('auth')
  const { t: tCommon } = useTranslation('common')
  const { login, isAuthenticated, setOidcProviderId } = useAuth()
  const { fullBrandConfig } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()

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
          window.location.href = from
        })
        .catch((err) => {
          sessionStorage.removeItem('cassini_oidc_provider_id')
          setError((err as Error).message || t('errors.ssoFailed'))
          setSsoLoading(null)
        })
    }
  }, [searchParams, isAuthenticated, from, t, setOidcProviderId])

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
      const callbackUrl = `${window.location.origin}/login`
      const result = await oidcApi.getAuthorizationUrl(providerId, callbackUrl)
      sessionStorage.setItem('cassini_oidc_provider_id', String(providerId))
      window.location.href = result.authorization_url
    } catch (err) {
      setError((err as Error).message || t('errors.ssoFailed'))
      setSsoLoading(null)
    }
  }

  const hasProviders = oidcProviders && oidcProviders.length > 0

  // Derive Saturn scene colors from brand config — memoize on individual hex values
  // to avoid rebuilding the entire Three.js scene on unrelated brand config changes
  const saturnNavy = fullBrandConfig?.accent?.hex ?? '#080C16'
  const saturnGold = fullBrandConfig?.primary?.hex ?? '#D4AF37'
  const saturnOrange = fullBrandConfig?.destructive?.hex ?? '#E05A3D'
  const saturnColors = useMemo(
    () => ({
      navy: saturnNavy,
      gold: saturnGold,
      cream: '#F4F1DE',
      orange: saturnOrange,
      muted: '#4B5563',
    }),
    [saturnNavy, saturnGold, saturnOrange],
  )

  // Derive logo colors from brand config
  const logoColors = useMemo(() => {
    if (!fullBrandConfig) return undefined
    const derived = deriveLogoColors(fullBrandConfig as FullBrandConfig)
    return {
      planet: derived.planet,
      ring: derived.ring,
      line: derived.line,
      dot: derived.dot,
    }
  }, [fullBrandConfig])

  // Resolved brand primary color for UI accents
  const primaryColor = fullBrandConfig?.primary?.hex ?? '#D4AF37'

  return (
    <div className="cassini-login relative min-h-screen overflow-hidden">
      {/* Background: static image or animated Saturn scene */}
      {fullBrandConfig?.loginMode === 'static' && fullBrandConfig?.loginBackgroundUrl ? (
        <div className="fixed inset-0 z-0">
          <img
            src={fullBrandConfig.loginBackgroundUrl}
            alt=""
            className="h-full w-full object-cover"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>
      ) : (
        <Suspense
          fallback={
            <div
              className="fixed inset-0"
              style={{ background: saturnColors?.navy ?? '#080C16' }}
            />
          }
        >
          <SaturnScene brandColors={saturnColors} />
        </Suspense>
      )}

      {/* Login form overlay */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="control-panel p-8">
            {/* Mission Patch Emblem */}
            <div className="mb-8 flex select-none flex-col items-center text-center">
              <CassiniLogo size={164} className="mb-2" brandColors={logoColors} />
            </div>

            {/* Divider */}
            <div className="mb-6 h-0.5 w-full opacity-50" style={{ backgroundColor: '#4B5563' }} />

            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-widest uppercase" style={{ color: '#F4F1DE', fontFamily: 'monospace' }}>
                Sign In
              </h2>
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

              {/* Username */}
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="block text-xs font-mono tracking-widest uppercase"
                  style={{ color: primaryColor }}
                >
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
                  className="input-field w-full px-4 py-3 text-sm focus:outline-none"
                  placeholder={t('enterUsername')}
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label
                    htmlFor="password"
                    className="block text-xs font-mono tracking-widest uppercase"
                    style={{ color: primaryColor }}
                  >
                    {t('password')}
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-[10px] font-mono uppercase transition-colors hover:text-[#F4F1DE]"
                    style={{ color: '#4B5563' }}
                    tabIndex={-1}
                  >
                    Forgot Password?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="input-field w-full px-4 py-3 text-sm focus:outline-none"
                  placeholder={t('enterPassword')}
                />
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="cassini-checkbox h-4 w-4"
                    tabIndex={-1}
                  />
                  <label
                    htmlFor="remember-me"
                    className="cursor-pointer select-none text-xs font-mono tracking-wider uppercase"
                    style={{ color: '#4B5563' }}
                  >
                    {t('rememberMe')}
                  </label>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !username || !password}
                className="btn-primary mt-4 w-full px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? t('signingIn') : 'Log In'}
              </button>
            </form>

            {/* SSO Providers */}
            {hasProviders && (
              <>
                {/* Divider */}
                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ backgroundColor: `${primaryColor}33` }} />
                  <span
                    className="text-xs font-mono tracking-wider uppercase"
                    style={{ color: '#4B5563' }}
                  >
                    {tCommon('or')}
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: `${primaryColor}33` }} />
                </div>

                {/* SSO Buttons */}
                <div className="space-y-2">
                  {oidcProviders.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => handleSSOLogin(provider.id)}
                      disabled={ssoLoading !== null}
                      className="w-full px-4 py-2.5 text-sm font-mono tracking-wider uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        border: `1px solid ${primaryColor}4D`,
                        color: primaryColor,
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = `${primaryColor}1A`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
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
                <div
                  className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-t-transparent"
                  style={{ borderColor: primaryColor, borderTopColor: 'transparent' }}
                />
                <p className="mt-2 text-sm" style={{ color: '#4B5563' }}>
                  {t('completingSso')}
                </p>
              </div>
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
