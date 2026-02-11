import { Component, useState, type ErrorInfo, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { OperatorDashboard } from '@/pages/OperatorDashboard'
import { ConfigurationView } from '@/pages/ConfigurationView'
import { DataEntryView } from '@/pages/DataEntryView'
import { SettingsPage } from '@/pages/SettingsView'
import { AppearanceSettings } from '@/components/AppearanceSettings'
import { NotificationsSettings } from '@/components/NotificationsSettings'
import { ThemeCustomizer } from '@/components/ThemeCustomizer'
import { PlantSettings } from '@/components/PlantSettings'
import { ApiKeysSettings } from '@/components/ApiKeysSettings'
import { DatabaseSettings } from '@/components/DatabaseSettings'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { DevToolsPage } from '@/pages/DevToolsPage'
import { ConnectivityPage } from '@/pages/ConnectivityPage'
import { MonitorTab } from '@/components/connectivity/MonitorTab'
import { ServersTab } from '@/components/connectivity/ServersTab'
import { BrowseTab } from '@/components/connectivity/BrowseTab'
import { MappingTab } from '@/components/connectivity/MappingTab'
import { ViolationsView } from '@/pages/ViolationsView'
import { ReportsView } from '@/pages/ReportsView'
import { KioskView } from '@/pages/KioskView'
import { WallDashboard } from '@/pages/WallDashboard'
import { LoginPage } from '@/pages/LoginPage'
import { ChangePasswordPage } from '@/pages/ChangePasswordPage'
import { KioskLayout } from '@/components/KioskLayout'
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { PlantProvider } from '@/providers/PlantProvider'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { ChartHoverProvider } from '@/contexts/ChartHoverContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

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
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.href = '/dashboard'
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }

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
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
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
      <AuthenticatedProviders>
        {children}
      </AuthenticatedProviders>
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
      })
  )

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Login page - outside auth gate, no providers needed */}
              <Route path="/login" element={<LoginPage />} />

              {/* Force password change - outside main layout, user has token but must change password */}
              <Route path="/change-password" element={<ChangePasswordPage />} />

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
                <Route path="dashboard" element={<OperatorDashboard />} />
                <Route path="data-entry" element={<DataEntryView />} />
                <Route path="violations" element={<ViolationsView />} />
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
                      <ConnectivityPage />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="monitor" replace />} />
                  <Route path="monitor" element={<MonitorTab />} />
                  <Route path="servers" element={<ServersTab />} />
                  <Route path="browse" element={<BrowseTab />} />
                  <Route path="mapping" element={<MappingTab />} />
                </Route>
                <Route
                  path="configuration"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <ConfigurationView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute requiredRole="engineer">
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="appearance" replace />} />
                  <Route path="appearance" element={<AppearanceSettings />} />
                  <Route path="notifications" element={<NotificationsSettings />} />
                  <Route
                    path="branding"
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <ThemeCustomizer />
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
                  <Route path="api-keys" element={<ApiKeysSettings />} />
                  <Route path="database" element={<DatabaseSettings />} />
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
