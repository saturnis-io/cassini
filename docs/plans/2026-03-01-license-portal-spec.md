# Cassini License Portal — Application Specification

**Date:** 2026-03-01
**Author:** Saturnis LLC
**Status:** Draft
**Purpose:** Complete specification for building a self-service licensing portal for the Cassini SPC platform. This document is designed to be used as a standalone prompt to build the entire application.

---

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Architecture](#2-architecture)
3. [Data Model](#3-data-model)
4. [License Key Format and Cryptography](#4-license-key-format-and-cryptography)
5. [User Flows](#5-user-flows)
6. [Portal Pages](#6-portal-pages)
7. [API Endpoints](#7-api-endpoints)
8. [Stripe Integration](#8-stripe-integration)
9. [Email System](#9-email-system)
10. [Security](#10-security)
11. [Admin Panel](#11-admin-panel)
12. [Deployment and Infrastructure](#12-deployment-and-infrastructure)
13. [Environment Variables](#13-environment-variables)
14. [UI/UX Guidelines](#14-uiux-guidelines)
15. [Testing Strategy](#15-testing-strategy)
16. [Future Considerations (v2)](#16-future-considerations-v2)

---

## 1. Overview and Goals

### What Is This?

A self-service web portal at `portal.saturnis.io` where customers can purchase, manage, and renew license keys for the Cassini SPC platform. Cassini is an open-source (AGPL-3.0) statistical process control platform for manufacturing quality engineering. The Community Edition is free. Commercial tiers unlock multi-plant, compliance, connectivity, and analytics features.

### Product Context

Cassini uses a single-codebase, single-artifact open-core model. The presence of a `license.key` file is the only difference between Community and Commercial editions. License keys are Ed25519-signed JWTs validated entirely offline — no call-home, no license server, no internet required. This is critical because manufacturing plants frequently operate in air-gapped or restricted-network environments.

### Commercial Tiers

| | Community | Professional | Enterprise | Enterprise Plus |
|---|---|---|---|---|
| **Price** | Free (AGPL-3.0) | $500/mo ($5,000/yr) | $2,500/mo ($25,000/yr) | Custom ($50K-$150K/yr) |
| **Plants** | 1 | Up to 5 | Unlimited | Unlimited |
| **Code** | Community features only | All commercial features | All commercial features | All commercial features |
| **Support** | GitHub Issues | 48hr email response | 24hr + named account manager | Dedicated Slack/Teams channel |
| **Extras** | -- | -- | Validation doc package (IQ/OQ) | Custom integration engineering, training, compliance gap analysis |

All commercial tiers unlock identical code. The `tier` field in the license key is used for support routing, UI badging, plant limits, and portal display -- not code gating. The only code-enforced commercial lever is `max_plants`.

### Community Edition (Free) Includes

All 11+ chart types, all 8 Nelson rules, basic Cp/Cpk/Pp/Ppk/Cpm, MQTT + SparkplugB, manual entry + CSV/Excel import, single plant, JWT + RBAC, WebSocket updates, full REST API, Docker deployment, Show Your Work computation transparency.

### Commercial Edition Adds

Multi-plant, SSO/OIDC, electronic signatures (21 CFR Part 11), audit trail, retention policies, SMTP/webhook/push notifications, OPC-UA, RS-232/USB gage bridge, ERP/LIMS connectors, non-normal distributions, custom run rules, Laney p'/u', short-run charts, MSA/Gage R&R, FAI (AS9102), AI/ML anomaly detection, DOE, multivariate SPC, predictive analytics, scheduled reports.

### Goals

1. **Minimize sales friction for Professional tier** — fully self-serve signup to license key in under 5 minutes
2. **Enterprise starts self-serve, escalates to sales** — customers can explore, trial, and start checkout; complex needs route to human sales
3. **Enterprise Plus is sales-led** — discovery and intake begins on the portal, closes through human interaction
4. **Trial licenses** — Professional gets 14-day auto-trial; Enterprise gets 30-day manually issued evaluation
5. **Zero-downtime renewals** — auto-renewal via Stripe subscriptions, graceful degradation on expiry (read-only, never data loss)
6. **Internal tooling** — admin panel for Saturnis staff to manage licenses, issue manual keys (Enterprise Plus deals), view metrics

### Non-Goals (Out of Scope for v1)

- Usage telemetry or analytics collection from Cassini deployments
- License compliance checking endpoint (optional call-home)
- Partner/reseller portal
- API key authentication for CI/CD license provisioning
- Self-hosted license server for air-gapped environments
- Annual billing option (use monthly only in v1)
- Marketing website (saturnis.io) — this spec covers only the portal application

---

## 2. Architecture

### Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 14+ (App Router) | SSR for public pages (SEO), API routes for backend logic, single deployment |
| **Hosting** | Vercel | Zero-config Next.js deployment, edge functions, preview deployments |
| **Auth** | Clerk | Managed auth with email + Google + GitHub SSO, organization support, webhooks |
| **Payments** | Stripe | Checkout, Billing Portal, subscriptions, webhooks, invoicing |
| **Database** | PostgreSQL via Supabase | Managed Postgres, Row Level Security, realtime subscriptions, auto-backups |
| **ORM** | Drizzle ORM | Type-safe SQL, zero-overhead, migrations, Supabase compatible |
| **License Signing** | Ed25519 via `@noble/ed25519` | Pure JS, no native deps, deterministic signatures, fast |
| **Email** | Resend | Developer-first transactional email, React Email templates, good deliverability |
| **Styling** | Tailwind CSS v4 + shadcn/ui | Consistent with Cassini's frontend conventions, rapid UI development |
| **Validation** | Zod | Runtime validation for API inputs, consistent with Cassini patterns |

### System Diagram

```
                    +------------------+
                    |   saturnis.io    |
                    |  (marketing site)|
                    +--------+---------+
                             |
                             | "Get Started" / "Pricing" links
                             v
+-------------------------------------------------------------------+
|                   portal.saturnis.io (Next.js on Vercel)          |
|                                                                    |
|  +------------+  +-------------+  +------------+  +-------------+ |
|  |  Public     |  | Authenticated|  |   Admin    |  |   API       | |
|  |  Pages      |  | Dashboard   |  |   Panel    |  |   Routes    | |
|  | - Pricing   |  | - Licenses  |  | - All orgs |  | - /api/*    | |
|  | - Login     |  | - Billing   |  | - Metrics  |  | - webhooks  | |
|  | - Signup    |  | - Team      |  | - Generate |  |             | |
|  +------+------+  +------+------+  +-----+------+  +------+------+ |
|         |                |               |                |        |
+-------------------------------------------------------------------+
          |                |               |                |
          v                v               v                v
   +------+------+  +-----+------+  +-----+------+  +-----+------+
   |    Clerk    |  |  Supabase  |  |   Stripe   |  |   Resend   |
   |   (Auth)    |  | (Postgres) |  | (Payments) |  |  (Email)   |
   +-------------+  +------------+  +------------+  +------------+
```

### Request Flow

1. User requests hit Vercel edge network
2. Clerk middleware checks authentication on protected routes
3. API routes query Supabase via Drizzle ORM
4. Stripe webhooks hit `/api/webhooks/stripe` for payment events
5. Clerk webhooks hit `/api/webhooks/clerk` for user/org lifecycle events
6. License generation happens server-side in API routes using the Ed25519 private key from env
7. Emails sent via Resend when license events occur

---

## 3. Data Model

### Entity Relationship

```
organizations 1--* users
organizations 1--* licenses
organizations 1--* support_tickets
licenses      1--* license_events
users         1--* support_tickets (created_by)
```

### Tables

#### `organizations`

The billing entity. Maps 1:1 to a Stripe customer and a Clerk organization.

```sql
CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  billing_email     TEXT NOT NULL,
  clerk_org_id      TEXT UNIQUE NOT NULL,        -- Clerk organization ID
  stripe_customer_id TEXT UNIQUE,                 -- Stripe customer ID (set after first checkout)
  industry          TEXT,                          -- e.g., "automotive", "aerospace", "medical devices"
  company_size      TEXT,                          -- e.g., "1-50", "51-200", "201-1000", "1000+"
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_clerk ON organizations(clerk_org_id);
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id);
```

#### `users`

Portal users. Synced from Clerk via webhooks.

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  clerk_user_id     TEXT UNIQUE NOT NULL,         -- Clerk user ID
  email             TEXT NOT NULL,
  name              TEXT,
  role              TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_staff          BOOLEAN NOT NULL DEFAULT FALSE, -- Saturnis internal staff (admin panel access)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(org_id);
CREATE INDEX idx_users_clerk ON users(clerk_user_id);
CREATE INDEX idx_users_email ON users(email);
```

#### `licenses`

The core entity. One organization can have multiple licenses (e.g., one per deployment environment, or separate licenses for separate facilities).

```sql
CREATE TABLE licenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  tier                  TEXT NOT NULL CHECK (tier IN ('professional', 'enterprise', 'enterprise_plus')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trial', 'expired', 'revoked', 'payment_failed')),
  stripe_subscription_id TEXT UNIQUE,              -- NULL for manually issued (Enterprise Plus)
  plant_limit           INTEGER NOT NULL DEFAULT 5, -- -1 for unlimited
  features              JSONB NOT NULL DEFAULT '[]', -- Feature list for display purposes
  customer_name         TEXT NOT NULL,              -- Baked into the JWT (company name)
  customer_email        TEXT NOT NULL,              -- Baked into the JWT (contact email)
  license_id_short      TEXT UNIQUE NOT NULL,       -- Short unique ID baked into JWT (e.g., "lic_abc123")
  key_hash              TEXT,                        -- SHA-256 hash of current JWT (for revocation checking)
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  trial_ends_at         TIMESTAMPTZ,                -- Non-null if this started as a trial
  grace_period_ends_at  TIMESTAMPTZ,                -- Non-null if in payment failure grace period
  notes                 TEXT,                        -- Internal notes (admin use)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_licenses_org ON licenses(org_id);
CREATE INDEX idx_licenses_status ON licenses(status);
CREATE INDEX idx_licenses_stripe ON licenses(stripe_subscription_id);
CREATE INDEX idx_licenses_expires ON licenses(expires_at);
CREATE INDEX idx_licenses_short_id ON licenses(license_id_short);
```

#### `license_events`

Immutable audit log of all license lifecycle events.

```sql
CREATE TABLE license_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
    'issued', 'renewed', 'rotated', 'revoked', 'expired',
    'upgraded', 'downgraded', 'trial_started', 'trial_converted',
    'payment_failed', 'payment_recovered', 'grace_period_started',
    'grace_period_expired', 'manually_extended'
  )),
  actor_id        UUID REFERENCES users(id),      -- NULL for system events
  actor_email     TEXT,                             -- Denormalized for audit readability
  metadata        JSONB DEFAULT '{}',               -- Event-specific data
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_license_events_license ON license_events(license_id);
CREATE INDEX idx_license_events_type ON license_events(event_type);
CREATE INDEX idx_license_events_created ON license_events(created_at);
```

#### `support_tickets`

Lightweight ticket system for Enterprise Plus inquiries and general support.

```sql
CREATE TABLE support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'general' CHECK (category IN (
    'general', 'billing', 'technical', 'enterprise_inquiry', 'feature_request'
  )),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  contact_email   TEXT NOT NULL,                    -- May differ from user email
  contact_name    TEXT,
  company_name    TEXT,                              -- For unauthenticated Enterprise Plus inquiries
  plant_count     INTEGER,                           -- For Enterprise Plus sizing
  industry        TEXT,
  requirements    TEXT,                               -- Free-form requirements for Enterprise Plus
  timeline        TEXT,                               -- Desired timeline
  internal_notes  TEXT,                               -- Staff-only notes
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_org ON support_tickets(org_id);
CREATE INDEX idx_tickets_status ON support_tickets(status);
CREATE INDEX idx_tickets_category ON support_tickets(category);
CREATE INDEX idx_tickets_created ON support_tickets(created_at);
```

#### `revoked_keys`

Lookup table for revoked license key hashes. The Cassini application can optionally check this list (if it has network access) but must not require it.

```sql
CREATE TABLE revoked_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash        TEXT UNIQUE NOT NULL,             -- SHA-256 of the revoked JWT string
  license_id      UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  revoked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason          TEXT
);

CREATE INDEX idx_revoked_keys_hash ON revoked_keys(key_hash);
```

### Row Level Security

All tables must have RLS enabled via Supabase:

- `organizations`: Users can only read/update their own org (matched via `clerk_org_id`)
- `users`: Users can read members of their own org; only owners/admins can update
- `licenses`: Users can read licenses belonging to their org
- `license_events`: Users can read events for licenses belonging to their org
- `support_tickets`: Users can read/create tickets for their org
- `revoked_keys`: Read-only, public (for optional revocation checking)
- Staff users (`is_staff = true`) bypass RLS for admin operations

---

## 4. License Key Format and Cryptography

### JWT Structure

License keys are Ed25519-signed JWTs. The JWT is the license file that customers drop into their Cassini installation.

```json
{
  "iss": "saturnis.io",
  "sub": "org_abc123def456",
  "license_id": "lic_7k9m2x",
  "customer_name": "Acme Manufacturing Inc.",
  "customer_email": "quality@acme.com",
  "tier": "enterprise",
  "max_plants": -1,
  "features": [
    "signatures", "audit", "msa", "fai", "anomaly",
    "analytics", "erp", "opcua", "gage_bridge", "oidc",
    "notifications", "retention", "scheduled_reports",
    "non_normal", "custom_rules", "laney", "short_run",
    "doe", "multivariate", "predictive", "ai_analysis"
  ],
  "iat": 1709312400,
  "exp": 1740848400
}
```

### Claim Definitions

| Claim | Type | Description |
|-------|------|-------------|
| `iss` | string | Always `"saturnis.io"` |
| `sub` | string | Organization ID (matches `organizations.id` prefixed with `org_`) |
| `license_id` | string | Short unique license identifier (matches `licenses.license_id_short`) |
| `customer_name` | string | Organization name (display in Cassini UI) |
| `customer_email` | string | Primary contact email |
| `tier` | string | `"professional"`, `"enterprise"`, or `"enterprise_plus"` |
| `max_plants` | integer | Plant limit. 5 for Professional, -1 (unlimited) for Enterprise/Enterprise Plus |
| `features` | string[] | List of enabled feature slugs (for display/future granular gating) |
| `iat` | integer | Issued-at Unix timestamp |
| `exp` | integer | Expiry Unix timestamp |

### Feature Slugs by Tier

**Professional and Enterprise (all commercial features):**
```
signatures, audit, msa, fai, anomaly, analytics, erp, opcua,
gage_bridge, oidc, notifications, retention, scheduled_reports,
non_normal, custom_rules, laney, short_run, doe, multivariate,
predictive, ai_analysis
```

All commercial tiers get the full feature list. The `features` array is included for forward-compatibility (future granular gating) and for display purposes in the Cassini UI.

### Cryptographic Details

**Algorithm:** Ed25519 (EdDSA) via RFC 8032

**Key generation (one-time, done by Saturnis):**
```bash
# Generate keypair using openssl
openssl genpkey -algorithm Ed25519 -out saturnis-private.pem
openssl pkey -in saturnis-private.pem -pubout -out saturnis-public.pem
```

**Signing (portal server-side):**
```typescript
import * as ed from '@noble/ed25519'
import { base64url } from 'jose'

// Or using jose library:
import { SignJWT, importPKCS8 } from 'jose'

const privateKey = await importPKCS8(process.env.ED25519_PRIVATE_KEY!, 'EdDSA')

const jwt = await new SignJWT(claims)
  .setProtectedHeader({ alg: 'EdDSA' })
  .setIssuedAt()
  .setExpirationTime(expiresAt)
  .setIssuer('saturnis.io')
  .setSubject(`org_${orgId}`)
  .sign(privateKey)
```

**Validation (Cassini application, Python):**
```python
import jwt
from cryptography.hazmat.primitives.serialization import load_pem_public_key

# Public key bundled in Cassini source code
PUBLIC_KEY = load_pem_public_key(EMBEDDED_PUBLIC_KEY_PEM)

claims = jwt.decode(
    token,
    PUBLIC_KEY,
    algorithms=["EdDSA"],
    issuer="saturnis.io"
)
```

### Key Rotation Flow

When a customer rotates their license key:

1. New JWT is generated with the same claims but fresh `iat`
2. Old JWT's hash is added to `revoked_keys` table
3. Old JWT remains valid for a 24-hour grace period (enforced by Cassini checking `iat` against a minimum threshold, not by the portal)
4. Customer receives the new key via download + email
5. `license_events` entry created with type `rotated`

### Graceful Degradation on Expiry

When a license key expires in the Cassini application:

- Commercial features enter **read-only mode** (existing data viewable, no new configurations)
- Audit trail continues logging (compliance data must never be interrupted)
- Dashboard shows a renewal banner with portal link
- **No data loss, no lockout** — manufacturing plants run 24/7 and cannot have software failures caused by a delayed purchase order

This behavior is enforced in the Cassini application, not the portal. The portal's responsibility is to ensure timely renewal reminders and easy re-issuance.

---

## 5. User Flows

### 5.1 New Customer Signup (Professional — Self-Serve)

```
1. Customer lands on pricing page (linked from saturnis.io or portal.saturnis.io)
2. Clicks "Get Started" on Professional tier card
3. Redirected to Clerk signup (email/password or Google/GitHub SSO)
4. After auth, prompted to create organization:
   - Organization name (required)
   - Billing email (required, defaults to signup email)
   - Industry (optional dropdown)
   - Company size (optional dropdown)
5. Organization created in DB + Stripe customer created
6. Redirected to Stripe Checkout (monthly $500 subscription)
7. Stripe Checkout success:
   a. Webhook fires → portal creates license record
   b. Ed25519-signed JWT generated
   c. License key hash stored in DB
   d. License event "issued" logged
8. Redirect to dashboard with success toast
9. Dashboard shows the new license:
   - "Copy to clipboard" button for the JWT string
   - "Download license.key" button
   - Activation instructions inline
10. Email sent via Resend:
    - License key as downloadable attachment
    - Step-by-step activation instructions
    - Link back to dashboard
```

### 5.2 Trial Flow (Professional)

```
1. Customer clicks "Start Free Trial" on Professional tier
2. Signup + org creation (same as 5.1 steps 3-4)
3. No Stripe Checkout — trial license auto-generated:
   - tier: "professional"
   - status: "trial"
   - max_plants: 2 (limited during trial)
   - expires_at: 14 days from now
   - trial_ends_at: 14 days from now
4. Dashboard shows trial license with countdown
5. Reminder emails at 7 days and 1 day before trial ends
6. "Upgrade to Paid" button on dashboard → Stripe Checkout
7. On payment: license updated (status: "active", plant_limit: 5, new expiry)
8. If trial expires without payment: status → "expired", features go read-only in Cassini
```

### 5.3 Enterprise Self-Serve Start

```
1. Customer clicks "Get Started" on Enterprise tier
2. Same signup + org creation flow
3. Option A: Direct purchase → Stripe Checkout ($2,500/mo)
4. Option B: "Request 30-Day Evaluation" → creates support ticket
   - category: "enterprise_inquiry"
   - Pre-filled with org details
   - Notification sent to sales@saturnis.io
   - Sales issues 30-day evaluation license via admin panel
5. After evaluation, customer can self-serve purchase or request sales call
```

### 5.4 Enterprise Plus Flow (Sales-Led)

```
1. Customer clicks "Contact Sales" on Enterprise Plus card
2. Intake form (works with or without authentication):
   - Company name (required)
   - Contact name (required)
   - Contact email (required)
   - Industry (required)
   - Plant count (required)
   - Requirements (required, textarea)
   - Timeline (optional)
3. Creates support ticket:
   - category: "enterprise_inquiry"
   - priority: "high"
   - All form data stored
4. Email notification to sales@saturnis.io with full form data
5. Auto-reply email to customer confirming receipt
6. Sales team follows up manually (outside portal scope)
7. After deal closes: sales creates license via admin panel
   - tier: "enterprise_plus"
   - No Stripe subscription (invoiced separately)
   - Custom expiry (typically annual)
   - Notes field for deal details
```

### 5.5 License Management

```
Dashboard actions available to org owners and admins:

VIEW LICENSE
- Tier badge, status indicator, expiry date + countdown
- Feature list with checkmarks
- Plant limit display

DOWNLOAD KEY
- "Copy to Clipboard" — copies raw JWT string
- "Download license.key" — downloads as a file
- Both show activation instructions reminder

ROTATE KEY
- Confirmation dialog: "This will generate a new key. Your current key will remain valid for 24 hours."
- On confirm: new JWT generated, old hash added to revoked_keys
- New key displayed + emailed
- Event logged

UPGRADE TIER
- Professional → Enterprise: "Upgrade" button
- Creates new Stripe Checkout session for Enterprise subscription
- On success: current subscription cancelled, new license issued with enterprise params
- Downgrade not supported via self-serve (contact support)
```

### 5.6 Renewal

```
AUTOMATIC RENEWAL (default)
- Stripe handles recurring billing
- On invoice.payment_succeeded webhook:
  - License expires_at extended by billing period
  - License event "renewed" logged
  - Confirmation email sent

EXPIRY WARNINGS
- 30 days before: "Your Cassini license expires in 30 days" email
- 14 days before: Second warning email
- 7 days before: Urgent warning email + dashboard banner
- 1 day before: Final warning email

PAYMENT FAILURE
- invoice.payment_failed webhook:
  - License status → "payment_failed"
  - grace_period_ends_at set to 7 days from now
  - Email sent with "Update Payment Method" link (Stripe Billing Portal)
  - Dashboard shows warning banner
- If payment recovers within grace period:
  - Status → "active", grace period cleared
  - Event "payment_recovered" logged
- If grace period expires:
  - Status → "expired"
  - Event "expired" logged
  - Email sent with renewal link
  - Cassini app enters read-only mode for commercial features

SUBSCRIPTION CANCELLATION
- customer.subscription.deleted webhook:
  - License remains active until current period end (already paid for)
  - After period end: status → "expired"
  - Event "expired" logged
```

### 5.7 Team Management

```
INVITE MEMBER
- Org owner/admin enters email address
- Clerk invitation sent
- On acceptance: user record created, added to org with "member" role

CHANGE ROLE
- Owner can promote member → admin or demote admin → member
- Only one owner per org (ownership transfer requires support ticket)

REMOVE MEMBER
- Owner/admin can remove members
- Removed from Clerk org + portal user deactivated
- Cannot remove the owner
```

---

## 6. Portal Pages

### Public Pages (No Auth Required)

#### `GET /` — Pricing Page

The landing page for the portal. Three-tier pricing comparison.

**Layout:**
- Header: Saturnis logo, "Log In" button, "Sign Up" button
- Hero: "Cassini SPC — License Management" tagline
- Three pricing cards side-by-side:
  - **Professional** ($500/mo): Feature list, "Get Started" CTA (primary), "Start Free Trial" CTA (secondary)
  - **Enterprise** ($2,500/mo): Feature list, "Get Started" CTA (primary), "Request Evaluation" CTA (secondary)
  - **Enterprise Plus** (Custom): Feature list, "Contact Sales" CTA
- Feature comparison table (expandable/collapsible rows)
- FAQ section (billing, trials, what happens on expiry, how to activate)
- Footer: links to docs, GitHub, support, legal

**Feature Comparison Table Rows:**
- Plant limit
- Chart types (all included in all tiers)
- Nelson rules
- Basic capability (Cp/Cpk/Pp/Ppk)
- Advanced capability (non-normal, short-run)
- MQTT connectivity
- OPC-UA connectivity
- RS-232/USB gage bridge
- Electronic signatures
- Audit trail
- MSA/Gage R&R
- FAI (AS9102)
- AI/ML anomaly detection
- ERP/LIMS connectors
- SSO/OIDC
- Notifications (email, webhook, push)
- Retention policies
- Scheduled reports
- DOE (Design of Experiments)
- Show Your Work
- Support SLA
- Validation documentation

#### `GET /login` — Login

Clerk-hosted or embedded sign-in component. Supports email/password, Google SSO, GitHub SSO.

After login, redirect to `/dashboard`.

#### `GET /signup` — Sign Up

Clerk-hosted or embedded sign-up component. After signup, redirect to organization creation flow.

#### `GET /contact-sales` — Enterprise Plus Inquiry Form

Standalone form page (works without auth):
- Company name, contact name, contact email, industry, plant count, requirements, timeline
- Submits to `POST /api/support/tickets` with category `enterprise_inquiry`
- Success page with "We'll be in touch within 1 business day" message

### Authenticated Pages (Require Login)

#### `GET /onboarding` — Organization Setup

Shown after first signup if user has no org:
- Step 1: Create organization (name, billing email, industry, company size)
- Step 2: Choose path — "Start Trial" or "Purchase Now" (redirects to appropriate flow)

#### `GET /dashboard` — Dashboard

Primary authenticated landing page.

**Content:**
- Welcome message with org name
- Active licenses summary cards:
  - Tier badge (Professional/Enterprise/Enterprise Plus)
  - Status indicator (green=active, yellow=trial, orange=payment_failed, red=expired)
  - Expiry date + "X days remaining" countdown
  - Quick actions: "Download Key", "View Details"
- Trial banner (if applicable): "Your trial expires in X days. [Upgrade Now]"
- Payment failure banner (if applicable): "Payment failed. [Update Payment Method] — Y days until license expires"
- Recent license events timeline (last 10 events)
- Quick links: Billing, Team, Support, Cassini Documentation

#### `GET /licenses` — License List

Table of all org licenses:
- Columns: License ID, Tier, Status, Plant Limit, Issued Date, Expires Date, Actions
- Status badges with color coding
- Row click navigates to license detail
- "Purchase New License" button (if org wants multiple deployments)

#### `GET /licenses/[id]` — License Detail

Full license management page:
- **Header:** Tier badge, status, license ID
- **Key Management Section:**
  - Current key info (issued date, expiry, key hash preview)
  - "Download license.key" button
  - "Copy Key to Clipboard" button
  - "Rotate Key" button (with confirmation dialog)
- **Activation Instructions:**
  - Docker: `docker run -v ./license.key:/app/license.key ...`
  - Manual: Drop `license.key` in Cassini install directory, restart
  - Environment: Set `LICENSE_FILE=/path/to/license.key`
- **Features Section:** Checklist of all enabled features
- **Event History:** Timeline of all license events (issued, renewed, rotated, etc.)
- **Subscription Info** (if Stripe-backed):
  - Current period, next billing date
  - "Manage Subscription" link (→ Stripe Billing Portal)

#### `GET /billing` — Billing

Stripe Billing Portal embed or redirect:
- View invoices and payment history
- Update payment method
- View upcoming invoice
- Cancel subscription (with confirmation and explanation of what happens)

Implementation: Use Stripe's Billing Portal link (`/api/billing/portal` returns a URL, frontend redirects).

#### `GET /team` — Team Management

Organization member list and management:
- Member table: Name, Email, Role, Joined Date, Actions
- "Invite Member" button → dialog with email input
- Role change dropdown (owner/admin only, cannot change own role)
- Remove member button (owner/admin only, cannot remove owner)
- Pending invitations list with resend/revoke actions

#### `GET /support` — Support

Support ticket management:
- "New Ticket" button → creation form (subject, category, description, priority)
- Ticket list table: ID, Subject, Category, Status, Priority, Created, Updated
- Ticket detail view: full description, internal notes (hidden from customer), status history
- Categories: General, Billing, Technical, Enterprise Inquiry, Feature Request

#### `GET /settings` — Organization Settings

- Organization name (editable by owner/admin)
- Billing email (editable by owner/admin)
- Industry and company size (editable)
- Notification preferences:
  - Expiry warnings (enabled by default, cannot disable 1-day warning)
  - Renewal confirmations
  - Team change notifications
- Danger zone: "Delete Organization" (requires typing org name to confirm, cancels all subscriptions, revokes all licenses)

### Admin Pages (Saturnis Staff Only)

All admin pages require `is_staff = true` on the user record. Admin routes are prefixed with `/admin`.

#### `GET /admin` — Admin Dashboard

- Key metrics cards: Total orgs, active licenses, MRR, trials in progress, expiring soon (30 days)
- Revenue chart (MRR over time)
- Recent activity feed (license events across all orgs)
- Quick actions: Generate License, View Tickets

#### `GET /admin/organizations` — Organization Management

- Searchable/filterable table of all organizations
- Columns: Name, Email, Licenses (count), MRR, Created Date
- Click to view org detail (all licenses, users, tickets, events)
- Inline actions: add note, create manual license

#### `GET /admin/licenses` — License Management

- Searchable/filterable table of all licenses across all orgs
- Filters: tier, status, expiring within X days
- Columns: License ID, Org Name, Tier, Status, Plant Limit, Expires, MRR
- Inline actions: revoke, extend, view detail
- "Generate Manual License" button (for Enterprise Plus deals)

#### `GET /admin/licenses/generate` — Manual License Generation

Form for creating licenses outside of Stripe (Enterprise Plus deals):
- Select or create organization
- Tier selection (typically enterprise_plus)
- Plant limit
- Expiry date
- Customer name and email (baked into JWT)
- Notes (deal reference, SO number, etc.)
- Preview JWT claims before signing
- Generate + download + email delivery options

#### `GET /admin/tickets` — Support Ticket Queue

- Filterable ticket list (status, category, priority)
- Columns: ID, Org, Subject, Category, Status, Priority, Created, Assigned
- Ticket detail view with internal notes field
- Status transitions: Open → In Progress → Resolved → Closed
- Priority escalation
- Email reply (sends via Resend to ticket creator)

#### `GET /admin/metrics` — Revenue Metrics

- MRR (Monthly Recurring Revenue) — current and trend
- ARR (Annual Recurring Revenue) — projected
- Active subscriptions by tier (pie chart)
- Trial conversion rate (trials started vs. converted to paid)
- Churn rate (cancellations per month)
- License count by status (bar chart)
- Revenue by tier (stacked bar chart over time)
- Upcoming renewals (next 30/60/90 days)
- Data source: Stripe API for financial data, portal DB for license metrics

---

## 7. API Endpoints

All API routes are Next.js App Router API routes under `app/api/`.

### Authentication

Authentication is handled by Clerk middleware. All authenticated routes receive the Clerk user context. The API layer resolves the portal user and org from the Clerk user ID.

### Public Endpoints

#### `GET /api/pricing`

Returns tier information and pricing for the pricing page.

```typescript
// Response 200
{
  tiers: [
    {
      id: 'professional',
      name: 'Professional',
      price_monthly: 500,
      price_display: '$500/mo',
      plant_limit: 5,
      trial_days: 14,
      features: ['All Community features', 'Multi-plant (up to 5)', ...],
      cta_primary: { label: 'Get Started', action: 'checkout' },
      cta_secondary: { label: 'Start Free Trial', action: 'trial' }
    },
    // ...enterprise, enterprise_plus
  ]
}
```

#### `POST /api/contact-sales`

Enterprise Plus inquiry form submission (no auth required).

```typescript
// Request
{
  company_name: string,    // required
  contact_name: string,    // required
  contact_email: string,   // required, valid email
  industry: string,        // required
  plant_count: number,     // required, > 0
  requirements: string,    // required
  timeline?: string
}

// Response 201
{ ticket_id: string, message: 'Thank you. We will contact you within 1 business day.' }
```

### Organization Endpoints (Authenticated)

#### `GET /api/organizations/me`

Returns the current user's organization.

```typescript
// Response 200
{
  id: string,
  name: string,
  billing_email: string,
  industry: string | null,
  company_size: string | null,
  created_at: string,
  member_count: number,
  license_count: number
}
```

#### `PUT /api/organizations/me`

Update organization details. Requires owner or admin role.

```typescript
// Request
{
  name?: string,
  billing_email?: string,
  industry?: string,
  company_size?: string
}

// Response 200 — updated organization
```

#### `DELETE /api/organizations/me`

Delete organization. Requires owner role. Cancels all Stripe subscriptions, revokes all licenses, deletes all data.

```typescript
// Request
{ confirm_name: string }  // Must match org name exactly

// Response 204
```

### License Endpoints (Authenticated)

#### `GET /api/licenses`

List all licenses for the current user's organization.

```typescript
// Response 200
{
  licenses: [
    {
      id: string,
      tier: 'professional' | 'enterprise' | 'enterprise_plus',
      status: 'active' | 'trial' | 'expired' | 'revoked' | 'payment_failed',
      plant_limit: number,
      features: string[],
      customer_name: string,
      license_id_short: string,
      issued_at: string,
      expires_at: string,
      trial_ends_at: string | null,
      grace_period_ends_at: string | null,
      days_until_expiry: number
    }
  ]
}
```

#### `GET /api/licenses/[id]`

Get license detail including event history.

```typescript
// Response 200
{
  license: { /* same as list item */ },
  events: [
    {
      id: string,
      event_type: string,
      actor_email: string | null,
      metadata: object,
      created_at: string
    }
  ],
  activation_instructions: {
    docker: string,
    manual: string,
    environment: string
  }
}
```

#### `GET /api/licenses/[id]/download`

Download the license key as a file.

```typescript
// Response 200
// Content-Type: application/octet-stream
// Content-Disposition: attachment; filename="license.key"
// Body: raw JWT string
```

#### `POST /api/licenses/[id]/rotate`

Rotate the license key. Generates a new JWT, adds old key hash to revocation list.

```typescript
// Request — empty body

// Response 200
{
  license_key: string,     // New JWT
  old_key_valid_until: string,  // ISO timestamp (24h from now)
  message: 'New key generated. Your previous key will remain valid for 24 hours.'
}
```

#### `POST /api/licenses/trial`

Start a free trial. Creates a trial license without payment.

```typescript
// Request
{ tier: 'professional' }  // Only professional trials in v1

// Response 201
{
  license: { /* license object */ },
  license_key: string,  // JWT
  trial_ends_at: string,
  message: 'Your 14-day trial has started.'
}
```

### Checkout Endpoints (Authenticated)

#### `POST /api/checkout`

Create a Stripe Checkout session for purchasing a license.

```typescript
// Request
{
  tier: 'professional' | 'enterprise',
  success_url?: string,  // Defaults to /dashboard
  cancel_url?: string    // Defaults to /
}

// Response 200
{
  checkout_url: string  // Stripe Checkout URL — redirect user here
}
```

#### `GET /api/billing/portal`

Get a Stripe Billing Portal session URL.

```typescript
// Response 200
{
  portal_url: string,  // Stripe Billing Portal URL — redirect user here
  return_url: string   // Where to return after portal (dashboard)
}
```

### Team Endpoints (Authenticated)

#### `GET /api/team`

List organization members.

```typescript
// Response 200
{
  members: [
    {
      id: string,
      email: string,
      name: string | null,
      role: 'owner' | 'admin' | 'member',
      created_at: string
    }
  ],
  pending_invitations: [
    {
      email: string,
      invited_at: string,
      expires_at: string
    }
  ]
}
```

#### `POST /api/team/invite`

Invite a member to the organization. Requires owner or admin role.

```typescript
// Request
{
  email: string,
  role: 'admin' | 'member'
}

// Response 201
{ message: 'Invitation sent to user@example.com' }
```

#### `PATCH /api/team/[userId]`

Update member role. Requires owner role.

```typescript
// Request
{ role: 'admin' | 'member' }

// Response 200
{ member: { /* updated member */ } }
```

#### `DELETE /api/team/[userId]`

Remove member from organization. Requires owner or admin role. Cannot remove owner.

```typescript
// Response 204
```

### Support Endpoints (Authenticated)

#### `GET /api/support/tickets`

List tickets for the current user's organization.

```typescript
// Query params: status?, category?, page?, limit?

// Response 200
{
  tickets: [ /* ticket objects */ ],
  total: number,
  page: number,
  limit: number
}
```

#### `POST /api/support/tickets`

Create a support ticket.

```typescript
// Request
{
  subject: string,
  description: string,
  category: 'general' | 'billing' | 'technical' | 'enterprise_inquiry' | 'feature_request',
  priority?: 'low' | 'normal' | 'high'
}

// Response 201
{ ticket: { /* ticket object */ } }
```

#### `GET /api/support/tickets/[id]`

Get ticket detail.

```typescript
// Response 200
{ ticket: { /* full ticket object, internal_notes excluded for non-staff */ } }
```

### Webhook Endpoints

#### `POST /api/webhooks/stripe`

Handles Stripe webhook events. Verified via `stripe.webhooks.constructEvent()`.

**Handled events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Create license record, generate JWT, send email |
| `invoice.payment_succeeded` | Extend license expiry, log renewal event |
| `invoice.payment_failed` | Set license to `payment_failed`, start 7-day grace, send warning email |
| `customer.subscription.updated` | Update license tier/features if plan changed |
| `customer.subscription.deleted` | Mark license for expiry at period end |

#### `POST /api/webhooks/clerk`

Handles Clerk webhook events for user/org lifecycle sync.

**Handled events:**

| Event | Action |
|-------|--------|
| `user.created` | Create user record if org exists |
| `user.updated` | Sync email/name changes |
| `user.deleted` | Deactivate user record |
| `organization.created` | Create org record |
| `organization.updated` | Sync org name changes |
| `organizationMembership.created` | Add user to org |
| `organizationMembership.deleted` | Remove user from org |

### Admin Endpoints (Staff Only)

All admin endpoints require `is_staff = true`. Return 403 for non-staff users.

#### `GET /api/admin/organizations`

List all organizations with search and filtering.

```typescript
// Query params: search?, page?, limit?, sort?

// Response 200
{
  organizations: [
    {
      /* org fields */
      license_count: number,
      active_license_count: number,
      mrr: number,  // Monthly recurring revenue for this org
      latest_event: string | null
    }
  ],
  total: number
}
```

#### `GET /api/admin/organizations/[id]`

Detailed org view with all related data.

```typescript
// Response 200
{
  organization: { /* full org */ },
  users: [ /* all org users */ ],
  licenses: [ /* all org licenses with events */ ],
  tickets: [ /* all org tickets */ ]
}
```

#### `GET /api/admin/licenses`

List all licenses across all organizations.

```typescript
// Query params: tier?, status?, expiring_within_days?, search?, page?, limit?

// Response 200
{
  licenses: [
    {
      /* license fields */
      org_name: string,
      org_email: string,
      mrr: number
    }
  ],
  total: number
}
```

#### `POST /api/admin/licenses`

Manually create a license (for Enterprise Plus deals or special cases).

```typescript
// Request
{
  org_id: string,
  tier: 'professional' | 'enterprise' | 'enterprise_plus',
  plant_limit: number,      // -1 for unlimited
  customer_name: string,
  customer_email: string,
  expires_at: string,        // ISO date
  notes?: string,
  send_email?: boolean       // Default true
}

// Response 201
{
  license: { /* license object */ },
  license_key: string  // JWT (shown once in admin UI, also emailed if send_email=true)
}
```

#### `PATCH /api/admin/licenses/[id]`

Update license (extend expiry, change status, add notes).

```typescript
// Request
{
  expires_at?: string,
  status?: 'active' | 'expired' | 'revoked',
  plant_limit?: number,
  notes?: string
}

// Response 200 — if status or expiry changed, a new JWT may be generated
```

#### `DELETE /api/admin/licenses/[id]`

Revoke a license. Adds key hash to revocation list.

```typescript
// Request
{ reason: string }

// Response 200
{ message: 'License revoked', revoked_at: string }
```

#### `GET /api/admin/metrics`

Revenue and business metrics.

```typescript
// Response 200
{
  mrr: number,                    // Current MRR
  arr: number,                    // Projected ARR (MRR * 12)
  total_organizations: number,
  total_licenses: number,
  active_licenses: number,
  trial_licenses: number,
  expired_licenses: number,
  mrr_by_tier: {
    professional: number,
    enterprise: number,
    enterprise_plus: number       // Manually tracked, not from Stripe
  },
  trials: {
    active: number,
    converted_last_30d: number,
    expired_last_30d: number,
    conversion_rate_30d: number   // Percentage
  },
  churn: {
    cancellations_last_30d: number,
    churn_rate_30d: number        // Percentage
  },
  upcoming_renewals: {
    next_30d: number,
    next_60d: number,
    next_90d: number
  },
  mrr_history: [                  // Last 12 months
    { month: string, mrr: number }
  ]
}
```

#### `GET /api/admin/tickets`

List all support tickets across all organizations.

```typescript
// Query params: status?, category?, priority?, search?, page?, limit?

// Response 200
{
  tickets: [ /* ticket objects with org_name */ ],
  total: number,
  counts_by_status: { open: number, in_progress: number, resolved: number, closed: number }
}
```

#### `PATCH /api/admin/tickets/[id]`

Update ticket status, priority, or add internal notes.

```typescript
// Request
{
  status?: string,
  priority?: string,
  internal_notes?: string
}

// Response 200
```

---

## 8. Stripe Integration

### Products and Prices

Create in Stripe Dashboard or via API during setup:

```
Product: Cassini Professional
  - Price: $500/month (recurring, monthly)
  - Metadata: { tier: 'professional', plant_limit: '5' }

Product: Cassini Enterprise
  - Price: $2,500/month (recurring, monthly)
  - Metadata: { tier: 'enterprise', plant_limit: '-1' }
```

Store Stripe Price IDs in environment variables: `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_ENTERPRISE`.

### Checkout Session Creation

```typescript
const session = await stripe.checkout.sessions.create({
  customer: org.stripe_customer_id,
  mode: 'subscription',
  line_items: [{
    price: tier === 'professional'
      ? process.env.STRIPE_PRICE_PROFESSIONAL
      : process.env.STRIPE_PRICE_ENTERPRISE,
    quantity: 1,
  }],
  success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.NEXT_PUBLIC_URL}/?checkout=cancelled`,
  metadata: {
    org_id: org.id,
    tier: tier,
  },
  subscription_data: {
    metadata: {
      org_id: org.id,
      tier: tier,
    },
  },
  allow_promotion_codes: true,
})
```

### Billing Portal

```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: org.stripe_customer_id,
  return_url: `${process.env.NEXT_PUBLIC_URL}/dashboard`,
})
```

### Webhook Handler

```typescript
// app/api/webhooks/stripe/route.ts

import Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object)
      break
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(event.data.object)
      break
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object)
      break
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object)
      break
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object)
      break
  }

  return new Response('OK', { status: 200 })
}
```

### Webhook Event Handling

**`checkout.session.completed`:**
1. Extract `org_id` and `tier` from session metadata
2. Create Stripe customer link if not exists (`organizations.stripe_customer_id`)
3. Create `licenses` record (status: active, tier, plant_limit, expires_at = 1 month from now)
4. Generate Ed25519-signed JWT
5. Store key hash in license record
6. Log `license_events` entry (type: `issued`)
7. Send license delivery email via Resend

**`invoice.payment_succeeded`:**
1. Find license by `stripe_subscription_id`
2. Extend `expires_at` by billing period (1 month)
3. If license was in `payment_failed` status, restore to `active`, clear `grace_period_ends_at`
4. Generate new JWT with updated expiry (auto-rotate on renewal)
5. Log `renewed` event (or `payment_recovered` if recovering from failure)
6. Send renewal confirmation email

**`invoice.payment_failed`:**
1. Find license by `stripe_subscription_id`
2. Set status to `payment_failed`
3. Set `grace_period_ends_at` to 7 days from now
4. Log `payment_failed` event
5. Send payment failure email with Stripe Billing Portal link

**`customer.subscription.deleted`:**
1. Find license by `stripe_subscription_id`
2. License remains `active` until `expires_at` (current period end)
3. After `expires_at`, a scheduled job sets status to `expired`
4. Log event with cancellation reason if available

### Scheduled Jobs

Use Vercel Cron or external cron (e.g., QStash) for periodic tasks:

**Every hour:**
- Check for licenses past `expires_at` with status `active` or `trial` → set to `expired`
- Check for licenses past `grace_period_ends_at` with status `payment_failed` → set to `expired`

**Daily at 09:00 UTC:**
- Send expiry warning emails (30d, 14d, 7d, 1d)

---

## 9. Email System

### Provider

Use [Resend](https://resend.com) with [React Email](https://react.email) templates for transactional email.

### Email Templates

All emails are sent from `licenses@saturnis.io` (or `noreply@saturnis.io` for transactional) with reply-to `support@saturnis.io`.

#### Welcome Email

**Trigger:** After account creation
**Subject:** Welcome to Cassini
**Content:**
- Welcome message
- Quick start links (documentation, pricing if no license yet)
- Support contact

#### License Issued

**Trigger:** After successful checkout or manual license creation
**Subject:** Your Cassini License Key
**Content:**
- License tier and details
- License key as downloadable `.key` file attachment
- Activation instructions (Docker, manual, environment variable)
- Link to license management dashboard
- Support contact

#### Trial Started

**Trigger:** After trial license creation
**Subject:** Your Cassini 14-Day Trial
**Content:**
- Trial details (tier, features, plant limit, expiry date)
- License key as attachment
- Activation instructions
- "What to try first" quick start guide
- Upgrade link

#### License Renewed

**Trigger:** After successful recurring payment
**Subject:** Cassini License Renewed
**Content:**
- Confirmation of renewal
- New expiry date
- Updated license key as attachment (auto-rotated on renewal)
- Dashboard link

#### License Key Rotated

**Trigger:** After manual key rotation
**Subject:** Your Cassini License Key Has Been Rotated
**Content:**
- New license key as attachment
- Note that old key is valid for 24 hours
- Instructions to replace the key file

#### Expiry Warning (30 days)

**Trigger:** Scheduled job, 30 days before expiry
**Subject:** Your Cassini License Expires in 30 Days
**Content:**
- Friendly reminder
- License details
- "No action needed if auto-renewal is enabled"
- Link to billing portal to verify payment method

#### Expiry Warning (14 days)

**Subject:** Your Cassini License Expires in 14 Days
**Content:** Same structure as 30-day, slightly more urgent tone.

#### Expiry Warning (7 days)

**Subject:** Action Required: Cassini License Expires in 7 Days
**Content:**
- Urgent tone
- Explicit "Renew Now" button
- What happens on expiry (read-only mode, no data loss)

#### Expiry Warning (1 day)

**Subject:** URGENT: Cassini License Expires Tomorrow
**Content:**
- Final warning
- Large "Renew Now" button
- Reassurance about graceful degradation

#### Payment Failed

**Trigger:** `invoice.payment_failed` webhook
**Subject:** Action Required: Cassini Payment Failed
**Content:**
- Payment failure notification
- "Update Payment Method" button (links to Stripe Billing Portal)
- 7-day grace period notice
- What happens after grace period

#### License Expired

**Trigger:** License status set to expired
**Subject:** Your Cassini License Has Expired
**Content:**
- Expiry notification
- What is affected (commercial features in read-only mode)
- What is NOT affected (data is safe, community features still work)
- "Renew Now" button
- Contact support link

#### Team Invite

**Trigger:** `POST /api/team/invite`
**Subject:** You've Been Invited to {Org Name} on Cassini
**Content:**
- Invitation from org owner/admin
- "Accept Invitation" button
- Brief explanation of what Cassini is

#### Enterprise Plus Inquiry Confirmation

**Trigger:** `POST /api/contact-sales`
**Subject:** We Received Your Cassini Enterprise Plus Inquiry
**Content:**
- Thank you message
- Summary of submitted information
- "We'll contact you within 1 business day"
- In the meantime: links to documentation, Community Edition

#### Sales Notification (Internal)

**Trigger:** Enterprise Plus inquiry submitted
**To:** sales@saturnis.io
**Subject:** New Enterprise Plus Inquiry: {Company Name}
**Content:**
- All form fields
- Link to admin ticket view

---

## 10. Security

### Authentication

- **Clerk** handles all authentication concerns (password hashing, session management, MFA, SSO)
- API routes verify Clerk session tokens via middleware
- Clerk webhook events are verified via Svix signature validation

### Authorization

- **Organization scoping:** All data queries are scoped to the authenticated user's organization. Users cannot access other organizations' data.
- **Role-based access:**
  - `member`: Read licenses, download keys, view billing, create support tickets
  - `admin`: + Invite/remove members, update org settings, rotate keys
  - `owner`: + Delete org, transfer ownership, change member roles
  - `staff` (Saturnis internal): Access to all `/admin` routes, bypass org scoping

### Row Level Security (Supabase)

All tables have RLS policies ensuring data isolation:

```sql
-- Example: licenses table
CREATE POLICY "Users can view their org's licenses"
  ON licenses FOR SELECT
  USING (org_id = (SELECT id FROM organizations WHERE clerk_org_id = auth.jwt()->>'org_id'));

-- Staff bypass
CREATE POLICY "Staff can view all licenses"
  ON licenses FOR ALL
  USING ((SELECT is_staff FROM users WHERE clerk_user_id = auth.uid()));
```

### Cryptographic Key Management

- **Ed25519 private key**: Stored ONLY in the `ED25519_PRIVATE_KEY` environment variable on Vercel. Never in source code, never in the database, never logged.
- **Ed25519 public key**: Stored in the `ED25519_PUBLIC_KEY` environment variable for optional verification. Also bundled in the Cassini application source code.
- **Key rotation**: If the signing key is compromised, generate a new keypair, update the Cassini application's bundled public key, and re-issue all active licenses. This is a breaking change that requires a Cassini application update.

### Stripe Security

- Webhook signature verification on every webhook request using `stripe.webhooks.constructEvent()`
- Stripe secret key stored in `STRIPE_SECRET_KEY` environment variable
- No Stripe secret key exposure to client-side code
- Checkout sessions created server-side, only the session URL is returned to the client

### API Security

- **Rate limiting**: All API routes rate-limited via Vercel's built-in rate limiting or `@upstash/ratelimit`:
  - Public endpoints: 10 requests/minute per IP
  - Authenticated endpoints: 60 requests/minute per user
  - Webhook endpoints: 100 requests/minute per IP (Stripe sends bursts)
  - Admin endpoints: 120 requests/minute per user
- **Input validation**: All request bodies validated with Zod schemas before processing
- **Error handling**: Never expose internal errors to clients. Log server-side, return generic messages.
- **CORS**: Only allow requests from `portal.saturnis.io` and `saturnis.io`

### HTTP Security Headers

Applied via `next.config.js` or middleware:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com; connect-src 'self' https://api.stripe.com https://api.clerk.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### License Key Security

- License keys (JWTs) are displayed to the user only at creation/rotation time
- Only the SHA-256 hash of the key is stored in the database
- The raw JWT is generated, delivered (display + email), and then discarded from server memory
- Revocation checking uses key hashes, never raw keys
- The `revoked_keys` table is the only place where key identity is tracked post-issuance

### Audit Trail

Every significant action is logged in `license_events`:
- License issuance, renewal, rotation, revocation, expiry
- Payment success, failure, recovery
- Tier changes, manual extensions
- Actor (user) and metadata recorded for accountability

---

## 11. Admin Panel

### Access Control

Admin panel access requires `is_staff = true` on the user record. This flag is set directly in the database by Saturnis engineers — there is no self-serve way to become staff.

Staff users see an "Admin" link in the navigation header that leads to `/admin`.

### Admin Capabilities

| Capability | Description |
|------------|-------------|
| View all organizations | Search, filter, inspect any org's data |
| View all licenses | Search, filter by tier/status/expiry |
| Generate manual licenses | For Enterprise Plus deals and special cases |
| Revoke licenses | With reason, adds to revocation list |
| Extend license expiry | For goodwill gestures or deal adjustments |
| Manage support tickets | Assign, prioritize, add internal notes, close |
| View revenue metrics | MRR, ARR, churn, conversion, projections |
| Impersonate organization | View portal as if logged into a specific org (read-only) |

### Manual License Generation Workflow

1. Staff navigates to `/admin/licenses/generate`
2. Selects existing organization or creates new one inline
3. Fills in license parameters:
   - Tier (typically `enterprise_plus`)
   - Plant limit (typically -1 for unlimited)
   - Expiry date (typically 1 year out)
   - Customer name and email
   - Internal notes (SO number, deal reference)
4. Reviews JWT claims preview
5. Clicks "Generate License"
6. System creates license record, signs JWT, stores hash
7. License key is displayed on screen (copy/download)
8. Optionally sends delivery email to customer
9. Event logged with staff actor

---

## 12. Deployment and Infrastructure

### Vercel Configuration

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "crons": [
    {
      "path": "/api/cron/check-expiry",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/send-warnings",
      "schedule": "0 9 * * *"
    }
  ]
}
```

### Supabase Setup

1. Create Supabase project in the same region as Vercel (us-east-1)
2. Run migration SQL to create all tables
3. Enable Row Level Security on all tables
4. Create RLS policies per table
5. Note: Supabase auth is NOT used (Clerk handles auth). Supabase is used only as a managed PostgreSQL database.

### Domain Configuration

- `portal.saturnis.io` — main portal domain (Vercel custom domain)
- Configure DNS: CNAME to Vercel
- SSL: automatic via Vercel

### CI/CD

- **Repository**: `saturnis/cassini-portal` (separate from main Cassini repo)
- **Preview deployments**: Vercel creates preview URLs for every PR
- **Production deployment**: Merge to `main` triggers production deploy
- **Environment variables**: Set in Vercel dashboard (not in code)

### Monitoring

- **Vercel Analytics**: Page views, web vitals, function invocations
- **Stripe Dashboard**: Payment monitoring, failed payments, disputes
- **Supabase Dashboard**: Database metrics, query performance
- **Resend Dashboard**: Email delivery rates, bounces
- **Error tracking**: Sentry (optional, recommended for production)

### Backup Strategy

- **Database**: Supabase automatic daily backups (included in Pro plan)
- **License events**: Immutable append-only table — the audit trail itself
- **Stripe**: Stripe retains all payment and subscription data independently
- **Ed25519 private key**: Backed up in a secure, offline location (not in any cloud service). Loss of this key means inability to issue new licenses and requires key rotation across all deployments.

---

## 13. Environment Variables

All environment variables are set in the Vercel dashboard. None are committed to source code.

```bash
# Application
NEXT_PUBLIC_URL=https://portal.saturnis.io
NODE_ENV=production

# Clerk (Authentication)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

# Stripe (Payments)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...

# Supabase (Database)
DATABASE_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Ed25519 (License Signing)
ED25519_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
ED25519_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# Resend (Email)
RESEND_API_KEY=re_...
EMAIL_FROM=licenses@saturnis.io
EMAIL_REPLY_TO=support@saturnis.io

# Internal
SALES_NOTIFICATION_EMAIL=sales@saturnis.io
CRON_SECRET=...  # Vercel cron job authentication
```

---

## 14. UI/UX Guidelines

### Design System

Use **shadcn/ui** components with **Tailwind CSS v4** for consistency and rapid development.

**Typography:**
- Headings: Inter or system font stack
- Body: Same
- Monospace (license keys, code snippets): JetBrains Mono or system monospace

**Color Palette:**
- Primary: Deep blue (#1a365d) — trust, professionalism
- Accent: Indigo (#4f46e5) — CTAs, links
- Success: Green (#059669) — active status, successful payments
- Warning: Amber (#d97706) — trials, expiring soon
- Danger: Red (#dc2626) — expired, revoked, payment failed
- Neutral: Slate grays — backgrounds, borders, secondary text

**Tier Colors (for badges and cards):**
- Professional: Blue (#3b82f6)
- Enterprise: Purple (#7c3aed)
- Enterprise Plus: Gold (#b45309)

### Key UX Principles

1. **License key display**: Always show a "Copy to Clipboard" button next to the key. The key is a long JWT string — users should never need to manually select it. Also provide "Download as File" for the `.key` file.

2. **Status visibility**: Every license should show its status clearly with color-coded badges. The dashboard should surface problems (expiring soon, payment failed) prominently.

3. **Activation instructions**: Show activation instructions on every page where a license key is displayed. Users will forget how to activate. The three methods (Docker mount, file drop, environment variable) should all be shown.

4. **Trust indicators**: The portal handles payments and generates cryptographic keys. Use HTTPS badges, Stripe trust marks, and clear security language.

5. **Empty states**: New users with no licenses should see a clear path to getting started (pricing cards or "Start Trial" CTA), not a blank table.

6. **Mobile responsive**: The portal must work on mobile for quick license checks and key downloads, though primary use is desktop.

### Page Layouts

**Public pages:** Centered content, max-width 1200px, generous whitespace. Pricing cards should be the visual focus.

**Dashboard/authenticated pages:** Sidebar navigation (collapsible on mobile) + main content area. Sidebar contains: Dashboard, Licenses, Billing, Team, Support, Settings. Staff users see an additional "Admin" section.

**Admin pages:** Same sidebar layout with admin-specific navigation. Data tables with search, filter, pagination. Detail views as slide-over panels or dedicated pages.

---

## 15. Testing Strategy

### Unit Tests

- **License signing/verification**: Test JWT generation, expiry, claim correctness, invalid signatures
- **Stripe webhook handlers**: Mock Stripe events, verify DB state changes
- **Authorization**: Test role-based access for each endpoint
- **Validation**: Test Zod schemas accept valid input and reject invalid input

### Integration Tests

- **Checkout flow**: Mock Stripe Checkout, verify license creation end-to-end
- **Renewal flow**: Simulate `invoice.payment_succeeded`, verify license extension
- **Payment failure flow**: Simulate failure → grace → recovery and failure → grace → expiry
- **Trial flow**: Start trial → convert to paid → verify license update
- **Key rotation**: Rotate key, verify old hash in revocation list, verify new key valid

### E2E Tests (Playwright)

- Signup → create org → start trial → view dashboard → download key
- Purchase flow (with Stripe test mode)
- License management (view, download, rotate)
- Team management (invite, change role, remove)
- Admin: generate manual license, revoke license
- Responsive: test critical flows on mobile viewport

### Test Environment

- **Stripe test mode**: Use `sk_test_` keys for all non-production environments
- **Clerk test mode**: Separate Clerk application for development
- **Supabase**: Separate project for development/staging, or local Supabase via Docker
- **Resend**: Use test API key (emails logged but not delivered)

---

## 16. Future Considerations (v2)

These features are explicitly out of scope for v1 but should be kept in mind during architecture decisions to avoid painting into a corner.

### Annual Billing
- 10% discount for annual payment ($5,400/yr Professional, $27,000/yr Enterprise)
- Requires additional Stripe prices and checkout logic
- License key issued for full year, renewed annually

### Usage Telemetry Dashboard
- Opt-in, anonymous telemetry from Cassini deployments
- Metrics: active users, charts created, measurements recorded, API calls
- Displayed in portal dashboard for customers to see their usage
- Requires new API endpoint in Cassini application + data pipeline

### License Compliance Endpoint
- Optional call-home for enterprise customers who want centralized license management
- `GET /api/verify?hash=...` — returns active/revoked status
- Cassini application checks on startup (if network available), falls back to offline validation

### Partner/Reseller Portal
- Separate section for system integrators and resellers
- Bulk license management
- Commission tracking
- White-label licensing

### CI/CD License Provisioning
- API key authentication (not session-based) for automation
- `POST /api/v2/licenses` with API key header
- Use case: automated deployment pipelines that need fresh license keys

### Self-Hosted License Server
- For air-gapped environments that need revocation checking
- Docker image that customers deploy on their internal network
- Syncs revocation list from portal when network is available
- Cassini application can point to internal license server instead of portal

### Multi-Currency Support
- EUR, GBP pricing for European customers
- Stripe handles currency conversion, but displayed prices should be fixed per currency

### Dunning Management
- More sophisticated payment recovery: multiple retry attempts with increasing urgency
- SMS notifications for payment failures (requires customer phone number)
- Account suspension (not just read-only) after extended non-payment

---

## Appendix A: Drizzle Schema (TypeScript)

Reference implementation of the data model using Drizzle ORM.

```typescript
// db/schema.ts

import { pgTable, uuid, text, boolean, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  billingEmail: text('billing_email').notNull(),
  clerkOrgId: text('clerk_org_id').unique().notNull(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  industry: text('industry'),
  companySize: text('company_size'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_organizations_clerk').on(table.clerkOrgId),
  index('idx_organizations_stripe').on(table.stripeCustomerId),
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  clerkUserId: text('clerk_user_id').unique().notNull(),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role', { enum: ['owner', 'admin', 'member'] }).notNull().default('member'),
  isStaff: boolean('is_staff').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_users_org').on(table.orgId),
  uniqueIndex('idx_users_clerk').on(table.clerkUserId),
  index('idx_users_email').on(table.email),
])

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  tier: text('tier', { enum: ['professional', 'enterprise', 'enterprise_plus'] }).notNull(),
  status: text('status', { enum: ['active', 'trial', 'expired', 'revoked', 'payment_failed'] }).notNull().default('active'),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  plantLimit: integer('plant_limit').notNull().default(5),
  features: jsonb('features').notNull().default([]),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  licenseIdShort: text('license_id_short').unique().notNull(),
  keyHash: text('key_hash'),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_licenses_org').on(table.orgId),
  index('idx_licenses_status').on(table.status),
  index('idx_licenses_stripe').on(table.stripeSubscriptionId),
  index('idx_licenses_expires').on(table.expiresAt),
  uniqueIndex('idx_licenses_short_id').on(table.licenseIdShort),
])

export const licenseEvents = pgTable('license_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  licenseId: uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  eventType: text('event_type', { enum: [
    'issued', 'renewed', 'rotated', 'revoked', 'expired',
    'upgraded', 'downgraded', 'trial_started', 'trial_converted',
    'payment_failed', 'payment_recovered', 'grace_period_started',
    'grace_period_expired', 'manually_extended',
  ] }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  actorEmail: text('actor_email'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_license_events_license').on(table.licenseId),
  index('idx_license_events_type').on(table.eventType),
  index('idx_license_events_created').on(table.createdAt),
])

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  category: text('category', { enum: [
    'general', 'billing', 'technical', 'enterprise_inquiry', 'feature_request',
  ] }).notNull().default('general'),
  status: text('status', { enum: ['open', 'in_progress', 'resolved', 'closed'] }).notNull().default('open'),
  priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] }).notNull().default('normal'),
  contactEmail: text('contact_email').notNull(),
  contactName: text('contact_name'),
  companyName: text('company_name'),
  plantCount: integer('plant_count'),
  industry: text('industry'),
  requirements: text('requirements'),
  timeline: text('timeline'),
  internalNotes: text('internal_notes'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_tickets_org').on(table.orgId),
  index('idx_tickets_status').on(table.status),
  index('idx_tickets_category').on(table.category),
  index('idx_tickets_created').on(table.createdAt),
])

export const revokedKeys = pgTable('revoked_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyHash: text('key_hash').unique().notNull(),
  licenseId: uuid('license_id').notNull().references(() => licenses.id, { onDelete: 'cascade' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason'),
}, (table) => [
  uniqueIndex('idx_revoked_keys_hash').on(table.keyHash),
])
```

---

## Appendix B: License Generation Service (TypeScript)

Reference implementation of the Ed25519 license signing service.

```typescript
// lib/license-service.ts

import { SignJWT, importPKCS8 } from 'jose'
import { createHash } from 'crypto'
import { nanoid } from 'nanoid'

interface LicensePayload {
  orgId: string
  customerName: string
  customerEmail: string
  tier: 'professional' | 'enterprise' | 'enterprise_plus'
  plantLimit: number
  features: string[]
  expiresAt: Date
}

const FEATURE_SETS = {
  professional: [
    'signatures', 'audit', 'msa', 'fai', 'anomaly', 'analytics',
    'erp', 'opcua', 'gage_bridge', 'oidc', 'notifications',
    'retention', 'scheduled_reports', 'non_normal', 'custom_rules',
    'laney', 'short_run', 'doe', 'multivariate', 'predictive', 'ai_analysis',
  ],
  enterprise: null,         // Same as professional (all features)
  enterprise_plus: null,    // Same as professional (all features)
} as const

const PLANT_LIMITS = {
  professional: 5,
  enterprise: -1,           // Unlimited
  enterprise_plus: -1,      // Unlimited
} as const

export async function generateLicenseKey(payload: LicensePayload): Promise<{
  jwt: string
  keyHash: string
  licenseIdShort: string
}> {
  const privateKeyPem = process.env.ED25519_PRIVATE_KEY
  if (!privateKeyPem) {
    throw new Error('ED25519_PRIVATE_KEY not configured')
  }

  const privateKey = await importPKCS8(privateKeyPem, 'EdDSA')
  const licenseIdShort = `lic_${nanoid(8)}`

  const features = payload.features.length > 0
    ? payload.features
    : FEATURE_SETS.professional  // All commercial tiers get all features

  const jwt = await new SignJWT({
    license_id: licenseIdShort,
    customer_name: payload.customerName,
    customer_email: payload.customerEmail,
    tier: payload.tier,
    max_plants: payload.plantLimit,
    features: features,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer('saturnis.io')
    .setSubject(`org_${payload.orgId}`)
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt.getTime() / 1000))
    .sign(privateKey)

  const keyHash = createHash('sha256').update(jwt).digest('hex')

  return { jwt, keyHash, licenseIdShort }
}

export function hashLicenseKey(jwt: string): string {
  return createHash('sha256').update(jwt).digest('hex')
}

export function getDefaultPlantLimit(tier: string): number {
  return PLANT_LIMITS[tier as keyof typeof PLANT_LIMITS] ?? 5
}

export function getDefaultFeatures(): string[] {
  return [...FEATURE_SETS.professional]
}
```

---

## Appendix C: Project Structure

Suggested directory structure for the portal application.

```
cassini-portal/
  app/
    (public)/                     # Public layout group
      page.tsx                    # Pricing page (/)
      login/page.tsx
      signup/page.tsx
      contact-sales/page.tsx
    (authenticated)/              # Authenticated layout group (Clerk middleware)
      layout.tsx                  # Sidebar navigation
      dashboard/page.tsx
      licenses/
        page.tsx                  # License list
        [id]/page.tsx             # License detail
      billing/page.tsx
      team/page.tsx
      support/
        page.tsx                  # Ticket list
        new/page.tsx              # Create ticket
        [id]/page.tsx             # Ticket detail
      settings/page.tsx
      onboarding/page.tsx
    (admin)/                      # Admin layout group
      admin/
        layout.tsx                # Admin navigation
        page.tsx                  # Admin dashboard
        organizations/
          page.tsx
          [id]/page.tsx
        licenses/
          page.tsx
          generate/page.tsx
        tickets/
          page.tsx
          [id]/page.tsx
        metrics/page.tsx
    api/
      pricing/route.ts
      contact-sales/route.ts
      organizations/
        me/route.ts
      licenses/
        route.ts
        trial/route.ts
        [id]/
          route.ts
          download/route.ts
          rotate/route.ts
      checkout/route.ts
      billing/
        portal/route.ts
      team/
        route.ts
        invite/route.ts
        [userId]/route.ts
      support/
        tickets/
          route.ts
          [id]/route.ts
      admin/
        organizations/
          route.ts
          [id]/route.ts
        licenses/
          route.ts
          [id]/route.ts
        tickets/
          route.ts
          [id]/route.ts
        metrics/route.ts
      webhooks/
        stripe/route.ts
        clerk/route.ts
      cron/
        check-expiry/route.ts
        send-warnings/route.ts
  components/
    ui/                           # shadcn/ui components
    layout/
      Sidebar.tsx
      Header.tsx
      AdminSidebar.tsx
    pricing/
      PricingCard.tsx
      FeatureTable.tsx
    licenses/
      LicenseCard.tsx
      LicenseStatusBadge.tsx
      LicenseKeyDisplay.tsx
      ActivationInstructions.tsx
      RotateKeyDialog.tsx
    team/
      MemberTable.tsx
      InviteDialog.tsx
    support/
      TicketForm.tsx
      TicketList.tsx
    admin/
      MetricsCards.tsx
      RevenueChart.tsx
      GenerateLicenseForm.tsx
  db/
    schema.ts                     # Drizzle schema
    index.ts                      # DB connection
    migrate.ts                    # Migration runner
    migrations/                   # SQL migrations
  lib/
    license-service.ts            # Ed25519 signing
    stripe.ts                     # Stripe client
    resend.ts                     # Email client
    auth.ts                       # Clerk helpers
    utils.ts                      # Shared utilities
  emails/                         # React Email templates
    WelcomeEmail.tsx
    LicenseIssuedEmail.tsx
    TrialStartedEmail.tsx
    RenewalConfirmationEmail.tsx
    KeyRotatedEmail.tsx
    ExpiryWarningEmail.tsx
    PaymentFailedEmail.tsx
    LicenseExpiredEmail.tsx
    TeamInviteEmail.tsx
    EnterprisePlusConfirmEmail.tsx
    SalesNotificationEmail.tsx
  middleware.ts                   # Clerk auth middleware
  next.config.ts
  tailwind.config.ts
  drizzle.config.ts
  vercel.json
  package.json
  tsconfig.json
  .env.local                      # Local dev env vars (gitignored)
  .env.example                    # Template with all required vars
```

---

## Appendix D: Key Dependencies

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "@clerk/nextjs": "^6.0.0",
    "stripe": "^17.0.0",
    "@stripe/stripe-js": "^4.0.0",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.0",
    "jose": "^6.0.0",
    "resend": "^4.0.0",
    "@react-email/components": "^0.0.30",
    "nanoid": "^5.0.0",
    "zod": "^3.24.0",
    "@upstash/ratelimit": "^2.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "^0.400.0",
    "date-fns": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "drizzle-kit": "^0.30.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0",
    "prettier": "^3.4.0",
    "eslint": "^9.0.0"
  }
}
```

---

*This specification is the complete blueprint for building the Cassini License Portal. It should be treated as the authoritative reference for all architecture, data model, API, and UX decisions during implementation.*
