# Sprint 3/8: SSO Hardening + PWA-Lite + ERP/LIMS — Verification Checklist

**Status**: Complete (implementation + skeptic review)
**Features**: WS-A SSO/OIDC Hardening, WS-B PWA-Lite (Push + Offline + Mobile), WS-C ERP/LIMS Connectors

---

## Setup

```bash
# 1. Seed the database
cd backend
python scripts/seed_test_sprint8.py

# 2. Start the backend
python -m openspc

# 3. Start the frontend (separate terminal)
cd frontend
npm run dev

# 4. Login
#    Admin: admin / password
#    Engineer: engineer / password
#    Operator: operator / password
```

**Expected seed output:**
- 3 plants (ERP, LIMS, MOB)
- ~880 samples, ~2,100 measurements
- 2 ERP connectors (SAP OData on D1, Generic Webhook on D2)
- 4 field mappings, 1 sync schedule, 1 sync log
- 3 users: admin, engineer, operator

## Prerequisites

1. Seed script run successfully (see above)
2. Backend starts without errors
3. Frontend compiles with zero TypeScript errors
4. Verify ~299 routes registered in backend startup log

**Optional VAPID setup** (for push notifications):
```bash
# Generate VAPID key pair (one-time)
pip install pywebpush
python -c "from pywebpush import webpush; from py_vapid import Vapid; v = Vapid(); v.generate_keys(); print('Private:', v.private_pem()); print('Public:', v.public_key)"

# Set env vars before starting backend
export OPENSPC_VAPID_PRIVATE_KEY="<base64 private key>"
export OPENSPC_VAPID_PUBLIC_KEY="<base64 public key>"
export OPENSPC_VAPID_CONTACT_EMAIL="admin@openspc.local"
```

**Optional OIDC setup** (for SSO testing — requires an IdP):
- Keycloak Docker: `docker run -p 8180:8080 -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev`
- Or Azure AD / Auth0 dev tenant

---

## Migration Verification

- [ ] `alembic upgrade head` succeeds on SQLite (no errors)
- [ ] Migration 036: `oidc_state`, `oidc_account_link` tables created
- [ ] Migration 036: `oidc_config` has new columns: `claim_mapping`, `end_session_endpoint`, `post_logout_redirect_uri`
- [ ] Migration 037: `push_subscription` table created
- [ ] Migration 038: `erp_connector`, `erp_field_mapping`, `erp_sync_schedule`, `erp_sync_log` tables created
- [ ] Migration chain: `alembic current` shows single head (revision 038)
- [ ] **PostgreSQL** (if available): Run `alembic upgrade head` on a fresh PG database — no dialect errors

---

## WS-A: SSO/OIDC Hardening

**Login as**: admin

### API Endpoint Verification (via /docs Swagger UI)

- [ ] `GET /api/v1/auth/oidc/providers` — returns empty list (no providers configured yet)
- [ ] `POST /api/v1/auth/oidc/config` — create a test OIDC provider config with:
  ```json
  {
    "name": "Test IdP",
    "issuer_url": "https://example.com",
    "client_id": "test-client",
    "client_secret": "test-secret",
    "scopes": ["openid", "email", "profile"],
    "role_mapping": {"admins": {"*": "admin"}, "engineers": {"1": "engineer"}},
    "auto_provision": true,
    "default_role": "operator",
    "claim_mapping": {"email": "mail", "groups": "memberOf"},
    "end_session_endpoint": "https://example.com/logout",
    "post_logout_redirect_uri": "http://localhost:5173/login"
  }
  ```
- [ ] Response includes `claim_mapping`, `end_session_endpoint`, `post_logout_redirect_uri`
- [ ] Client secret is masked in response (`****` prefix)
- [ ] `GET /api/v1/auth/oidc/config` — lists the created provider
- [ ] `PUT /api/v1/auth/oidc/config/{id}` — update claim_mapping, verify it persists
- [ ] `DELETE /api/v1/auth/oidc/config/{id}` — 204 No Content

### SSO Settings UI

- [ ] Navigate to Settings → SSO (/settings/sso)
- [ ] "Add Provider" opens config modal (wider layout, 2-column fields)
- [ ] **Claim Mapping** section visible — 5 standard claim rows (email, groups, roles, name, preferred_username)
- [ ] Entering "mail" for email claim and saving — included in payload
- [ ] Leaving a claim mapping empty — excluded from payload (not sent as null)
- [ ] **Role Mapping** JSON textarea accepts both flat and plant-scoped format
- [ ] Help text documents both formats: `{"group": "role"}` and `{"group": {"plant_id": "role"}}`
- [ ] **Logout Configuration** section — end_session_endpoint and post_logout_redirect_uri fields

### Account Linking

- [ ] `GET /api/v1/auth/oidc/links` — returns empty list for current user
- [ ] `DELETE /api/v1/auth/oidc/links/999` — returns 404 (link not found)
- [ ] AccountLinkingPanel renders in user settings (if integrated)

### Security Hardening (Skeptic Fixes)

- [ ] `GET /api/v1/auth/oidc/authorize/999?redirect_uri=http://localhost` — 404 with generic message "Provider not found or inactive" (NOT leaking provider ID)
- [ ] OIDC callback errors return "OIDC authentication failed" (NOT internal details)
- [ ] State tokens expire after 10 minutes (configure a provider, generate auth URL, wait >10min, try callback — should fail)

### OIDC Logout

- [ ] `GET /api/v1/auth/oidc/logout/{provider_id}` — returns logout URL if configured
- [ ] `POST /api/v1/auth/logout?oidc_provider_id={id}` — returns `oidc_logout_url` in response

### Full SSO Flow (requires live IdP)

- [ ] Login page shows SSO buttons for active providers
- [ ] Click SSO button → redirects to IdP
- [ ] After IdP auth → callback processes, JWT issued, user logged in
- [ ] Account link created (check `oidc_account_link` table)
- [ ] Logout redirects to IdP end_session_endpoint (if configured)
- [ ] Second SSO login uses account link for fast lookup (check logs)

---

## WS-B: PWA-Lite

### Push Notifications — Backend

- [ ] `GET /api/v1/push/vapid-key` — returns public key (or 503 if VAPID not configured)
- [ ] `POST /api/v1/push/subscribe` with valid push endpoint — 201 Created
- [ ] `POST /api/v1/push/subscribe` with `endpoint: "http://evil.com/steal"` — 422 error "Push endpoint must use HTTPS"
- [ ] `POST /api/v1/push/subscribe` with `endpoint: "https://evil.com/steal"` — 422 error "Push endpoint must be a recognized push service" (**SSRF prevention**)
- [ ] `POST /api/v1/push/subscribe` with `endpoint: "https://fcm.googleapis.com/fcm/send/xxx"` — 201 (allowed origin)
- [ ] `GET /api/v1/push/subscriptions` — lists subscriptions for current user
- [ ] `DELETE /api/v1/push/unsubscribe` — removes subscription

### Push Notifications — Frontend UI

- [ ] Navigate to Settings → Notifications (/settings/notifications)
- [ ] **Push Notifications** section visible at top of page
- [ ] If browser doesn't support Push API — warning banner shown
- [ ] If VAPID not configured on server — graceful message
- [ ] Enable toggle → browser permission prompt appears
- [ ] After granting permission → status shows "Subscribed" with green indicator
- [ ] "Send Test Notification" button visible when subscribed
- [ ] Click test → browser notification appears
- [ ] Disable toggle → unsubscribes

### Push Notifications — Live Event (requires VAPID configured)

- [ ] Subscribe to push in browser
- [ ] In another tab, submit a measurement that triggers a violation
- [ ] Push notification appears in browser: "SPC Violation Detected"
- [ ] Click notification → navigates to violations page

### Offline Queue

- [ ] Open browser DevTools → Application → IndexedDB
- [ ] Database `openspc-offline` exists with `mutations` store
- [ ] Go offline (DevTools → Network → Offline)
- [ ] Submit a measurement on Data Entry page
- [ ] Measurement queued — toast notification or UI indicator
- [ ] Layout footer shows "N pending" badge (amber text)
- [ ] Go back online
- [ ] Queue auto-flushes — console logs "Flushed N queued mutations"
- [ ] Footer badge disappears (count goes to 0)
- [ ] **Stale item handling**: Queue items older than 24h are discarded on flush
- [ ] **Queue limit**: Queue caps at 1000 items (oldest evicted when full)

### Mobile Navigation

- [ ] Resize browser to mobile width (< 768px, or use Chrome DevTools responsive mode)
- [ ] Bottom navigation bar appears with 4 tabs: Dashboard, Data Entry, Violations, More
- [ ] Tabs navigate correctly to respective routes
- [ ] Active tab highlighted
- [ ] Bottom nav hidden on desktop (md: and above)
- [ ] Content area has bottom padding (not hidden behind nav)

### Mobile Responsive Polish

- [ ] **Violations page** (mobile): Card-based layout instead of table
  - Each card shows: rule name, severity badge (color-coded), characteristic, timestamp
  - Acknowledge button visible on actionable cards
- [ ] **Dashboard** (mobile): Charts still render and are scrollable
- [ ] **Safe area**: On iPhone simulator or notch device — bottom nav respects safe area inset

### PWA Installation

- [ ] Open Chrome → address bar shows install icon (or Menu → Install OpenSPC)
- [ ] Install → standalone app window opens
- [ ] App manifest correct: name "OpenSPC", theme color, icons
- [ ] `apple-mobile-web-app-capable` meta tag present in source (View Source → search)

---

## WS-C: ERP/LIMS Connectors

**Login as**: admin

### Connectivity Hub Integration

**Plant**: Switch to "D1: ERP Integration" (ERP)

- [ ] Navigate to Connectivity (/connectivity)
- [ ] Sidebar shows "Integrations" group with "ERP/LIMS" tab
- [ ] Click ERP/LIMS tab → IntegrationsTab renders
- [ ] Seeded connector "SAP Quality Notifications" appears in list
- [ ] Connector card shows: type=sap_odata, status "disconnected" (gray dot)

**Plant**: Switch to "D2: LIMS Lab Data" (LIMS)
- [ ] "LIMS Results Webhook" connector appears

### Connector CRUD

- [ ] Click "Add Connector" → ConnectorWizard modal opens
- [ ] **Step 0**: 4 connector types available (SAP OData, Oracle REST, Generic LIMS, Generic Webhook)
- [ ] Select "Generic Webhook" → proceed
- [ ] **Step 1**: Fill name, base URL (e.g., `https://erp.example.com`), auth type "API Key"
  - Auth-specific fields appear (API key header name, API key value)
- [ ] **Step 2**: Review summary — all fields displayed
- [ ] Confirm → connector created, card appears in list
- [ ] Connector card shows: type icon, status "disconnected" (gray dot), base URL
- [ ] Click connector card actions → expand/collapse detail panels

### Connector Types

- [ ] Create one of each type: SAP OData, Oracle REST, Generic LIMS, Generic Webhook
- [ ] Each card shows appropriate type icon
- [ ] Delete a connector → removed from list, 204 response

### Test Connection

- [ ] Click "Test" on a connector → "Connection test failed" message (expected for fake URLs)
- [ ] Response does NOT leak raw exception details (just "Check server logs for details")
- [ ] Connector status changes to "error" (red dot)

### Field Mappings

- [ ] Open FieldMappingEditor for SAP connector → shows 3 pre-seeded mappings (2 inbound, 1 outbound)
- [ ] Direction badges are color-coded (inbound vs outbound)
- [ ] Add a mapping: name="Part ID", direction="inbound", ERP entity="Parts", ERP field path="$.partId", OpenSPC entity="characteristic", OpenSPC field="name"
- [ ] Mapping appears in table with color-coded direction badge
- [ ] Delete mapping → removed

### Sync Schedule

- [ ] Open SyncScheduleConfig for SAP connector → shows pre-seeded inbound schedule (*/15 * * * *)
- [ ] Select preset "Every 15 minutes" → cron expression populated
- [ ] Direction: "inbound"
- [ ] Save → schedule created
- [ ] Custom cron: enter `0 6 * * *` (daily at 6 AM) → saves successfully
- [ ] Invalid cron: enter `invalid` → 422 error with validation message

### Sync Logs

- [ ] Open SyncLogViewer for SAP connector → shows 1 pre-seeded failed log entry
- [ ] Trigger manual sync → log entry appears (likely "failed" with fake URL)
- [ ] Log shows: status badge, direction, records processed/failed, start time
- [ ] Click expand arrow → error details visible
- [ ] Pagination works (prev/next buttons)

### Manual Sync

- [ ] Click "Sync" on active connector → sync triggers
- [ ] Response: status and record counts (likely 0/failed for fake URLs)
- [ ] Error message is generic "Sync operation failed" (NOT raw exception)

### Webhook Endpoint

- [ ] Create a Generic Webhook connector with HMAC secret in auth_config
- [ ] WebhookConfig panel shows: webhook URL, HMAC documentation, curl example
- [ ] Copy webhook URL → test with curl:
  ```bash
  # Generate HMAC signature
  PAYLOAD='{"partId": "PN-001", "measurement": 25.01}'
  SECRET="your-hmac-secret"
  SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

  curl -X POST http://localhost:8000/api/v1/erp/connectors/{id}/webhook \
    -H "Content-Type: application/json" \
    -H "X-Hub-Signature-256: sha256=$SIG" \
    -d "$PAYLOAD"
  ```
- [ ] Valid HMAC → 200 response with `{"status": "accepted", "entities_mapped": [...], "records": N}`
- [ ] Invalid HMAC → 401 "Invalid HMAC signature"
- [ ] Missing HMAC header → 401 "Missing X-Hub-Signature-256 header"
- [ ] Connector without HMAC secret → 403 "Webhook HMAC secret not configured" (**skeptic fix**)

### Security (Skeptic Fixes)

- [ ] `POST /api/v1/erp/connectors/{id}/test` failure → generic message (no raw exception)
- [ ] `POST /api/v1/erp/connectors/{id}/sync` failure → generic message (no raw exception)
- [ ] Webhook without HMAC secret → 403 (not silently accepted)
- [ ] `auth_config` field NOT present in any API response (Fernet-encrypted, server-only)
- [ ] Connector delete cascades: mappings, schedules, and logs all removed

### ERP API Authorization

- [ ] As `operator` user: `GET /api/v1/erp/connectors?plant_id=1` → 403 (requires engineer+)
- [ ] As `engineer` user: `GET /api/v1/erp/connectors?plant_id=1` → 200 (read access)
- [ ] As `engineer` user: `POST /api/v1/erp/connectors` → 403 (requires admin)
- [ ] As `admin` user: `POST /api/v1/erp/connectors` → 201 (write access)

---

## Quick Smoke Test

Run through these items for a fast confidence check (5 minutes):

1. [ ] Seed database and start backend — no startup errors
2. [ ] Backend starts with ~299 routes — no import errors
3. [ ] Frontend compiles with zero TypeScript errors
4. [ ] Settings → SSO: "Add Provider" modal opens with claim mapping and logout fields
5. [ ] Settings → Notifications: Push section visible with enable/disable toggle
6. [ ] Connectivity → ERP/LIMS tab: seeded SAP connector visible, "Add Connector" wizard works
7. [ ] Webhook HMAC: valid signature → accepted, invalid → 401, missing → 401, no secret → 403
8. [ ] Mobile viewport: bottom nav bar visible, violations show card layout
9. [ ] Push subscribe with non-HTTPS or non-push-service URL → 422 (SSRF blocked)
10. [ ] OIDC authorize with invalid provider → generic "not found" error (no ID leak)
11. [ ] Login as operator → no access to ERP/SSO admin features (403)

---

## Seed Data Cross-Check

| Plant | Code | Chars | Samples | Special |
|-------|------|-------|---------|---------|
| D1: ERP Integration | ERP | 6 (Shaft OD/Length, Bore/Depth, Tooth/Runout) | 360 (n=5) | 1 SAP OData connector, 3 field mappings, 1 schedule, 1 log |
| D2: LIMS Lab Data | LIMS | 5 (pH, Moisture, Absorbance, TPC, Endotoxin) | 400 (n=1) | 1 Generic Webhook connector, 1 field mapping |
| D3: Mobile Entry | MOB | 4 (Thickness, Hardness, Weld, Paint) | 120 (n=1 or 3) | Mobile data entry scenarios |

---

## Known Limitations

- **OIDC full flow** requires a live IdP (Keycloak/Azure AD) — cannot be fully tested with mock data
- **Push notifications** require VAPID keys and a browser that supports Web Push (Chrome, Firefox, Edge)
- **ERP adapters** (SAP, Oracle, LIMS) require real ERP endpoints for integration testing — test_connection will fail with fake URLs
- **Offline queue** requires manual network toggling (DevTools → Network → Offline)
- **PWA install** requires HTTPS in production; localhost works in Chrome dev mode
- **Apple push** (Safari) has limited Web Push support — test primarily in Chrome/Firefox
