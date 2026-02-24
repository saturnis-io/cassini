# Notifications

## Data Flow
```
Event Bus (core/events/) publishes events:
  SampleProcessedEvent, ViolationCreatedEvent, ControlLimitsUpdatedEvent
    → NotificationDispatcher subscribes to Event Bus
    → checks NotificationPreference per user
    → dispatches via:
      - SMTP (aiosmtplib) using SmtpConfig
      - Webhook (httpx + HMAC-SHA256) using WebhookConfig

NotificationsSettings.tsx → useSmtpConfig() + useWebhooks() + useNotificationPreferences()
  → CRUD via /api/v1/notifications/* endpoints
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| SmtpConfig | db/models/notification.py | id, host, port, username, password, from_address, use_tls, plant_id(FK) | 024 |
| WebhookConfig | db/models/notification.py | id, name, url, secret(HMAC key), is_active, event_types(JSON), plant_id(FK), headers(JSON) | 024 |
| NotificationPreference | db/models/notification.py | id, user_id(FK), plant_id(FK), event_type, email_enabled, webhook_enabled | 024 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/notifications/smtp | - | SmtpConfigResponse or null | get_current_user |
| PUT | /api/v1/notifications/smtp | body: SmtpConfigUpdate | SmtpConfigResponse | get_current_engineer |
| POST | /api/v1/notifications/smtp/test | - | {message} | get_current_engineer |
| GET | /api/v1/notifications/webhooks | - | list[WebhookConfigResponse] | get_current_user |
| POST | /api/v1/notifications/webhooks | body: WebhookConfigCreate | WebhookConfigResponse (201) | get_current_engineer |
| PUT | /api/v1/notifications/webhooks/{webhook_id} | body: WebhookConfigUpdate | WebhookConfigResponse | get_current_engineer |
| DELETE | /api/v1/notifications/webhooks/{webhook_id} | - | 204 | get_current_engineer |
| POST | /api/v1/notifications/webhooks/{webhook_id}/test | - | {message} | get_current_engineer |
| GET | /api/v1/notifications/preferences | - | list[NotificationPreferenceResponse] | get_current_user |
| PUT | /api/v1/notifications/preferences | body: list[NotificationPreferenceItem] | list[NotificationPreferenceResponse] | get_current_user |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| NotificationDispatcher | core/notifications.py | dispatch_email(), dispatch_webhook(), on_violation_created(), on_sample_processed() |
| EventBus | core/events/__init__.py | publish(event), subscribe(event_type, handler) |

### Repositories
No dedicated repository; direct session queries in notifications.py router.

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| NotificationsSettings | components/NotificationsSettings.tsx | - | useSmtpConfig, useUpdateSmtpConfig, useTestSmtp, useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useTestWebhook, useNotificationPreferences, useUpdateNotificationPreferences |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useSmtpConfig | notificationApi.getSmtp | GET /notifications/smtp | ['notifications', 'smtp'] |
| useUpdateSmtpConfig | notificationApi.updateSmtp | PUT /notifications/smtp | invalidates smtp |
| useTestSmtp | notificationApi.testSmtp | POST /notifications/smtp/test | - |
| useWebhooks | notificationApi.listWebhooks | GET /notifications/webhooks | ['notifications', 'webhooks'] |
| useCreateWebhook | notificationApi.createWebhook | POST /notifications/webhooks | invalidates webhooks |
| useUpdateWebhook | notificationApi.updateWebhook | PUT /notifications/webhooks/{id} | invalidates webhooks |
| useDeleteWebhook | notificationApi.deleteWebhook | DELETE /notifications/webhooks/{id} | invalidates webhooks |
| useTestWebhook | notificationApi.testWebhook | POST /notifications/webhooks/{id}/test | - |
| useNotificationPreferences | notificationApi.getPreferences | GET /notifications/preferences | ['notifications', 'preferences'] |
| useUpdateNotificationPreferences | notificationApi.updatePreferences | PUT /notifications/preferences | invalidates preferences |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /settings | SettingsView.tsx | NotificationsSettings (tab) |

## Migrations
- 024 (add_notifications): smtp_config, webhook_config, notification_preference tables

## Known Issues / Gotchas
- Webhook delivery uses HMAC-SHA256 signature in X-Signature header
- NotificationDispatcher uses fire-and-forget pattern (does not block SPC pipeline)
- SMTP test sends to the configured from_address
