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
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { PlantProvider } from '@/providers/PlantProvider'
import { AuthProvider } from '@/providers/AuthProvider'
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

function App() {
  return (
    <ThemeProvider>
      <PlantProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <ChartHoverProvider>
              <WebSocketProvider>
                <BrowserRouter>
                  <Routes>
                    {/* Main app with sidebar layout */}
                    <Route path="/" element={<Layout />}>
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
          </QueryClientProvider>
        </AuthProvider>
      </PlantProvider>
    </ThemeProvider>
  )
}

export default App
