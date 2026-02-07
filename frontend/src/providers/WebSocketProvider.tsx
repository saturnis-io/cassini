import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDashboardStore } from '@/stores/dashboardStore'
import { queryKeys } from '@/api/hooks'
import { getAccessToken } from '@/api/client'
import type { WSMessage } from '@/types'

const WS_RECONNECT_DELAY_BASE = 1000
const WS_RECONNECT_DELAY_MAX = 30000

interface WebSocketContextValue {
  isConnected: boolean
  subscribe: (characteristicId: number) => void
  unsubscribe: (characteristicId: number) => void
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectDelayRef = useRef(WS_RECONNECT_DELAY_BASE)
  const subscriptionsRef = useRef<Set<number>>(new Set())
  const connectRef = useRef<() => void>(() => {})

  const {
    wsConnected,
    setWsConnected,
    addPendingViolation,
    updateLatestSample,
  } = useDashboardStore()

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data)

      switch (message.type) {
        case 'sample': {
          updateLatestSample(
            message.characteristic_id,
            message.sample.mean,
            message.sample.timestamp
          )
          queryClient.invalidateQueries({
            queryKey: queryKeys.characteristics.chartData(message.characteristic_id),
          })
          message.violations.forEach((violation) => {
            addPendingViolation(violation)
          })
          break
        }

        case 'violation': {
          addPendingViolation(message.violation)
          queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
          break
        }

        case 'ack_update': {
          queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
          break
        }

        case 'limits_update': {
          queryClient.invalidateQueries({
            queryKey: queryKeys.characteristics.detail(message.characteristic_id),
          })
          queryClient.invalidateQueries({
            queryKey: queryKeys.characteristics.chartData(message.characteristic_id),
          })
          break
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }, [queryClient, updateLatestSample, addPendingViolation])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    // Don't connect without a token — the backend requires JWT auth
    const token = getAccessToken()
    if (!token) {
      // Retry after a short delay (token may become available after refresh)
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connectRef.current()
      }, WS_RECONNECT_DELAY_BASE)
      return
    }

    // Use Vite proxy - connect via the frontend server which proxies to backend
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/samples?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected (app-level)')
      setWsConnected(true)
      reconnectDelayRef.current = WS_RECONNECT_DELAY_BASE

      // Re-subscribe to all characteristics
      subscriptionsRef.current.forEach((id) => {
        ws.send(JSON.stringify({ type: 'subscribe', characteristic_ids: [id] }))
      })
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      console.log('WebSocket disconnected, will reconnect...')
      setWsConnected(false)

      // Reconnect with exponential backoff
      const delay = Math.min(reconnectDelayRef.current, WS_RECONNECT_DELAY_MAX)
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectDelayRef.current *= 2
        connectRef.current()
      }, delay)
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }, [handleMessage, setWsConnected])

  // Keep the ref updated with the latest connect function
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  const subscribe = useCallback((characteristicId: number) => {
    subscriptionsRef.current.add(characteristicId)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'subscribe', characteristic_ids: [characteristicId] })
      )
    }
  }, [])

  const unsubscribe = useCallback((characteristicId: number) => {
    subscriptionsRef.current.delete(characteristicId)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'unsubscribe', characteristic_ids: [characteristicId] })
      )
    }
  }, [])

  // Connect on app mount - this stays connected across page navigations
  useEffect(() => {
    connect()

    // Only cleanup on full app unmount (browser close/refresh)
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connect])

  return (
    <WebSocketContext.Provider value={{ isConnected: wsConnected, subscribe, unsubscribe }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider')
  }
  return context
}
