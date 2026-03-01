# Cassini Documentation & Licensing Overhaul — Design

**Date:** 2026-03-01
**Status:** Approved
**Scope:** README rewrite, open-core feature matrix, supporting docs, .gitignore hardening, license portal spec

---

## 1. README.md Restructure

Rewrite with clear open-core positioning:

1. **Hero** — ASCII art + tagline + shields (AGPL-3.0 badge, tech badges)
2. **One-liner** — "Open-source SPC for manufacturing. Free forever, commercially supported."
3. **Screenshot** — Fresh Playwright dashboard capture
4. **Quick Start** — Docker + manual setup (keep existing)
5. **Community Edition Features** — Full sections with screenshots for free features
6. **Commercial Features** — "Unlock with a license" with screenshots + upgrade CTA
7. **Feature Comparison Matrix** — Community vs Professional vs Enterprise table
8. **Architecture** — Keep existing diagram, update stats
9. **Development** — Keep existing dev commands
10. **License & Commercial Use** — Professional-friendly AGPL compliance section
11. **Links** — Docs site, pricing portal, support channels

### Tone
- Professional-friendly: "We love open source, and AGPL protects that"
- Position commercial license as the easy path, not a threat
- Celebrate the Community Edition's completeness

## 2. Feature Comparison Matrix

Three-tier matrix based on existing pricing strategy:

| Category | Feature | Community | Professional | Enterprise |
|----------|---------|:---------:|:------------:|:----------:|
| **Charts** | X-bar, I-MR, CUSUM, EWMA, p/np/c/u | Yes | Yes | Yes |
| **Charts** | Short-run (deviation/Z-score) | Yes | Yes | Yes |
| **Charts** | Custom run rule presets | Yes | Yes | Yes |
| **Charts** | Laney p'/u' correction | Yes | Yes | Yes |
| **Capability** | Cp/Cpk/Pp/Ppk/Cpm | Yes | Yes | Yes |
| **Capability** | Non-normal distribution fitting | Yes | Yes | Yes |
| **Capability** | Show Your Work explanations | Yes | Yes | Yes |
| **Data** | Manual entry, CSV/Excel import | Yes | Yes | Yes |
| **Data** | MQTT/Sparkplug B connectivity | Yes | Yes | Yes |
| **Infra** | Docker deployment | Yes | Yes | Yes |
| **Infra** | REST API + WebSocket | Yes | Yes | Yes |
| **Infra** | Single plant | Yes | Yes | Yes |
| **Infra** | 4-tier RBAC | Yes | Yes | Yes |
| **Infra** | Multi-database (SQLite/PG/MySQL/MSSQL) | Yes | Yes | Yes |
| **Plants** | Multi-plant (up to 5) | — | Yes | Yes |
| **Plants** | Unlimited plants | — | — | Yes |
| **Auth** | SSO/OIDC integration | — | Yes | Yes |
| **Notify** | Email notifications | — | Yes | Yes |
| **Notify** | Webhook notifications (HMAC) | — | Yes | Yes |
| **Notify** | Push notifications (PWA) | — | Yes | Yes |
| **Reports** | Scheduled report delivery | — | Yes | Yes |
| **Data** | Data retention policies | — | Yes | Yes |
| **Connectivity** | OPC-UA integration | — | Yes | Yes |
| **Connectivity** | RS-232/USB gage bridge | — | Yes | Yes |
| **Compliance** | Electronic signatures (21 CFR Part 11) | — | — | Yes |
| **Compliance** | Full audit trail | — | — | Yes |
| **Compliance** | Password policies | — | — | Yes |
| **Studies** | Gage R&R / MSA (AIAG) | — | — | Yes |
| **Studies** | FAI (AS9102 Rev C) | — | — | Yes |
| **Studies** | Design of Experiments | — | — | Yes |
| **Analytics** | AI/ML anomaly detection | — | — | Yes |
| **Analytics** | Multivariate SPC | — | — | Yes |
| **Analytics** | Predictive analytics | — | — | Yes |
| **Analytics** | AI analysis | — | — | Yes |
| **Integration** | ERP/LIMS connectors | — | — | Yes |

## 3. Supporting Documentation

### CONTRIBUTING.md
- Welcome message and contribution types (issues, docs, code, translations)
- Development setup (link to docs/development.md)
- PR process and coding standards
- CLA requirement note (for future)
- Scope: contributions to Community features only; commercial features are maintained by Saturnis

### SECURITY.md
- Responsible disclosure policy
- Contact: security@saturnis.io
- Response timeline commitment (48h acknowledgment, 90-day fix)
- No bounty program (yet)

### CODE_OF_CONDUCT.md
- Contributor Covenant v2.1

## 4. .gitignore Hardening

Add patterns for internal/testing files visible in git status:
```
# Internal testing
.testing/
.swarm/
backend/oq_*.py

# Internal planning (already present but verify)
.planning/
.company/
.claude/
```

## 5. LICENSE-COMMERCIAL.md Enhancement

Expand from stub to full commercial license overview:
- What AGPL-3.0 means for users (network use = source disclosure)
- What commercial license grants (proprietary mods, no source disclosure, warranty)
- Three tiers with pricing
- FAQ: "Do I need a commercial license?" decision tree
- How to purchase (link to portal)

## 6. License Portal Specification Document

Standalone spec at `docs/plans/2026-03-01-license-portal-spec.md`:

### Architecture
- **Frontend**: Next.js on Vercel (or similar)
- **Payments**: Stripe Checkout + Billing Portal
- **License generation**: Ed25519 key signing (matches existing design in open-core doc)
- **Database**: PostgreSQL (Supabase or managed)
- **Auth**: Clerk/Auth0 or Supabase Auth

### User Flows
1. **Discovery**: README → pricing page → "Get Started"
2. **Sign up**: Email/Google → create organization
3. **Choose tier**: Professional ($500/mo) or Enterprise ($2,500/mo)
4. **Payment**: Stripe Checkout → subscription created
5. **License key**: Generated, displayed once, downloadable
6. **Activation**: Drop `license.key` into Cassini install → restart
7. **Management**: Dashboard for billing, key rotation, team seats

### License Key Format
- Ed25519-signed JWT (from existing design)
- Claims: org_id, tier, plant_limit, features[], expires_at
- Fully offline validation (no call-home)
- Graceful degradation on expiry (read-only, not lockout)

### Portal Features
- Organization dashboard
- Billing history + invoices (Stripe Portal)
- License key management (generate, rotate, revoke)
- Team member management
- Usage analytics (optional telemetry)
- Support ticket creation
- Enterprise: "Contact sales" flow for Enterprise Plus

### API Endpoints
- POST /api/licenses — Generate new license key
- GET /api/licenses/:id — Get license details
- POST /api/licenses/:id/rotate — Rotate key
- DELETE /api/licenses/:id — Revoke license
- GET /api/organizations/:id — Org details
- Stripe webhooks for subscription lifecycle

## 7. Playwright Screenshots

Capture from running commercial instance:
- Dashboard with control chart (hero)
- Violations view
- Connectivity Hub
- Settings panel
- MSA/FAI/DOE (commercial features)
- Analytics hub (commercial features)
- Login page

Use captions/annotations in README to mark Community vs Commercial features.
