import type {
  NotificationPreference,
  NotificationPreferenceItem,
  SmtpConfigResponse,
  SmtpConfigUpdate,
  WebhookConfigCreate,
  WebhookConfigResponse,
  WebhookConfigUpdate,
} from './client'
import { fetchApi } from './client'

export const notificationApi = {
  // SMTP
  getSmtp: () => fetchApi<SmtpConfigResponse | null>('/notifications/smtp'),

  updateSmtp: (data: SmtpConfigUpdate) =>
    fetchApi<SmtpConfigResponse>('/notifications/smtp', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testSmtp: () => fetchApi<{ message: string }>('/notifications/smtp/test', { method: 'POST' }),

  // Webhooks
  listWebhooks: () => fetchApi<WebhookConfigResponse[]>('/notifications/webhooks'),

  createWebhook: (data: WebhookConfigCreate) =>
    fetchApi<WebhookConfigResponse>('/notifications/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWebhook: (id: number, data: WebhookConfigUpdate) =>
    fetchApi<WebhookConfigResponse>(`/notifications/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteWebhook: (id: number) =>
    fetchApi<void>(`/notifications/webhooks/${id}`, { method: 'DELETE' }),

  testWebhook: (id: number) =>
    fetchApi<{ message: string }>(`/notifications/webhooks/${id}/test`, { method: 'POST' }),

  // Preferences
  getPreferences: () => fetchApi<NotificationPreference[]>('/notifications/preferences'),

  updatePreferences: (preferences: NotificationPreferenceItem[]) =>
    fetchApi<NotificationPreference[]>('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),
}
