/**
 * Cassini - Event-Driven Statistical Process Control System
 * Copyright (c) 2026 Cassini Contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import './i18n/config'
import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { OperatorDashboard } from '@/pages/OperatorDashboard'
import { ConfigurationView } from '@/pages/ConfigurationView'
import { DataEntryView } from '@/pages/DataEntryView'
import { SettingsPage } from '@/pages/SettingsView'
import { AppearanceSettings } from '@/components/AppearanceSettings'
import { NotificationsSettings } from '@/components/NotificationsSettings'
import { BrandingSettings } from '@/components/settings/BrandingSettings'
import { PlantSettings } from '@/components/PlantSettings'
import { ApiKeysSettings } from '@/components/ApiKeysSettings'
import { DatabaseSettings } from '@/components/DatabaseSettings'
import { RetentionSettings } from '@/components/RetentionSettings'
import { LocalizationSettings } from '@/components/LocalizationSettings'
import { ScheduledReports } from '@/components/settings/ScheduledReports'
import { AuditLogViewer } from '@/components/AuditLogViewer'
import { SSOSettings } from '@/components/SSOSettings'
import { SignatureSettingsPage } from '@/components/signatures/SignatureSettingsPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { DevToolsPage } from '@/pages/DevToolsPage'
import { ConnectivityPage } from '@/pages/ConnectivityPage'
import { MonitorTab } from '@/components/connectivity/MonitorTab'
import { ServersTab } from '@/components/connectivity/ServersTab'
import { BrowseTab } from '@/components/connectivity/BrowseTab'
import { MappingTab } from '@/components/connectivity/MappingTab'
import { GagesTab } from '@/components/connectivity/GagesTab'
import { IntegrationsTab } from '@/components/erp/IntegrationsTab'
import { ViolationsView } from '@/pages/ViolationsView'
import { ReportsView } from '@/pages/ReportsView'
import { MSAPage } from '@/pages/MSAPage'
import { FAIPage } from '@/pages/FAIPage'
import { FAIReportEditor } from '@/components/fai/FAIReportEditor'
import { MSAStudyEditor } from '@/components/msa/MSAStudyEditor'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { DOEPage } from '@/pages/DOEPage'
import { DOEStudyEditor } from '@/components/doe/DOEStudyEditor'
import { AIConfigSettings } from '@/components/analytics/AIConfigSettings'
import { AccountSettings } from '@/components/AccountSettings'
import { EmailWebhookSettings } from '@/components/EmailWebhookSettings'
import { MaterialSettings } from '@/components/materials/MaterialSettings'
import { KioskView } from '@/pages/KioskView'
import { WallDashboard } from '@/pages/WallDashboard'
import { GalaxyPage } from '@/pages/GalaxyPage'
import { GuidePage } from '@/pages/GuidePage'
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
              <Route path="/guide/:seedKey" element={<GuidePage />} />

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
                <Route path="dashboard/:charId?" element={<OperatorDashboard />} />
                <Route path="data-entry" element={<ErrorBoundary><DataEntryView /></ErrorBoundary>} />
                <Route path="violations" element={<ErrorBoundary><ViolationsView /></ErrorBoundary>} />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute requiredRole="supervisor">
                      <ReportsView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="connectivity"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <ErrorBoundary>
                        <ConnectivityPage />
                      </ErrorBoundary>
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="monitor" replace />} />
                  <Route path="monitor" element={<MonitorTab />} />
                  <Route path="servers" element={<ServersTab />} />
                  <Route path="mapping" element={<MappingTab />} />
                  <Route
                    path="browse"
                    element={
                      <RequireCommercial>
                        <BrowseTab />
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="gages"
                    element={
                      <RequireCommercial>
                        <GagesTab />
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="integrations"
                    element={
                      <RequireCommercial>
                        <IntegrationsTab />
                      </RequireCommercial>
                    }
                  />
                </Route>
                <Route
                  path="configuration"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <ErrorBoundary>
                        <ConfigurationView />
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
                          <MSAPage />
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
                        <MSAStudyEditor />
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
                          <FAIPage />
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
                        <FAIReportEditor />
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
                          <AnalyticsPage />
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
                          <DOEPage />
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
                        <DOEStudyEditor />
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route
                  path="doe/:studyId"
                  element={
                    <RequireCommercial>
                      <ProtectedRoute requiredRole="engineer">
                        <DOEStudyEditor />
                      </ProtectedRoute>
                    </RequireCommercial>
                  }
                />
                <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>}>
                  <Route index element={<Navigate to="account" replace />} />
                  <Route path="account" element={<AccountSettings />} />
                  <Route path="appearance" element={<AppearanceSettings />} />
                  <Route
                    path="notifications"
                    element={
                      <RequireCommercial>
                        <NotificationsSettings />
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="branding"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <BrandingSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="sites"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <PlantSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="localization"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <LocalizationSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="email-webhooks"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <EmailWebhookSettings />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="api-keys"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <ApiKeysSettings />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="retention"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <RetentionSettings />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="reports"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <ScheduledReports />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="sso"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <SSOSettings />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="audit-log"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <AuditLogViewer />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="signatures"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <SignatureSettingsPage />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="ai"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="admin">
                          <AIConfigSettings />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="database"
                    element={
                      <RequireCommercial>
                        <ProtectedRoute requiredRole="engineer">
                          <DatabaseSettings />
                        </ProtectedRoute>
                      </RequireCommercial>
                    }
                  />
                  <Route
                    path="materials"
                    element={
                      <ProtectedRoute requiredRole="engineer">
                        <MaterialSettings />
                      </ProtectedRoute>
                    }
                  />
                </Route>
                <Route
                  path="admin/users"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <UserManagementPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="dev-tools"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <DevToolsPage />
                    </ProtectedRoute>
                  }
                />
              </Route>

              {/* Display modes - requires auth but no layout chrome */}
              <Route
                path="/kiosk"
                element={
                  <AuthenticatedDisplayMode>
                    <KioskLayout>
                      <KioskView />
                    </KioskLayout>
                  </AuthenticatedDisplayMode>
                }
              />
              <Route
                path="/wall-dashboard"
                element={
                  <AuthenticatedDisplayMode>
                    <KioskLayout showStatusBar={false}>
                      <WallDashboard />
                    </KioskLayout>
                  </AuthenticatedDisplayMode>
                }
              />
              <Route
                path="/galaxy"
                element={
                  <AuthenticatedDisplayMode>
                    <ErrorBoundary>
                      <GalaxyPage />
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
