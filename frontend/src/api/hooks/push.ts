import { useQuery } from '@tanstack/react-query'
import { pushApi } from '../push.api'

export const pushKeys = {
  all: ['push'] as const,
  subscriptions: () => ['push', 'subscriptions'] as const,
  vapidKey: () => ['push', 'vapid-key'] as const,
}

export function usePushSubscriptions() {
  return useQuery({
    queryKey: pushKeys.subscriptions(),
    queryFn: () => pushApi.getSubscriptions(),
  })
}

export function useVapidKey() {
  return useQuery({
    queryKey: pushKeys.vapidKey(),
    queryFn: () => pushApi.getVapidKey(),
    retry: false,
  })
}
