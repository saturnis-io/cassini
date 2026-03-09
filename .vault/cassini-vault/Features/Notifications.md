---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 2 - Production Polish]]"
tags:
  - feature
  - active
aliases:
  - SMTP
  - Webhooks
  - Push Notifications
---

# Notifications

Multi-channel notification system dispatching alerts via email (SMTP), webhooks (HMAC-SHA256 signed), and browser push notifications (VAPID/Web Push). Subscribes to the Event Bus for SPC events (violations, anomalies) and dispatches per user preferences. Supports per-user channel preferences, per-webhook event filtering, and push subscription management.

## Key Backend Components

- **Dispatcher**: `core/notifications.py` -- `NotificationDispatcher`, `send_email()` (aiosmtplib), `send_webhook()` (httpx + HMAC signing)
- **Push Service**: `core/push_service.py` -- `send_push_notification()` (pywebpush, VAPID)
- **Event Bus**: `core/events/bus.py` -- subscribes to `SampleProcessedEvent`, `ViolationCreatedEvent`
- **Models**: `SmtpConfig`, `WebhookConfig`, `NotificationPreference` in `db/models/notification.py`; `PushSubscription` in `db/models/push_subscription.py`
- **Router**: `api/v1/notifications.py` (10 endpoints), `api/v1/push.py` (4 endpoints)
- **Migrations**: 024 (smtp, webhooks, preferences), 037 (push subscriptions)

## Key Frontend Components

- `NotificationsSettings.tsx` -- unified settings panel for SMTP, webhooks, preferences, and push
- Hooks: `useSmtpConfig`, `useWebhooks`, `useNotificationPreferences`, `usePushSubscribe`, `useVapidKey`

## Connections

- Triggered by [[SPC Engine]] violations and [[Anomaly Detection]] events via Event Bus
- Push notifications enabled by [[Sprints/Sprint 8 - SSO PWA ERP]] PWA work
- Webhook HMAC signing uses per-webhook secrets (not the DB encryption key)
- Configuration accessible to engineers per [[Auth]] role hierarchy
- Settings UI in [[Admin]] settings page

## Known Limitations

- Event Bus dispatch is fire-and-forget -- notification failures do not block SPC processing
- Push endpoint URL validation prevents SSRF (internal network access blocked)
- HMAC webhook signing uses SHA-256 with per-webhook secret
