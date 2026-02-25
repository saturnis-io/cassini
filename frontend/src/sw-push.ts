/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

/**
 * Push notification event handler for Cassini PWA.
 *
 * Receives push events from the backend's PushNotificationService
 * and shows browser notifications. Clicking navigates to the relevant page.
 */

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  let payload: {
    title?: string
    body?: string
    tag?: string
    data?: { url?: string }
  }

  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Cassini', body: event.data.text() }
  }

  const title = payload.title || 'Cassini Alert'
  const options: NotificationOptions = {
    body: payload.body || '',
    tag: payload.tag || 'cassini-notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
    requireInteraction: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(url)
    }),
  )
})
