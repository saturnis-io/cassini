import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDashboardStore } from '@/stores/dashboardStore'
import { queryKeys } from '@/api/hooks'
import type { WSMessage } from '@/types'

const WS_RECONNECT_DELAY_BASE = 1000
const WS_RECONNECT_DELAY_MAX = 30000

export function useWebSocket(characteristicIds: number[]) {
  const queryClient = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectDelayRef = useRef(WS_RECONNECT_DELAY_BASE)
  const subscriptionsRef = useRef<Set<number>>(new Set())
  const connectRef = useRef<() => void>(() => {})

  const {
    setWsConnected,
    addPendingViolation,
    updateLatestSample,
  } = useDashboardStore()

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WSMessage = JSON.parse(event.data)

      switch (message.type) {
        case 'sample': {
          // Update cache
          updateLatestSample(
            message.characteristic_id,
            message.sample.mean,
            message.sample.timestamp
          )
          // Invalidate queries
          queryClient.invalidateQueries({
            queryKey: queryKeys.characteristics.chartData(message.characteristic_id),
          })
          // Handle violations
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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/samples`

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('WebSocket connected')
      setWsConnected(true)
      reconnectDelayRef.current = WS_RECONNECT_DELAY_BASE

      // Re-subscribe to all characteristics
      subscriptionsRef.current.forEach((id) => {
        ws.send(JSON.stringify({ action: 'subscribe', characteristic_id: id }))
      })
    }

    ws.onmessage = handleMessage

    ws.onclose = () => {
      console.log('WebSocket disconnected')
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
        JSON.stringify({ action: 'subscribe', characteristic_id: characteristicId })
      )
    }
  }, [])

  const unsubscribe = useCallback((characteristicId: number) => {
    subscriptionsRef.current.delete(characteristicId)

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ action: 'unsubscribe', characteristic_id: characteristicId })
      )
    }
  }, [])

  // Connect on mount
  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      wsRef.current?.close()
    }
  }, [connect])

  // Manage subscriptions
  useEffect(() => {
    const currentSubs = subscriptionsRef.current
    const newIds = new Set(characteristicIds)

    // Subscribe to new IDs
    newIds.forEach((id) => {
      if (!currentSubs.has(id)) {
        subscribe(id)
      }
    })

    // Unsubscribe from removed IDs
    currentSubs.forEach((id) => {
      if (!newIds.has(id)) {
        unsubscribe(id)
      }
    })
  }, [characteristicIds, subscribe, unsubscribe])

  return {
    isConnected: useDashboardStore((state) => state.wsConnected),
    subscribe,
    unsubscribe,
  }
}
