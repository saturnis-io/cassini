# Gap Closure — Current State

> **Read this file first at the start of every session.**
> It tells you where we are, what's done, and what to do next.

**Last updated:** 2026-02-25
**Active sprint:** Post-Sprint 9 — Skeptic Audit Complete
**Branch:** `main`

---

## Progress Overview

| Sprint | Phase | Theme | Status | Notes |
|--------|-------|-------|--------|-------|
| 5 | A | Statistical Credibility | **COMPLETE** | 5 commits, skeptic-reviewed, 3 BLOCKERs fixed |
| 6 | B | Automotive/Aerospace | **COMPLETE** | 10 commits, skeptic-reviewed, 3 BLOCKERs fixed |
| 7 | C | Shop Floor Connectivity | **COMPLETE** | 7 commits, skeptic-reviewed, 3 BLOCKERs fixed |
| 8 | D | Enterprise Integration | **COMPLETE** | Merged with Sprint 3 (SSO). 3 migrations (036-038), ~40 new/modified files, skeptic-reviewed (6 BLOCKERs + 10 WARNINGs fixed) |
| 9 | E | Advanced Analytics | **COMPLETE** | Migration 039, multivariate T²/MEWMA, predictive ARIMA, gen AI analysis, correlation, DOE factorial |
| Audit | — | Cross-Sprint Skeptic Review | **COMPLETE** | 8 parallel agents, 19 confirmed BLOCKERs fixed, 47 WARNINGs (30+ fixed), 2 new migrations (040-041) |

---

## Completed Features

| Feature | Sprint | Commits | Notes |
|---------|--------|---------|-------|
| A1: Non-Normal Capability | 5 | eadff32 | Box-Cox, percentile, 6-family distribution fitting, auto-cascade |
| A2: Custom Run Rules | 5 | 5420ba8 | 8 parameterized Nelson rules, 4 presets (Nelson/AIAG/WECO/Wheeler) |
| A3: Laney p'/u' Charts | 5 | ca14f5a | σ_z overdispersion correction, per-point Laney limits |
| Sprint 5 Schema | 5 | 1b1154d | Migration 032: 4 char columns, parameters on rules, rule_preset table |
| Sprint 5 Skeptic Fixes | 5 | 1d56013 | 3 BLOCKERs + 4 WARNINGs fixed |
| B1: Gage R&R / MSA | 6 | multiple | Crossed ANOVA, range, nested methods; 2D d2* table; GageRREngine + AttributeMSAEngine; 12 API endpoints; MSA wizard + results UI |
| B2: Short-Run Charts | 6 | multiple | Deviation mode + standardized Z-score mode; spc_engine.py transform; CharacteristicForm dropdown; ControlChart axis labels |
| B3: First Article Inspection | 6 | multiple | AS9102 Rev C Forms 1/2/3; draft→submitted→approved workflow; separation of duties (approver≠submitter); 12 API endpoints; FAI editor + print view |
| Sprint 6 Schema | 6 | migration 033 | 6 tables (msa_study, msa_operator, msa_part, msa_measurement, fai_report, fai_item) + short_run_mode on characteristic |
| Sprint 6 Skeptic Fixes | 6 | 4f796c5 | 3 BLOCKERs (d2* 2D lookup, Z-score sigma/sqrt(n), FAI separation of duties) + 5 WARNINGs fixed |
| Test Seeds + DevTools | 6 | 7349655 | 5 seed scripts (sprints 5-9), testing READMEs, DevTools two-section layout |
| C1: RS-232/USB Gage Integration | 7 | bb97fc6..b77961b | Python bridge agent (serial→MQTT), migration 034+035, 12 API endpoints, bridge package (parsers/CLI/runner), Gages tab in Connectivity Hub |
| Sprint 7 Skeptic Fixes | 7 | b77961b | 3 BLOCKERs (config URL mismatch, JSON keys mismatch, dual-mapping bug) + 5 WARNINGs fixed |
| Sprint 3/8 Merged: SSO + PWA + ERP | 8 | (uncommitted) | SSO/OIDC hardening (DB-backed state, claim mapping, account linking, RP-initiated logout), PWA-lite (push notifications, offline queue, mobile nav), ERP/LIMS (4 adapters, 16 endpoints, webhook HMAC, sync engine) |
| Sprint 8 Skeptic Fixes | 8 | (uncommitted) | 6 BLOCKERs (pop_state race, 4× str(e) leaks, push SSRF) + 10 WARNINGs (nonce validation, HMAC bypass, OData injection, offline queue hardening, etc.) |

---

## Active Decisions Needed

| ID | Question | Options | Status |
|----|----------|---------|--------|
| D-002 | RS-232 gage architecture | WebSerial vs Python bridge vs Electron | **DECIDED** — Python bridge agent |
| D-003 | Mobile architecture | PWA vs React Native vs responsive-only | **DECIDED** — PWA-lite (Sprint 8) |

---

## Blockers

*(None)*

---

## Session Log

| Date | Session | What Happened |
|------|---------|---------------|
| 2026-02-21 | Planning | Created gap-closure roadmap, STATE, DECISIONS files. Defined 15 features across 5 sprints. |
| 2026-02-21 | Sprint 5 Design | Explored code (capability.py, nelson_rules.py, attribute_engine.py). Designed 3 approaches: A1=auto-cascade (Box-Cox→dist fit→percentile), A2=parameterized rules+presets, A3=Laney toggle. User approved. Wrote design doc + implementation plan. |
| 2026-02-22 | Sprint 5 Execute | 4-agent team (A1+A2+A3 parallel, then Skeptic). Migration committed, 3 features implemented, skeptic found 3 BLOCKERs (params not applied in SPC engine, Box-Cox Cp==Pp, no param validation) + 4 WARNINGs. All fixed. 5 commits total. |
| 2026-02-22 | Sprint 6 Design | Brainstormed 3 features (B1 Gage R&R, B2 Short-Run, B3 FAI). Wrote design doc + implementation plan. 10-task plan. |
| 2026-02-22 | Sprint 6 Execute | 6-wave subagent execution. Migration 033, MSA engine (ANOVA/range/nested/attribute), FAI API with separation of duties, short-run transform, full frontend (MSA wizard, FAI editor, short-run charts). Skeptic found 3 BLOCKERs — all fixed. |
| 2026-02-22 | Sprint 6 Seeds | Updated seed_test_sprint6.py to populate actual MSA/FAI tables. Updated testing README to "Complete". |
| 2026-02-23 | Sprint 7 Design | Architecture decision D-002 (Python bridge agent). 3-component design: bridge package, backend API, Gages tab. Design doc + 9-task implementation plan. |
| 2026-02-23 | Sprint 7 Execute | 6 implementation commits + 1 skeptic fix. Migration 034+035, 12 API endpoints (incl /my-config), bridge package (parsers, CLI, runner), frontend API layer + 5 Gages tab components, test seed updated. Skeptic found 3 BLOCKERs + 7 WARNINGs — all critical issues fixed. |
| 2026-02-24 | Sprint 3/8 Design | Merged Sprint 3 (SSO/OIDC) + Sprint 8 (ERP/LIMS/Mobile) into single sprint. Detailed plan: 3 workstreams (WS-A SSO hardening, WS-B PWA-lite, WS-C ERP/LIMS), 3 migrations (036-038), 4 execution waves. |
| 2026-02-24 | Sprint 3/8 Execute | 4-wave subagent execution. Wave 1: migrations + models. Wave 2: 4 parallel backend agents (OIDC service, Push+OIDC API, ERP adapters, ERP engine+API). Wave 3: 4 parallel frontend agents (SSO UI, PWA core, offline+mobile, ERP UI). Wave 4: integration wiring + skeptic review. |
| 2026-02-24 | Sprint 8 Skeptic | Full security review: 6 BLOCKERs fixed (pop_state race condition, 4× str(e) leaks, push SSRF), 10 WARNINGs fixed (nonce validation, HMAC bypass, OData injection, __new__ hack, offline queue hardening). 263 routes, 0 TS errors. |
| 2026-02-25 | Cross-Sprint Skeptic Audit | 8 parallel skeptic agents (Stats, Security, API, State, Data, Bridge, Signatures, Audit) + 1 validator. 106 raw findings → 22 BLOCKERs (19 confirmed), 47 WARNINGs. 4 parallel fix streams. See `.planning/gap-closure/SKEPTIC-REVIEW-REPORT.md`. |
| 2026-02-25 | Deferred Items Closure | All 10 deferred items resolved in 4 parallel streams. Stream A: SIG-006/007/008/009 (content hashing, workflow enforcement, expiration sweep, password policy). Stream B: SIG-001/002/003 (signature integration in FAI/MSA/retention — backend + SignatureDialog frontend). Stream C: BRIDGE-002/004/005 (MQTT reconnection, sync overlap lock, push retry). Stream D: STAT-005 + AUDIT-005 (Blom Q-Q quantiles, event bus audit subscribers). |

---

## Next Action

**All sprints and deferred items complete.** CLAUDE.md updated with cross-cutting requirements (audit trail, electronic signatures, API contracts).

Remaining:
1. **Commit all changes** and tag release.
2. **Regenerate knowledge graph** (`/knowledge-graph`) — stale after Sprint 8/9 + deferred items.
3. **Consider additional WARNING items** from skeptic review that were not addressed (see SKEPTIC-REVIEW-REPORT.md WARNING section for items like SEC-005 redirect_uri validation, BRIDGE-003 serial port unplug, etc.).
