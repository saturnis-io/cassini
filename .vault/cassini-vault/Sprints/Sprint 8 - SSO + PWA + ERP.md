---
type: sprint
status: complete
created: 2026-03-06
updated: 2026-03-06
branch: main
started: 2026-02-24
completed: 2026-02-24
features:
  - "[[Features/SSO OIDC]]"
  - "[[Features/PWA Push Notifications]]"
  - "[[Features/ERP Connectors]]"
decisions: []
migration_range: 036-038
tags:
  - sprint
  - complete
  - phase-d
  - enterprise-integration
  - sso
  - pwa
  - erp
aliases:
  - Sprint 8
  - Sprint 8 - SSO PWA ERP
  - Sprint 8 - Enterprise Integration
---

## Overview

Sprint 8 merged the originally planned Sprint 3 (SSO/OIDC) with Sprint 8 scope (ERP/Mobile) into a single delivery. It hardened the existing OIDC integration with DB-backed state, added PWA-lite capabilities (push notifications via VAPID, offline queue with IndexedDB), and built a full ERP/LIMS connector framework with 4 adapter types and a cron-based sync engine. This was the largest sprint by model and endpoint count, adding ~7 models and ~48 endpoints.

## Features Delivered

- **WS-A SSO/OIDC** ([[Features/SSO OIDC]])
  - DB-backed state store (replaces in-memory dict -- fixes multi-worker deployments)
  - Claim mapping from OIDC provider to Cassini user attributes
  - Plant-scoped role mapping from OIDC claims
  - Account linking (local account to OIDC identity)
  - RP-initiated logout
  - Nonce validation for replay protection
  - Enhanced SSOSettings UI + AccountLinkingPanel component

- **WS-B PWA-Lite** ([[Features/PWA Push Notifications]])
  - Push notifications via VAPID/pywebpush (event bus subscriber)
  - Offline queue using IndexedDB (auto-flush, 24h TTL, max 1000 entries)
  - Mobile bottom navigation component
  - Responsive polish across existing views
  - Enhanced NotificationsSettings for push subscription management
  - Frontend: `sw-push.ts`, `lib/push-manager.ts`, `lib/offline-queue.ts`

- **WS-C ERP/LIMS Connectors** ([[Features/ERP Connectors]])
  - 4 adapter types: SAP OData, Oracle REST, Generic LIMS, Webhook
  - Sync engine with cron scheduling (croniter)
  - Outbound publisher (event bus driven)
  - 16 API endpoints for connector CRUD, sync triggers, and status
  - Fernet-encrypted `auth_config` for connector credentials
  - HMAC webhook validation for inbound data
  - 7 frontend components in `components/erp/`

## Key Commits

| Hash | Description |
|------|-------------|
| (uncommitted at time of MEMORY.md entry) | Branch: main, ready for commit |

## Migration

**Migration 036** — OIDC hardening:
- DB-backed OIDC state store table
- Claim mapping and role mapping tables

**Migration 037** — Push subscriptions:
- Push subscription table (endpoint, keys, user association)

**Migration 038** — ERP connectors:
- ERP connector configuration table
- Sync history/log tables
- Chain: 035 -> 036 -> 037 -> 038

## Codebase Impact

- **Backend models**: ~45 total (up from ~38 post Sprint 7)
- **Backend routers**: ~29 total (~263 endpoints)
- **Backend repositories**: ~17 total
- **Backend modules**: `core/erp/` (7 files), `core/push_service.py`, `api/v1/erp_connectors.py`, `api/v1/push.py`
- **Frontend**: ~195 files, ~145 components, 14 pages, ~120 React Query hooks
- **Frontend API**: 26 namespaces (erpApi 16 methods, pushApi 4 methods, oidcApi hooks added)
- **Frontend components**: 9 new (AccountLinkingPanel, MobileNav, 7 erp/)
- **PWA files**: `sw-push.ts`, `lib/push-manager.ts`, `lib/offline-queue.ts`
- **New dependencies**: pywebpush>=2.0.0, jsonpath-ng>=1.6.0, croniter>=1.4.0

## Skeptic Review

**6 BLOCKERs fixed:**
1. `pop_state` race condition in OIDC callback handling
2. 4 instances of `str(e)` leaking raw exception messages to API clients
3. Push notification SSRF via unvalidated subscription endpoint URLs

**10 WARNINGs fixed:**
1. Nonce not validated on OIDC callback
2. HMAC bypass possible with empty signature header
3. OData injection via unsanitized filter parameters
4. `__new__` hack in adapter factory (replaced with clean pattern)
5. Offline queue hardening (TTL enforcement, size limits, flush retry)
6-10. Additional security and robustness fixes

## Lessons Learned

- OIDC state must be DB-backed for multi-worker deployments -- in-memory dict loses state across workers
- Never pass `str(e)` to API clients -- this was caught 4 separate times in this sprint alone
- Push notification endpoints must be validated against an allowlist to prevent SSRF
- Offline queue needs hard limits (TTL + max entries) to prevent unbounded IndexedDB growth
- See [[Lessons/Lessons Learned]] for full cross-sprint patterns
