# Open-Core Strategy Design — Cassini SPC

**Date:** 2026-02-27
**Status:** Approved
**Basis:** Competitive analysis, pricing strategy docs, codebase structural audit

---

## Overview

Split Cassini into a free Community Edition and a paid Commercial Edition using a **feature-flag architecture** with a **signed JWT license file**. Single codebase, single deployment artifact. The presence or absence of a license key is the only difference between editions.

**Model:** AGPL-3.0 dual-license (GitLab/Cal.com pattern)
**Code gating:** Binary — Community vs Commercial (pricing tiers are commercial distinctions, not code distinctions)
**License validation:** Ed25519-signed JWT, fully offline, no call-home

---

## 1. License Key Architecture

### Format

Ed25519-signed JWT stored as a file (`license.key`).

```json
{
  "sub": "acme-manufacturing",
  "customer_name": "Acme Manufacturing Inc.",
  "customer_email": "quality@acme.com",
  "tier": "enterprise",
  "max_plants": 20,
  "issued_at": "2026-03-01T00:00:00Z",
  "expires_at": "2027-03-01T00:00:00Z",
  "license_id": "lic_abc123"
}
```

### Key Details

- **Ed25519** signing — fast, small signatures, no padding oracle attacks
- **Private key** held by Saturnis infrastructure only (generates licenses)
- **Public key** embedded in the application (validates licenses offline)
- **`tier`** field — display label only (`professional` / `enterprise` / `enterprise_plus`). All tiers unlock the same code. Used for support routing, UI badging, and plant limits
- **`max_plants`** — the one commercial lever enforced in code. Professional = 5, Enterprise = unlimited (9999)
- **`expires_at`** — annual renewal. Warnings at 30/7/1 days before expiry
- **No call-home** — works in air-gapped manufacturing plants
- **Bypass protection** — AGPL-3.0 legal enforcement, not DRM. Manufacturing companies won't risk audit failure for a $5K–$25K/year license

### File Location

Read from `LICENSE_FILE` environment variable, or `./license.key` in working directory.

### Graceful Degradation on Expiry

When a commercial license expires:
- Enterprise features enter **read-only mode** (existing data viewable, no new configurations)
- Audit trail continues logging (never lose audit data mid-compliance)
- Dashboard shows a banner with renewal instructions
- No data loss, no bricking — manufacturing plants run 24/7 and cannot have software failures due to delayed POs

---

## 2. Feature Tier Mapping

### Community Edition (Free, AGPL-3.0)

| Category | Features |
|----------|----------|
| **Charts** | All 11+ types: X-bar R, X-bar S, I-MR, p, np, c, u, CUSUM, EWMA, box-whisker |
| **Rules** | All 8 Nelson Rules (default parameters) |
| **Capability** | Basic Cp/Cpk/Pp/Ppk/Cpm |
| **Connectivity** | MQTT + SparkplugB |
| **Data Entry** | Manual entry + CSV/Excel import |
| **Plants** | Single plant |
| **Auth** | JWT + RBAC (4-tier: operator/supervisor/engineer/admin) |
| **Real-time** | WebSocket updates |
| **API** | Full REST API |
| **Deployment** | Docker (multi-stage image) |
| **UX** | Annotations, kiosk mode, themes (retro/glass), light/dark |
| **Show Your Work** | Full computation transparency (KaTeX formulas, step-by-step, AIAG citations) |

**Philosophy:** The Community Edition is genuinely powerful — all chart types, all Nelson rules, basic capability, MQTT, Docker, REST API, Show Your Work. This is the distribution engine that drives adoption.

### Commercial Edition (Licensed)

Everything in Community, plus:

| Category | Features |
|----------|----------|
| **Plants** | Multi-plant (up to `max_plants` in license) |
| **Auth** | SSO/OIDC, password policies |
| **Compliance** | Electronic signatures (21 CFR Part 11), audit trail, retention policies + purge |
| **Notifications** | SMTP email, HMAC webhooks, PWA push |
| **Connectivity** | OPC-UA, RS-232/USB gage bridge |
| **Integration** | ERP/LIMS connectors (SAP OData, Oracle REST, generic LIMS, webhook) |
| **Statistical** | Non-normal distributions, custom run rules, Laney p'/u', short-run charts, MSA/Gage R&R, FAI (AS9102) |
| **Analytics** | AI/ML anomaly detection, DOE, multivariate SPC, predictive analytics, AI/LLM insights |
| **Operational** | Scheduled reports, Show Your Work |
| **Support** | Priority email (Pro) or dedicated account manager (Enterprise) |

### Pricing Tiers (Commercial Distinction, Not Code Distinction)

All commercial tiers unlock the same code. Differences are:

| | Professional | Enterprise | Enterprise Plus |
|---|---|---|---|
| **Price** | $500/mo (~$5K/yr) | $2,500/mo (~$25K/yr) | Custom ($50K–$150K/yr) |
| **Max Plants** | 5 | Unlimited | Unlimited |
| **Support SLA** | 48hr email | 24hr + named account mgr | Dedicated Slack/Teams |
| **Extras** | — | Validation doc package | Custom integration engineering, training, compliance gap analysis |

---

## 3. Backend Feature Gating

### LicenseService

```
backend/src/cassini/core/licensing.py
```

- Loads and validates license JWT on startup using embedded Ed25519 public key
- Cached in application state (FastAPI lifespan)
- Exposes: `is_commercial`, `max_plants`, `days_until_expiry`, `tier_label`

### Conditional Router Registration

In `main.py`, enterprise routers are only registered if `license_service.is_commercial`:

**Always registered (Community):**
- `auth`, `characteristics`, `samples`, `violations`, `hierarchy`, `users`, `plants`, `data_entry`, `health`, `websocket`, `annotations`, `tags`, `capability` (basic), `explain` (Show Your Work)

**Commercial only:**
- `signatures`, `audit`, `anomaly`, `erp_connectors`, `oidc`, `notifications`, `push`, `retention`, `msa`, `fai`, `doe`, `multivariate`, `predictions`, `ai_analysis`, `gage_bridges`, `opcua_servers`, `scheduled_reports`, `system_settings` (advanced), `api_keys`, `database_admin`

**Key principle:** Enterprise endpoints simply don't exist in Community. Requests return 404, not 403. No code runs, no attack surface.

### Conditional Middleware

- `AuditMiddleware` — registered only if commercial
- Enterprise event bus subscribers (`AnomalyDetector`, `NotificationDispatcher`, `AuditEnricher`, `ERPOutboundPublisher`, `PushService`) — registered only if commercial

### Plant Limit Enforcement

`create_plant` endpoint checks `license.max_plants` before allowing new plant creation.

### Schema Strategy

All tables exist in every edition. Enterprise-only columns on shared models (e.g., `characteristic.distribution_method`, `characteristic.use_laney_correction`) remain in schema but are unused in Community. No schema branching — one migration chain for all editions.

---

## 4. Frontend Feature Gating

### License Status Endpoint

`GET /api/v1/license/status` (always registered, unauthenticated):

```json
// Community
{ "edition": "community", "tier": "community", "max_plants": 1 }

// Commercial
{
  "edition": "commercial",
  "tier": "enterprise",
  "max_plants": 20,
  "expires_at": "2027-03-01",
  "days_until_expiry": 365
}
```

### License Store + Hook

```
frontend/src/stores/licenseStore.ts   — Zustand store
frontend/src/hooks/useLicense.ts      — { isCommercial, tier, maxPlants }
```

Fetched once on app load, cached.

### FeatureGate Component

```
frontend/src/components/FeatureGate.tsx
```

Wraps enterprise UI elements. In Community, renders an optional fallback (upgrade prompt) or nothing.

```tsx
<FeatureGate fallback={<UpgradeBanner feature="Anomaly Detection" />}>
  <AnomalyOverlay chartInstance={chart} />
</FeatureGate>
```

### Route-Level Gating

Enterprise pages (MSA, FAI, DOE, Analytics) get a route guard that redirects to an upgrade page in Community.

### Upgrade Prompts

Where enterprise features would appear in Community, show a tasteful "Available in Cassini Commercial" card linking to the pricing page. These are the conversion funnel — not aggressive, not hidden.

### Navigation Adaptation

Sidebar/nav items for commercial-only pages are either hidden or shown with a lock icon + "Commercial" badge, depending on which drives more conversions (test both).

---

## 5. Licensing & Legal

### Dual License Model

```
LICENSE              → AGPL-3.0 (default for all code in repo)
LICENSE-COMMERCIAL   → Commercial license terms (contact sales@saturnis.io)
```

- **AGPL-3.0** — anyone can use, modify, deploy. Must open-source modifications if deployed as a network service
- **Commercial license** — purchased alongside license key. Allows proprietary modifications without AGPL obligations
- This is the Cal.com / MongoDB / early-GitLab model

### Why AGPL Is Sufficient Protection

1. **Manufacturing companies audit their software.** FDA/ISO/IATF auditors ask "what software do you use?" Using modified AGPL software without compliance is a finding.
2. **AGPL requires source sharing for any modification.** Removing license checks IS a modification. Deploying it (even internally) as a web service triggers the obligation.
3. **Risk/reward is terrible for violators.** Save $5K–$25K/year vs. lawsuit exposure + audit finding + career risk for the quality manager who signed off.
4. **Target market self-polices.** Regulated manufacturers with $50M+ revenue have procurement, legal, and compliance departments. They buy software properly.
5. **Escalation path:** If AGPL proves insufficient, switch to BSL 1.1 (Business Source License) which explicitly prohibits production use without a license. Can always tighten, harder to loosen.

---

## 6. Distribution & Packaging

### Single Artifact

One Docker image. One GitHub release. The presence or absence of `license.key` is the only difference.

```bash
# Community (no license)
docker run -p 8000:8000 ghcr.io/saturnis/cassini:latest

# Commercial (mount license file)
docker run -p 8000:8000 -v ./license.key:/app/license.key ghcr.io/saturnis/cassini:latest
```

### Distribution Channels

| Channel | Purpose |
|---------|---------|
| GitHub (public, AGPL-3.0) | Source code, issues, community |
| GitHub Releases | Versioned tarballs, changelogs |
| GHCR / Docker Hub | Container images (`latest`, `x.y.z` tags) |
| PyPI (`cassini-bridge`) | Shop floor gage bridge package |
| Website | Docs, pricing, license purchase |

### New Files Required

```
backend/src/cassini/core/licensing.py      # License validation + LicenseService
frontend/src/components/FeatureGate.tsx     # UI feature gate component
frontend/src/stores/licenseStore.ts         # License state store
frontend/src/hooks/useLicense.ts            # License hook
frontend/src/pages/UpgradePage.tsx          # "Upgrade to Commercial" page
LICENSE                                     # AGPL-3.0
LICENSE-COMMERCIAL.md                       # Commercial license terms
```

---

## 7. Sales Infrastructure

### Website Pages

1. **Landing page** (`/`) — product overview, hero screenshot, "Get Started" CTA
2. **Pricing page** (`/pricing`) — Community / Professional / Enterprise / Enterprise Plus comparison table
3. **Documentation** (`/docs`) — installation, configuration, API reference, tutorials
4. **License portal** (`/account`) — customer dashboard for license keys, billing, expiry

### Purchase Flow

**Professional (self-serve):**
```
Pricing → "Start Trial" → email signup →
  14-day trial license auto-emailed →
  Stripe checkout ($500/mo or $5,000/yr) →
  License key generated + emailed →
  Paste into deployment
```

**Enterprise (sales-assisted):**
```
Pricing → "Contact Sales" → intake form →
  Demo call (Calendly) →
  30-day evaluation license →
  SOW/PO process →
  License key issued →
  Onboarding call
```

### License Key Generation

Internal CLI tool (never shipped):

```bash
cassini-admin generate-license \
  --customer "Acme Manufacturing" \
  --email "quality@acme.com" \
  --tier enterprise \
  --max-plants 20 \
  --expires 2027-03-01
```

Signs JWT with Ed25519 private key held in Saturnis infrastructure only.

### Trial Licenses

- **Professional:** 14-day, auto-generated, max 2 plants
- **Enterprise:** 30-day, manually issued, max 5 plants
- Identical to paid licenses with short expiry
- App shows "Trial: X days remaining" banner
- After expiry → graceful degradation (read-only), not bricking

---

## 8. Go-to-Market Phasing

### Phase 1: Distribution (Now → 6 months)

- Ship Community on GitHub + Docker Hub
- Build GitHub stars, LinkedIn content, quality engineering forum presence
- Write docs, tutorials, demo videos
- No pricing page yet — pure adoption focus
- KPIs: downloads, Docker pulls, GitHub stars, community deployments

### Phase 2: Self-Serve Professional (6–12 months)

- Launch website with pricing page
- Stripe integration for Professional tier
- Automated trial → purchase → license delivery
- Support via email (founder-led at this scale)
- Target: 20–50 customers, $10K–$25K MRR

### Phase 3: Enterprise Sales (12–18 months)

- Community users hitting compliance needs become inbound leads
- Demo → evaluation → SOW → onboarding flow
- Validation documentation packages (IQ/OQ templates)
- Target: 5–15 enterprise customers, $125K–$500K ARR

### Phase 4: Scale (18–24 months)

- Production references drive enterprise sales
- "We passed our FDA audit on Cassini" = $1M+ in marketing value
- Target: $1M+ ARR

### What You Don't Need Yet

- Sales team (you are sales until ~$500K ARR)
- CRM (spreadsheet until 50+ leads)
- Marketing automation (email list + manual follow-up)

---

## 9. Codebase Separation Feasibility

### Easy to Gate (event-driven, loosely coupled)

- Anomaly Detection — event bus subscriber, 7 files, 1 model
- E-Signatures — pluggable workflow engine, 3 files, 6 tables
- Push Notifications — event bus subscriber, 2 files, 1 table
- ERP Connectors — pluggable sync engine, 6 files, 4 tables
- SSO/OIDC — plugs into auth, 3 files
- Data Retention — cron-driven purge, 3 files, 2 tables
- Gage Bridge — separate provider, 5 files, 2 tables

### Moderate Effort (conditional middleware/imports)

- Audit Trail — conditional middleware registration + audit context enrichment
- Notifications (SMTP/Webhook) — event bus subscriber + system settings UI
- Capability (advanced) — distribution_method column on characteristic model

### Frontend Refactoring Needed

- OperatorDashboard imports `CapabilityCard`, `PendingApprovalsDashboard`, `Explainable`, `DiagnoseTab` — wrap in `<FeatureGate>`
- Settings page has 15+ sub-tabs — conditionally render commercial tabs
- Navigation — hide or badge commercial-only menu items
- MSA/FAI/DOE/Analytics pages — route-level gate

### Schema

All tables remain. Enterprise-only columns on shared models stay but are unused in Community. No schema branching.

---

## 10. Implementation Sequence

1. **`core/licensing.py`** — LicenseService, JWT validation, Ed25519 public key
2. **`api/v1/license.py`** — `/license/status` endpoint
3. **Conditional router registration** — gate enterprise routers in `main.py`
4. **Conditional middleware/subscribers** — gate audit, notifications, anomaly
5. **Plant limit enforcement** — check `max_plants` in create_plant
6. **Frontend `licenseStore` + `useLicense` + `FeatureGate`** — core gating infrastructure
7. **Wrap enterprise UI** — FeatureGate around commercial components
8. **Route guards** — enterprise page protection + UpgradePage
9. **Navigation adaptation** — sidebar badges/hiding
10. **License generation CLI** — internal tooling (separate repo)
11. **AGPL-3.0 license file** — replace current LICENSE
12. **Website** — landing, pricing, docs (Phase 2)
