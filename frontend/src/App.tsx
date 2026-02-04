import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { Layout } from '@/components/Layout'
import { OperatorDashboard } from '@/pages/OperatorDashboard'
import { ConfigurationView } from '@/pages/ConfigurationView'
import { WebSocketProvider } from '@/providers/WebSocketProvider'

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
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<OperatorDashboard />} />
              <Route path="configuration" element={<ConfigurationView />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
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
  )
}

export default App
