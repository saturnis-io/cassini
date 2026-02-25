import { fetchApi } from './client'

export const pushApi = {
  /** Get VAPID public key for PushManager.subscribe() */
  getVapidKey: () =>
    fetchApi<{ public_key: string }>('/push/vapid-key'),

  /** Register a push subscription */
  subscribe: (data: { endpoint: string; p256dh_key: string; auth_key: string }) =>
    fetchApi<{ id: number; user_id: number; endpoint: string; created_at: string }>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Remove a push subscription */
  unsubscribe: (data: { endpoint: string; p256dh_key: string; auth_key: string }) =>
    fetchApi<void>('/push/unsubscribe', {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),

  /** List current user's push subscriptions */
  getSubscriptions: () =>
    fetchApi<{ id: number; user_id: number; endpoint: string; created_at: string }[]>('/push/subscriptions'),
}
