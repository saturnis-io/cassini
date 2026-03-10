/**
 * Cassini - Event-Driven Statistical Process Control System
 * Copyright (c) 2026 Cassini Contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import './i18n/config'
import { Component, lazy, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { KioskLayout } from '@/components/KioskLayout'
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { PlantProvider } from '@/providers/PlantProvider'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { ChartHoverProvider } from '@/contexts/ChartHoverContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { useLicense } from '@/hooks/useLicense'
import { UpgradePage } from '@/pages/UpgradePage'
import { getRegistry } from '@/lib/extensionRegistry'

// ---------------------------------------------------------------------------
// Lazy-loaded page/view components — each becomes its own chunk
// ---------------------------------------------------------------------------
const OperatorDashboard = lazy(() =>
  import('@/pages/OperatorDashboard').then((m) => ({ default: m.OperatorDashboard })),
)
const ConfigurationView = lazy(() =>
  import('@/pages/ConfigurationView').then((m) => ({ default: m.ConfigurationView })),
)
const DataEntryView = lazy(() =>
  import('@/pages/DataEntryView').then((m) => ({ default: m.DataEntryView })),
)
const SettingsPage = lazy(() =>
  import('@/pages/SettingsView').then((m) => ({ default: m.SettingsPage })),
)
const ViolationsView = lazy(() =>
  import('@/pages/ViolationsView').then((m) => ({ default: m.ViolationsView })),
)
const ReportsView = lazy(() =>
  import('@/pages/ReportsView').then((m) => ({ default: m.ReportsView })),
)
const MSAPage = lazy(() => import('@/pages/MSAPage').then((m) => ({ default: m.MSAPage })))
const FAIPage = lazy(() => import('@/pages/FAIPage').then((m) => ({ default: m.FAIPage })))
const AnalyticsPage = lazy(() =>
  import('@/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
)
const DOEPage = lazy(() => import('@/pages/DOEPage').then((m) => ({ default: m.DOEPage })))
const ConnectivityPage = lazy(() =>
  import('@/pages/ConnectivityPage').then((m) => ({ default: m.ConnectivityPage })),
)
const UserManagementPage = lazy(() =>
  import('@/pages/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
)
const DevToolsPage = lazy(() =>
  import('@/pages/DevToolsPage').then((m) => ({ default: m.DevToolsPage })),
)
const KioskView = lazy(() =>
  import('@/pages/KioskView').then((m) => ({ default: m.KioskView })),
)
const WallDashboard = lazy(() =>
  import('@/pages/WallDashboard').then((m) => ({ default: m.WallDashboard })),
)
const GalaxyPage = lazy(() =>
  import('@/pages/GalaxyPage').then((m) => ({ default: m.GalaxyPage })),
)
const GuidePage = lazy(() =>
  import('@/pages/GuidePage').then((m) => ({ default: m.GuidePage })),
)

// Lazy-loaded settings sub-pages
const AppearanceSettings = lazy(() =>
  import('@/components/AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })),
)
const NotificationsSettings = lazy(() =>
  import('@/components/NotificationsSettings').then((m) => ({
    default: m.NotificationsSettings,
  })),
)
const BrandingSettings = lazy(() =>
  import('@/components/settings/BrandingSettings').then((m) => ({
    default: m.BrandingSettings,
  })),
)
const PlantSettings = lazy(() =>
  import('@/components/PlantSettings').then((m) => ({ default: m.PlantSettings })),
)
const ApiKeysSettings = lazy(() =>
  import('@/components/ApiKeysSettings').then((m) => ({ default: m.ApiKeysSettings })),
)
const DatabaseSettings = lazy(() =>
  import('@/components/DatabaseSettings').then((m) => ({ default: m.DatabaseSettings })),
)
const LicenseSettings = lazy(() =>
  import('@/components/LicenseSettings').then((m) => ({ default: m.LicenseSettings })),
)
const RetentionSettings = lazy(() =>
  import('@/components/RetentionSettings').then((m) => ({ default: m.RetentionSettings })),
)
const LocalizationSettings = lazy(() =>
  import('@/components/LocalizationSettings').then((m) => ({
    default: m.LocalizationSettings,
  })),
)
const ScheduledReports = lazy(() =>
  import('@/components/settings/ScheduledReports').then((m) => ({
    default: m.ScheduledReports,
  })),
)
const AuditLogViewer = lazy(() =>
  import('@/components/AuditLogViewer').then((m) => ({ default: m.AuditLogViewer })),
)
const SSOSettings = lazy(() =>
  import('@/components/SSOSettings').then((m) => ({ default: m.SSOSettings })),
)
const SignatureSettingsPage = lazy(() =>
  import('@/components/signatures/SignatureSettingsPage').then((m) => ({
    default: m.SignatureSettingsPage,
  })),
)
const AIConfigSettings = lazy(() =>
  import('@/components/analytics/AIConfigSettings').then((m) => ({
    default: m.AIConfigSettings,
  })),
)
const AccountSettings = lazy(() =>
  import('@/components/AccountSettings').then((m) => ({ default: m.AccountSettings })),
)
const EmailWebhookSettings = lazy(() =>
  import('@/components/EmailWebhookSettings').then((m) => ({
    default: m.EmailWebhookSettings,
  })),
)

// Lazy-loaded connectivity sub-tabs
const MonitorTab = lazy(() =>
  import('@/components/connectivity/MonitorTab').then((m) => ({ default: m.MonitorTab })),
)
const ServersTab = lazy(() =>
  import('@/components/connectivity/ServersTab').then((m) => ({ default: m.ServersTab })),
)
const BrowseTab = lazy(() =>
  import('@/components/connectivity/BrowseTab').then((m) => ({ default: m.BrowseTab })),
)
const MappingTab = lazy(() =>
  import('@/components/connectivity/MappingTab').then((m) => ({ default: m.MappingTab })),
)
const GagesTab = lazy(() =>
  import('@/components/connectivity/GagesTab').then((m) => ({ default: m.GagesTab })),
)
const IntegrationsTab = lazy(() =>
  import('@/components/erp/IntegrationsTab').then((m) => ({ default: m.IntegrationsTab })),
)

// Lazy-loaded editors (heavy sub-pages)
const FAIReportEditor = lazy(() =>
  import('@/components/fai/FAIReportEditor').then((m) => ({ default: m.FAIReportEditor })),
)
const MSAStudyEditor = lazy(() =>
  import('@/components/msa/MSAStudyEditor').then((m) => ({ default: m.MSAStudyEditor })),
)
const DOEStudyEditor = lazy(() =>
  import('@/components/doe/DOEStudyEditor').then((m) => ({ default: m.DOEStudyEditor })),
)

/** Shared loading spinner used as Suspense fallback for lazy-loaded pages */
function PageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p className="text-muted-foreground mt-3 text-sm">Loading...</p>
      </div>
    </div>
  )
}

/** Default stale time for React Query caches (ms) */
const QUERY_STALE_TIME_MS = 10_000

/**
 * Error boundary to catch render errors and prevent full-app crashes.
 * Shows a recovery UI instead of a white screen.
 */
class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Route error boundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-background flex min-h-screen items-center justify-center p-8">
          <div className="max-w-md text-center">
            <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/dashboard'
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * Auth gate that redirects unauthenticated users to /login.
 * Shows nothing while auth is loading to prevent flash.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="border-primary mx-auto h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-muted-foreground mt-3 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

  return <>{children}</>
}

/**
 * License gate that shows an upgrade page for commercial-only routes.
 * Renders nothing while the license status is still loading.
 */
function RequireCommercial({ children }: { children: ReactNode }) {
  const { isCommercial, loaded } = useLicense()
  if (!loaded) return null
  if (!isCommercial) return <UpgradePage />
  return <>{children}</>
}

/**
 * Providers that depend on authentication (plant data, WebSocket, etc.).
 * Only mounted after auth is confirmed to prevent 401 cascades on fresh sessions.
 */
function AuthenticatedProviders({ children }: { children: React.ReactNode }) {
  return (
    <PlantProvider>
      <ChartHoverProvider>
        <WebSocketProvider>{children}</WebSocketProvider>
      </ChartHoverProvider>
    </PlantProvider>
  )
}

/**
 * Shared wrapper for display modes (kiosk, wall dashboard).
 * Combines RequireAuth + AuthenticatedProviders in one component to avoid duplication.
 */
function AuthenticatedDisplayMode({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AuthenticatedProviders>{children}</AuthenticatedProviders>
    </RequireAuth>
  )
}

function App() {
  const extensionRoutes = getRegistry().routes

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY_STALE_TIME_MS,
            retry: 1,
          },
        },
      }),
  )

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Login page - outside auth gate, no providers needed */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* Force password change - outside main layout, user has token but must change password */}
              <Route path="/change-password" element={<ChangePasswordPage />} />

              {/* Companion guides — accessible without login for evaluation */}
              <Route
                path="/guide/:seedKey"
                element={
                  <Suspense fallback={<PageSpinner />}>
                    <GuidePage />
                  </Suspense>
                }
              />

              {/* Main app with sidebar layout - requires auth */}
              <Route
                path="/"
                element={
                  <RequireAuth>
                    <AuthenticatedProviders>
                      <RouteErrorBoundary>
                        <Layout />
                      </RouteErrorBoundary>
                    </AuthenticatedProviders>
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard/:charId?" element={<Suspense fallback={<PageSpinner />}><OperatorDashboard /></Suspense>} />
                <Route path="data-entry" element={<ErrorBoundary><Suspense fallback={<PageSpinner />}><DataEntryView /></Suspense></ErrorBoundary>} />
                <Route path="violations" element={<ErrorBoundary><Suspense fallback={<PageSpinner />}><ViolationsView /></Suspense></ErrorBoundary>} />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute requiredRole="supervisor">
                      <Suspense fallback={<PageSpinner />}>
                        <ReportsView />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="connectivity"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <ErrorBoundary>
                        <Suspense fallback={<PageSpinner />}>
                          <ConnectivityPage />
                        </Suspense>
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="monitor" replace />} />
                  <Route path="monitor" element={<Suspense fallback={<PageSpinner />}><MonitorTab /></Suspense>} />
                  <Route path="servers" element={<Suspense fallback={<PageSpinner />}><ServersTab /></Suspense>} />
                  <Route path="mapping" element={<Suspense fallback={<PageSpinner />}><MappingTab /></Suspense>} />
                  <Route
                    path="browse"
                    element={
                      <RequireCommercial>
                        <Suspense fallback={<PageSpinner />}><BrowseTab /></Suspense>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="gages"
                    element={
                      <RequireCommercial>
                        <Suspense fallback={<PageSpinner />}><GagesTab /></Suspense>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="integrations"
                    element={
                      <RequireCommercial>
                        <Suspense fallback={<PageSpinner />}><IntegrationsTab /></Suspense>
                      </RequireCommercial>
                    }
                  />
                </Route>
                <Route
                  path="configuration"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <ErrorBoundary>
                        <Suspense fallback={<PageSpinner />}>
                          <ConfigurationView />
                        </Suspense>
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="msa"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <ErrorBoundary>
                          <Suspense fallback={<PageSpinner />}>
                            <MSAPage />
                          </Suspense>
                        </ErrorBoundary>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="msa/:studyId"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <Suspense fallback={<PageSpinner />}>
                          <MSAStudyEditor />
                        </Suspense>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="fai"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <ErrorBoundary>
                          <Suspense fallback={<PageSpinner />}>
                            <FAIPage />
                          </Suspense>
                        </ErrorBoundary>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="fai/:reportId"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <Suspense fallback={<PageSpinner />}>
                          <FAIReportEditor />
                        </Suspense>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="analytics"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <ErrorBoundary>
                          <Suspense fallback={<PageSpinner />}>
                            <AnalyticsPage />
                          </Suspense>
                        </ErrorBoundary>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="doe"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <ErrorBoundary>
                          <Suspense fallback={<PageSpinner />}>
                            <DOEPage />
                          </Suspense>
                        </ErrorBoundary>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="doe/new"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <Suspense fallback={<PageSpinner />}>
                          <DOEStudyEditor />
                        </Suspense>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="doe/:studyId"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <Suspense fallback={<PageSpinner />}>
                          <DOEStudyEditor />
                        </Suspense>
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route path="settings" element={<ErrorBoundary><Suspense fallback={<PageSpinner />}><SettingsPage /></Suspense></ErrorBoundary>}>
                  <Route index element={<Navigate to="account" replace />} />
                  <Route path="account" element={<Suspense fallback={null}><AccountSettings /></Suspense>} />
                  <Route path="appearance" element={<Suspense fallback={null}><AppearanceSettings /></Suspense>} />
                  <Route
                    path="notifications"
                    element={
                      <RequireCommercial>
                        <Suspense fallback={null}><NotificationsSettings /></Suspense>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="branding"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Suspense fallback={null}><BrandingSettings /></Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="license"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Suspense fallback={null}><LicenseSettings /></Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="sites"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Suspense fallback={null}><PlantSettings /></Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="localization"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Suspense fallback={null}><LocalizationSettings /></Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="email-webhooks"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <Suspense fallback={null}><EmailWebhookSettings /></Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="api-keys"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <Suspense fallback={null}><ApiKeysSettings /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="retention"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <Suspense fallback={null}><RetentionSettings /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <Suspense fallback={null}><ScheduledReports /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="sso"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <Suspense fallback={null}><SSOSettings /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="audit-log"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <Suspense fallback={null}><AuditLogViewer /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="signatures"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <Suspense fallback={null}><SignatureSettingsPage /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="ai"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <Suspense fallback={null}><AIConfigSettings /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="database"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <Suspense fallback={null}><DatabaseSettings /></Suspense>
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  {/* Extension settings routes */}
                  {getRegistry().settingsTabs.map((tab) => (
                    <Route
                      key={tab.to}
                      path={tab.to}
                      element={
                        <RequireCommercial>
                          {tab.minRole ? (
                            <ProtectedRoute requiredRole={tab.minRole}>
                              <Suspense fallback={null}>
                                <tab.component />
                              </Suspense>
                            </ProtectedRoute>
                          ) : (
                            <Suspense fallback={null}>
                              <tab.component />
                            </Suspense>
                          )}
                        </RequireCommercial>
                      }
                    />
                  ))}
                </Route>
                <Route
                  path="admin/users"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <Suspense fallback={<PageSpinner />}>
                        <UserManagementPage />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="dev-tools"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <Suspense fallback={<PageSpinner />}>
                        <DevToolsPage />
                      </Suspense>
                    </ProtectedRoute>
                  }
                />
                {/* Extension routes — registered by commercial package */}
                {extensionRoutes.map((ext) => (
                  <Route
                    key={ext.path}
                    path={ext.path}
                    element={
                      <RequireCommercial>
                        {ext.requiredRole ? (
                          <ProtectedRoute requiredRole={ext.requiredRole}>
                            <ErrorBoundary>
                              <Suspense fallback={null}>
                                <ext.component />
                              </Suspense>
                            </ErrorBoundary>
                          </ProtectedRoute>
                        ) : (
                          <ErrorBoundary>
                            <Suspense fallback={null}>
                              <ext.component />
                            </Suspense>
                          </ErrorBoundary>
                        )}
                      </RequireCommercial>
                    }
                  />
                ))}
              </Route>

              {/* Display modes - requires auth but no layout chrome */}
              <Route
                path="/kiosk"
                element={
                  <AuthenticatedDisplayMode>
                    <KioskLayout>
                      <Suspense fallback={<PageSpinner />}>
                        <KioskView />
                      </Suspense>
                    </KioskLayout>
                  </AuthenticatedDisplayMode>
                }
              />
              <Route
                path="/wall-dashboard"
                element={
                  <AuthenticatedDisplayMode>
                    <KioskLayout showStatusBar={false}>
                      <Suspense fallback={<PageSpinner />}>
                        <WallDashboard />
                      </Suspense>
                    </KioskLayout>
                  </AuthenticatedDisplayMode>
                }
              />
              <Route
                path="/galaxy"
                element={
                  <AuthenticatedDisplayMode>
                    <ErrorBoundary>
                      <Suspense fallback={<PageSpinner />}>
                        <GalaxyPage />
                      </Suspense>
                    </ErrorBoundary>
                  </AuthenticatedDisplayMode>
                }
              />
            </Routes>
          </BrowserRouter>
          <Toaster
            position="top-right"
            closeButton
            toastOptions={{
              duration: 3000,
              classNames: {
                error: 'bg-destructive text-destructive-foreground',
                warning: 'bg-warning text-warning-foreground',
              },
            }}
            expand={false}
          />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
