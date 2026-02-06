import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { OperatorDashboard } from '@/pages/OperatorDashboard'
import { ConfigurationView } from '@/pages/ConfigurationView'
import { DataEntryView } from '@/pages/DataEntryView'
import { SettingsView } from '@/pages/SettingsView'
import { ViolationsView } from '@/pages/ViolationsView'
import { ReportsView } from '@/pages/ReportsView'
import { KioskView } from '@/pages/KioskView'
import { WallDashboard } from '@/pages/WallDashboard'
import { LoginPage } from '@/pages/LoginPage'
import { KioskLayout } from '@/components/KioskLayout'
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { PlantProvider } from '@/providers/PlantProvider'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { ChartHoverProvider } from '@/contexts/ChartHoverContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      retry: 1,
    },
  },
})

/**
 * Auth gate that redirects unauthenticated users to /login.
 * Shows nothing while auth is loading to prevent flash.
 */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

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

  return <>{children}</>
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PlantProvider>
            <ChartHoverProvider>
              <WebSocketProvider>
                <BrowserRouter>
                  <Routes>
                    {/* Login page - outside Layout, no auth required */}
                    <Route path="/login" element={<LoginPage />} />

                    {/* Main app with sidebar layout - requires auth */}
                    <Route
                      path="/"
                      element={
                        <RequireAuth>
                          <Layout />
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
                          <ProtectedRoute requiredRole="admin">
                            <SettingsView />
                          </ProtectedRoute>
                        }
                      />
                    </Route>

                    {/* Display modes - requires auth but no layout chrome */}
                    <Route
                      path="/kiosk"
                      element={
                        <RequireAuth>
                          <KioskLayout>
                            <KioskView />
                          </KioskLayout>
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/wall-dashboard"
                      element={
                        <RequireAuth>
                          <KioskLayout showStatusBar={false}>
                            <WallDashboard />
                          </KioskLayout>
                        </RequireAuth>
                      }
                    />
                  </Routes>
                </BrowserRouter>
                <Toaster
                  position="top-right"
                  closeButton
                  toastOptions={{
                    duration: 10000,
                    classNames: {
                      error: 'bg-destructive text-destructive-foreground',
                      warning: 'bg-warning text-warning-foreground',
                    },
                  }}
                />
              </WebSocketProvider>
            </ChartHoverProvider>
          </PlantProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
