import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { OperatorDashboard } from '@/pages/OperatorDashboard'
import { ConfigurationView } from '@/pages/ConfigurationView'
import { DataEntryView } from '@/pages/DataEntryView'
import { SettingsView } from '@/pages/SettingsView'
import { WebSocketProvider } from '@/providers/WebSocketProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'

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
      <QueryClientProvider client={queryClient}>
        <WebSocketProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<OperatorDashboard />} />
                <Route path="configuration" element={<ConfigurationView />} />
                <Route path="data-entry" element={<DataEntryView />} />
                <Route path="settings" element={<SettingsView />} />
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
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
