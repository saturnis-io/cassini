---
type: decision
status: active
id: D-003
created: 2026-03-08
updated: 2026-03-08
sprint: "[[Strategy/Open-Core Strategy]]"
alternatives_considered: 4
tags: [decision, licensing, open-core]
---

# D-003: Licensing Strategy

**Date:** 2026-03-08
**Status:** DECIDED

## Context

Cassini is moving to an open-core model with a commercial extension package. We need a licensing mechanism that validates entitlements (feature flags, seat limits, expiry) while respecting the reality that manufacturing environments are frequently air-gapped and uptime is sacred. Customers in this space are familiar with Ignition's activation model.

## Options Considered

| # | Option | Pros | Cons |
|---|--------|------|------|
| 1 | **Signed JWT license keys** | Simple paste-and-go, no network required, easy to implement | No machine binding, no seat management, revocation only via expiry |
| 2 | **Online license validation** | Real-time revocation, usage analytics, seat enforcement | Requires internet, single point of failure, unacceptable for air-gapped plants |
| 3 | **Hybrid (online with offline fallback)** | Best of both when connected | Complex failure modes, grace period logic, customers distrust "phone home" |
| 4 | **Offline activation exchange (Ignition model)** | Machine binding, seat management, deactivation -- all air-gap compatible | Requires customer portal, activation file exchange UX, more complex implementation |

## Decision

**Option 1 for v1**, with upgrade path to **Option 4 in v1.x**.

- **v1**: Signed license keys -- JWT containing entitlements + expiry, validated against a bundled public key. Customer pastes the key and goes. No phone-home. Revocation via expiry/non-renewal.
- **v1.x**: Upgrade to Ignition-style offline activation exchange -- activation request file generated on-site, uploaded to saturnis.io portal, signed activation certificate downloaded and applied. Enables machine binding, seat management, and deactivation while remaining fully air-gap compatible.

## Rationale

- Manufacturing environments are air-gapped -- online validation is a non-starter for v1
- Uptime is sacred -- licensing must never block production. Signed keys validate locally with zero network dependency
- Customers in this space are familiar with Ignition's activation flow (Inductive Automation), so Option 4 is a natural evolution
- v1 signed keys are fast to implement and sufficient for early commercial customers
- Option 4 (offline activation exchange) requires the saturnis.io customer portal to exist first -- premature for v1
- The upgrade from Option 1 → Option 4 is additive (activation exchange wraps key generation), not a breaking change

## Consequences

- v1 license keys are simple JWTs -- no machine binding means a key can be copied between instances (acceptable risk for early customers with trust-based relationships)
- Revocation in v1 is limited to key expiry and non-renewal -- no immediate remote revocation
- saturnis.io customer portal must be built before v1.x activation exchange can ship
- v1.x activation exchange adds: activation request file generation, portal-side certificate signing, machine fingerprinting, seat tracking, deactivation workflow
- Key rotation: public key is bundled with the application; rotating signing keys requires a release

## Related

- [[Strategy/Open-Core Strategy]] -- Commercial model context
- [[Decisions/D-001 Polymorphic Data Sources]] -- Extension architecture pattern
