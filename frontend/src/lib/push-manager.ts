/**
 * Push notification manager for OpenSPC PWA.
 *
 * Handles browser permission requests, PushManager subscription,
 * and server-side subscription registration via the Push API.
 */

import { fetchApi } from '@/api/client'

const PUSH_API_BASE = '/push'

interface VAPIDKeyResponse {
  public_key: string
}

interface PushSubscriptionData {
  endpoint: string
  p256dh_key: string
  auth_key: string
}

/**
 * Check if push notifications are supported in this browser.
 */
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Get the current notification permission state.
 */
export function getPermissionState(): NotificationPermission {
  return Notification.permission
}

/**
 * Request notification permission from the user.
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return 'denied'
  return Notification.requestPermission()
}

/**
 * Subscribe to push notifications.
 *
 * 1. Gets the VAPID public key from the server
 * 2. Subscribes via the browser PushManager
 * 3. Sends the subscription to the server
 */
export async function subscribeToPush(): Promise<boolean> {
  try {
    if (!isPushSupported()) {
      console.warn('Push notifications not supported')
      return false
    }

    const permission = await requestPermission()
    if (permission !== 'granted') {
      console.warn('Push notification permission denied')
      return false
    }

    // Get VAPID public key from server
    const { public_key } = await fetchApi<VAPIDKeyResponse>(`${PUSH_API_BASE}/vapid-key`)

    // Convert VAPID key to Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(public_key)

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready

    // Subscribe via PushManager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })

    // Extract keys
    const rawKey = subscription.getKey('p256dh')
    const rawAuth = subscription.getKey('auth')

    if (!rawKey || !rawAuth) {
      console.error('Failed to get push subscription keys')
      return false
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      p256dh_key: arrayBufferToBase64(rawKey),
      auth_key: arrayBufferToBase64(rawAuth),
    }

    // Register subscription with server
    await fetchApi(`${PUSH_API_BASE}/subscribe`, {
      method: 'POST',
      body: JSON.stringify(subscriptionData),
    })

    return true
  } catch (error) {
    console.error('Failed to subscribe to push:', error)
    return false
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      // Unsubscribe from browser
      await subscription.unsubscribe()

      // Remove from server
      const rawKey = subscription.getKey('p256dh')
      const rawAuth = subscription.getKey('auth')

      if (rawKey && rawAuth) {
        await fetchApi(`${PUSH_API_BASE}/unsubscribe`, {
          method: 'DELETE',
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh_key: arrayBufferToBase64(rawKey),
            auth_key: arrayBufferToBase64(rawAuth),
          }),
        })
      }
    }

    return true
  } catch (error) {
    console.error('Failed to unsubscribe from push:', error)
    return false
  }
}

/**
 * Check if the user is currently subscribed to push notifications.
 */
export async function isSubscribed(): Promise<boolean> {
  try {
    if (!isPushSupported()) return false
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return subscription !== null
  } catch {
    return false
  }
}

// ---- Utility functions ----

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
