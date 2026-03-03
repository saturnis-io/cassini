export const pushKeys = {
  all: ['push'] as const,
  subscriptions: () => ['push', 'subscriptions'] as const,
  vapidKey: () => ['push', 'vapid-key'] as const,
}
