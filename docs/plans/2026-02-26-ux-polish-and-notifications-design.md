# UX Polish, Notification Fixes & Account Management

**Date**: 2026-02-26
**Scope**: Toast fix, notification system bugs + severity filtering, settings restructure, forgot password, account management

---

## 1. Toast Close Button Fix

**Problem**: Sonner's default `closeButton` renders the X outside the toast at rest, shifts inside on hover.

**Solution**: CSS overrides in `index.css` using `[data-sonner-toast] [data-close-button]` selectors to pin the close button inside the toast (top-right, fixed position). No component changes.

**Files**: `frontend/src/index.css`

---

## 2. Notification System Fixes

### 2a. Attribute Engine Event Bus Gap (BLOCKER)

`attribute_engine.py`'s `process_attribute_sample()` creates violations but never publishes `ViolationCreatedEvent`. This means p/np/c/u chart violations produce zero notifications, zero push alerts, zero MQTT outbound.

**Fix**: Publish `ViolationCreatedEvent` after violation creation, matching the pattern in `spc_engine.py` lines 629-638.

**Files**: `backend/src/cassini/core/engine/attribute_engine.py`

### 2b. Missing Frontend Event Types

`NotificationsSettings.tsx` `EVENT_TYPES` array only exposes 2 of 5 backend event types. Missing: `anomaly_detected`, `signature_created`, `workflow_completed`.

**Fix**: Add the 3 missing event types to the frontend array with appropriate labels/descriptions.

**Also fix**: SMTP config GET endpoint returns encrypted blob for username instead of masked value. Decrypt or mask in `notifications.py` GET handler.

**Files**: `frontend/src/components/NotificationsSettings.tsx` (moving to `NotificationPreferences.tsx`), `backend/src/cassini/api/v1/notifications.py`

### 2c. Severity-Based Notification Filtering

**Goal**: Let users filter violation notifications by severity to avoid alert fatigue.

**Severity mapping**:
- Critical: Rule 1 (beyond control limits)
- Warning: Rules 2-4 (runs, trends, alternating)
- Info: Rules 5-8 (zone-based patterns)

**Backend**:
- Add `severity_filter` column to `notification_preference` table (String, values: `all`, `critical_and_warning`, `critical_only`, default `all`). Part of migration 039.
- `NotificationDispatcher._on_violation_created()`: Look up the violated rule's severity, check against user's `severity_filter` before dispatching.
- Map rule numbers to severity in a constant dict.

**Frontend**: Dropdown next to "Violation Detected" row in preferences: "All violations" / "Critical + Warning" / "Critical only".

**Files**: `backend/src/cassini/core/notifications.py`, `backend/src/cassini/api/schemas/notification.py`, `backend/src/cassini/db/models/notification.py`, `NotificationPreferences.tsx`

### 2d. Push Notification Preference Gating

`PushNotificationService` sends to all subscribers, ignoring `NotificationPreference`. Fix: check user preferences before sending push, consistent with email/webhook behavior.

**Files**: `backend/src/cassini/core/push_service.py`

---

## 3. Settings Restructure — SMTP & Webhook Move

**Current**: Personal > Notifications has everything (preferences + SMTP + webhooks).

**New layout**:
- **Personal > Notifications** — Push toggle, event/channel preference matrix with severity filter
- **Organization > Email & Webhooks** (admin-only, `Mail` icon) — SMTP config, webhook endpoint management

**Implementation**:
- Split `NotificationsSettings.tsx` into:
  - `NotificationPreferences.tsx` — personal preferences (stays at Personal > Notifications route)
  - `EmailWebhookSettings.tsx` — SMTP + webhooks (new route: Organization > Email & Webhooks)
- Add sidebar entry in `SettingsView.tsx`: `{ to: 'email-webhooks', labelKey: 'tabs.emailWebhooks', icon: Mail, minRole: 'admin' }` in the Organization group
- Add route in `App.tsx` for the new settings page
- Add i18n keys

**Files**: `frontend/src/components/NotificationsSettings.tsx` (split), `frontend/src/components/EmailWebhookSettings.tsx` (new), `frontend/src/pages/SettingsView.tsx`, `frontend/src/App.tsx`

---

## 4. Forgot Password

**Flow**:
1. User clicks "Forgot Password?" on login page → navigates to `/forgot-password`
2. Enter username or email → `POST /auth/forgot-password`
3. Backend: look up user, generate cryptographically random token, store SHA-256 hash in `password_reset_token` table with 1-hour expiry
4. Send reset link via SMTP (if configured). Always return success (prevent user enumeration).
5. User clicks link → `/reset-password?token=...` → enter new password + confirm
6. `POST /auth/reset-password` — validate token hash, update password, consume token, invalidate all refresh tokens
7. If SMTP not configured: forgot-password page shows "Contact your administrator" instead of the form

**Backend**:

Migration 039 — `password_reset_token` table:
- `id` (Integer, PK)
- `user_id` (Integer, FK → user.id, CASCADE)
- `token_hash` (String(64), indexed) — SHA-256 of the raw token
- `expires_at` (DateTime, UTC)
- `used_at` (DateTime, nullable) — set when consumed
- `created_at` (DateTime, UTC, default now)

Endpoints (public, no auth):
- `POST /auth/forgot-password` — body: `{ identifier: string }` (username or email). Rate limit: 3/hour per identifier.
- `POST /auth/reset-password` — body: `{ token: string, new_password: string }`

**Frontend**:
- `ForgotPasswordPage.tsx` — username/email input, success message regardless of whether user exists
- `ResetPasswordPage.tsx` — new password + confirm form, token from URL query param
- Wire up dead link on `LoginPage.tsx` to navigate to `/forgot-password`
- Routes: `/forgot-password`, `/reset-password`

**Files**: New migration, `backend/src/cassini/api/v1/auth.py`, `backend/src/cassini/db/models/user.py` (or new model file), `frontend/src/pages/ForgotPasswordPage.tsx`, `frontend/src/pages/ResetPasswordPage.tsx`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/App.tsx`

---

## 5. Account Management Page

**New page**: Personal > Account (first item in Personal settings group, `User` icon)

### Profile Section
- **Display name**: Editable text field, save button
- **Username**: Read-only, grayed out, with "(set by administrator)" label
- **Email**: Editable with verification flow (see below)
- **Role**: Read-only badge showing current role and plant assignment

### Password Section
- Current password + new password + confirm password
- Validation: min 8 chars, must differ from current, passwords match
- Reuses existing `POST /auth/change-password` endpoint

### Email Verification Flow
- User enters new email → `POST /auth/update-profile` (with `pending_email` field)
- Backend sends verification link to new address (reuses password reset token pattern)
- `email_verification_token` table (same structure as `password_reset_token`)
- Until verified, old email stays active. Show "Pending verification: new@email.com" badge.
- `GET /auth/verify-email?token=...` — validates token, updates `user.email`, clears pending

**Backend**:

Migration 039 (combined) — `email_verification_token` table:
- Same structure as `password_reset_token`
- `new_email` (String(255)) — the email to switch to

Endpoints:
- `POST /auth/update-profile` (authenticated) — body: `{ display_name?: string, email?: string }`
- `GET /auth/verify-email?token=...` (public) — verifies and updates email

**Frontend**:
- `AccountSettings.tsx` — profile form + password change form
- Add sidebar entry in `SettingsView.tsx`: `{ to: 'account', labelKey: 'tabs.account', icon: User }` as first item in Personal group
- Route in `App.tsx`

**Files**: New migration tables, `backend/src/cassini/api/v1/auth.py`, `frontend/src/components/AccountSettings.tsx` (new), `frontend/src/pages/SettingsView.tsx`, `frontend/src/App.tsx`

---

## 6. Audit Trail Coverage

### Middleware-Covered (automatic, no extra work)
- Notification preference changes (authenticated POST/PUT)
- SMTP/webhook config changes (authenticated POST/PUT/DELETE)
- Display name update via `POST /auth/update-profile` (authenticated)
- Email change request via `POST /auth/update-profile` (authenticated)
- Voluntary password change via `POST /auth/change-password` (authenticated)

### Explicit `audit_service.log()` Required (unauthenticated endpoints)

| Endpoint | Action | Details |
|----------|--------|---------|
| `POST /auth/forgot-password` | `password_reset_requested` | Log user_id (if found), identifier used. Do NOT log if user not found (prevents enumeration in audit log). |
| `POST /auth/reset-password` | `password_reset_completed` | Log user_id from token. Critical security event. |
| `GET /auth/verify-email` | `email_verified` | Log user_id, old email, new email in metadata. |

### Audit Wiring
- `_RESOURCE_PATTERNS` in `core/audit.py`: regex for `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/update-profile`
- `_method_to_action()` keywords: "forgot" → "requested", "reset" → "reset", "verify" → "verified", "update-profile" → "updated"
- `RESOURCE_LABELS` in `AuditLogViewer.tsx`: "Password Reset", "Email Verification", "Profile"
- `ACTION_LABELS` in `AuditLogViewer.tsx`: "Password Reset Requested", "Password Reset", "Email Verified", "Profile Updated"

---

## Migration 039 (Combined)

Single migration covering:
1. `severity_filter` column on `notification_preference` (String, default 'all')
2. `password_reset_token` table
3. `email_verification_token` table
4. `pending_email` column on `user` (String, nullable)

---

## Summary of New/Modified Files

### Backend (new)
- `alembic/versions/039_*.py` — migration

### Backend (modified)
- `core/engine/attribute_engine.py` — publish ViolationCreatedEvent
- `core/notifications.py` — severity filtering in dispatcher
- `core/push_service.py` — preference gating
- `api/v1/auth.py` — forgot-password, reset-password, verify-email, update-profile endpoints
- `api/v1/notifications.py` — fix SMTP username encrypted blob
- `api/schemas/notification.py` — severity_filter field
- `api/schemas/auth.py` — new request/response schemas
- `db/models/notification.py` — severity_filter column
- `db/models/user.py` — pending_email column, token models
- `core/audit.py` — resource patterns, action keywords

### Frontend (new)
- `components/AccountSettings.tsx`
- `components/EmailWebhookSettings.tsx`
- `components/NotificationPreferences.tsx` (extracted from NotificationsSettings)
- `pages/ForgotPasswordPage.tsx`
- `pages/ResetPasswordPage.tsx`

### Frontend (modified)
- `index.css` — toast close button fix
- `pages/LoginPage.tsx` — wire forgot password link
- `pages/SettingsView.tsx` — new sidebar entries
- `App.tsx` — new routes
- `components/AuditLogViewer.tsx` — new resource/action labels
- `api/auth.api.ts` — new endpoints
- `api/hooks/useAuth.ts` — new hooks (or new file)
- i18n translation files
