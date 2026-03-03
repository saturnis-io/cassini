# Cassini SPC Platform — Consolidated Skeptic Audit
**Date**: 2026-03-02
**Method**: 5 parallel expert agents (Backend, Frontend, Architecture, SPC Domain, Security)
**Scope**: Full monorepo — backend, frontend, bridge

---

## Executive Summary

The Cassini codebase is **functional, feature-rich, and ships rapidly** — the core SPC formulas are textbook-correct, the auth infrastructure is sound, and the event bus / open-core license gating patterns are well-designed. However, rapid sprint-based development (8 sprints in ~3 weeks) has accumulated substantive technical debt across all five audit domains.

**By the numbers:**
| Domain | Findings | CRIT | HIGH | MED | LOW |
|--------|----------|------|------|-----|-----|
| Backend | 15 | — | 1 | 8 | 6 |
| Frontend | 16 | — | 2 | 6 | 8 |
| Architecture | 16 | — | 3 | 8 | 5 |
| SPC Domain | 18 | — | 3 | 8 | 7 |
| Security | 22 | 2 | 5 | 9 | 6 |
| **Total** | **87** | **2** | **14** | **39** | **32** |

**Dead code identified**: ~4,000+ lines (1,994 frontend + 150 backend + various architecture)

---

## Critical & High Priority Findings — Consolidated

### Tier 0: CRITICAL (Fix Before Any Release)

| # | Finding | Domain | Location |
|---|---------|--------|----------|
| S-01 | **SQL injection** in MySQL OPTIMIZE TABLE via f-string | Security | `database_admin.py:504-505` |
| S-02 | **No JWT revocation** — tokens valid after password change/deactivation | Security | `core/auth/jwt.py` |

### Tier 1: HIGH (Fix This Sprint)

| # | Finding | Domain | Location |
|---|---------|--------|----------|
| B-01 | `SampleContext(metadata=...)` **crashes at runtime** — field doesn't exist | Backend | `data_entry.py:208` |
| S-03 | OIDC `redirect_uri` **not validated** — open redirect | Security | `oidc.py:107-132` |
| S-04 | WebSocket has **no plant-scoped auth** — any user sees all plants | Security | `websocket.py:290-413` |
| S-05 | Backup endpoint has **path traversal** risk | Security | `database_admin.py:390-469` |
| S-06 | ERP connector **SSRF** — can scan internal networks | Security | `erp_connectors.py`, `sap_odata.py` |
| S-07 | Webhook test **SSRF** — arbitrary URL POST | Security | `notifications.py:575-602` |
| F-01 | **133 instances** of `toast.error(error.message)` leaking backend errors to users | Frontend | All `api/hooks/*.ts` |
| F-02 | Plant ID accessed via **2 competing mechanisms** (12 components bypass PlantProvider) | Frontend | 12 components |
| A-01 | **Repository layer largely bypassed** — 25/44 routers do inline SQL | Architecture | All `api/v1/` |
| A-02 | **Layer violations** — core/db imports from api layer | Architecture | `signature_engine.py`, `characteristic_config.py` |
| A-09 | **Audit trail gaps** — only 6/18 event types audited (21 CFR Part 11 blind spot) | Architecture | `main.py` |
| D-01 | Constants table n=1 row has **n=2 values** (latent correctness risk) | SPC Domain | `constants.py:34` |
| D-02 | **X-bar S chart never computes S-chart limits** — B3/B4 factors absent | SPC Domain | `spc_engine.py:826-831` |
| D-03 | CUSUM/EWMA sigma fallback uses **overall stdev** instead of within-subgroup | SPC Domain | `cusum_engine.py:140`, `ewma_engine.py:162` |

### Cross-Domain Overlaps

Several findings were independently identified by multiple agents:

| Finding | Flagged By |
|---------|-----------|
| `str(e)` leaking to clients (15+ backend + 133 frontend) | Backend, Frontend, Security |
| Duplicate `LicenseService` instantiation | Backend, Architecture |
| God `lifespan()` function (300+ lines) | Backend, Architecture |
| Plant-scoped RBAC gaps | Architecture, Security |
| Webhook HMAC mismatch in test path | Backend, Security |

---

## Findings by Domain — Summary

### Backend (15 findings) — [Full report](2026-03-02-backend.md)

**Key patterns:**
- 3 independent hierarchy-walking implementations (all N+1 queries)
- 2 parallel violation creation codepaths that have diverged
- SPCEngine created per-request in data_entry (cold cache every time)
- TagProviderManager stores stale session from startup

### Frontend (16 findings) — [Full report](2026-03-02-frontend.md)

**Key patterns:**
- 13 dead components (~1,876 lines)
- `ControlChart.tsx` is 1,767 lines with ~1,000-line useMemo
- `quality.ts` hooks is a 636-line kitchen sink mixing 6 domains
- 3 duplicate CharacteristicPicker implementations
- ErrorBoundary missing from 10 of 14 pages

### Architecture (16 findings) — [Full report](2026-03-02-architecture.md)

**Key patterns:**
- Characteristic model is a 37-column god object
- No service layer → duplicate business logic across entry points
- Event bus wiring scattered between main.py and constructors
- Frontend types fragmented across 3+ locations (176 interfaces)
- Sprint 9 modules (predictions, multivariate, DOE) feel bolted-on

### SPC Domain (18 findings) — [Full report](2026-03-02-spc-domain.md)

**Key patterns:**
- No Nelson Rules evaluation on R/S charts (AIAG violation)
- No confidence intervals on capability indices (ISO 22514-2:2017 gap)
- Gage R&R %Tolerance hardcodes 5.15 (some OEMs require 6.0)
- Attribute MSA kappa thresholds stricter than industry practice
- Non-normal capability has no "Show Your Work" instrumentation

**Positive findings** (independently verified):
- Capability formulas (Cp/Cpk/Pp/Ppk/Cpm) are textbook-correct
- Crossed ANOVA Gage R&R matches AIAG MSA 4th Edition
- d2* 2D lookup table is accurate
- Laney p'/u' implementation is correct
- Nelson Rules implementation is clean and parameterizable
- EWMA time-varying limits use exact formula (not just steady-state)

### Security (22 findings) — [Full report](2026-03-02-security.md)

**OWASP Top 10 scorecard:**
| Category | Status |
|----------|--------|
| A01: Broken Access Control | Needs Improvement (5 findings) |
| A02: Cryptographic Failures | Needs Improvement (3 findings) |
| A03: Injection | **FAILING** (SQL injection) |
| A04: Insecure Design | Needs Improvement (2 findings) |
| A05: Security Misconfiguration | Needs Improvement (2 findings) |
| A06: Vulnerable Components | Adequate |
| A07: Auth Failures | **FAILING** (no JWT revocation) |
| A08: Data Integrity | Needs Improvement |
| A09: Logging/Monitoring | Needs Improvement (3 findings) |
| A10: SSRF | Needs Improvement (2 findings) |

---

## Compliance Matrix

| Standard | Status | Key Gaps |
|----------|--------|----------|
| AIAG SPC 2nd Ed | Partially Compliant | No R/S chart rules, no S-chart limits for n>10, no capability CIs |
| AIAG MSA 4th Ed | Mostly Compliant | %Tolerance multiplier not configurable, strict kappa thresholds |
| AS9102 Rev C | Mostly Compliant | Separation of duties API-level only, no e-signature integration |
| 21 CFR Part 11 | Partially Compliant | Audit gaps for background ops, no capability CIs, signature hashes lack HMAC |
| ISO 22514-2:2017 | Partially Compliant | Missing confidence intervals on Cp/Cpk |
| OWASP Top 10 | Needs Work | 2 CRITICAL, 5 HIGH across A01/A03/A07/A10 |

---

## Recommended Remediation Roadmap

### Wave 1: Immediate (before next release)
1. Fix SQL injection in MySQL OPTIMIZE TABLE (`database_admin.py`)
2. Add JWT revocation mechanism (embed `password_changed_at` in token, check on verify)
3. Fix `SampleContext(metadata=...)` runtime crash
4. Validate OIDC `redirect_uri` against allowlist
5. Add plant-scoped auth to WebSocket subscriptions
6. Remove/restrict backup `backup_dir` parameter

### Wave 2: Short-term (next sprint)
7. Add URL validation for ERP/webhook SSRF (block private IPs)
8. Default `cookie_secure` to `True`
9. Create shared `handleMutationError` utility (fix 133 `toast.error` leaks)
10. Fix CUSUM/EWMA sigma estimation (use within-subgroup, not overall)
11. Add missing audit event subscriptions (SampleProcessed, signatures, purge)
12. Fix layer violations (move `ROLE_HIERARCHY` to `core/auth/roles.py`)
13. Fix backend `str(e)` leaks (15+ instances)
14. Add USL > LSL validation to normal capability

### Wave 3: Medium-term (2-3 sprints)
15. Add B3/B4 constants and S-chart limit computation
16. Implement Nelson Rules on R/S charts (at minimum Rule 1)
17. Add capability confidence intervals (chi-squared for Cp, noncentral-t for Cpk)
18. Delete ~4,000 lines of dead code (13 components, unused hooks, `nul` file)
19. Consolidate 3 hierarchy-walking implementations into `HierarchyRepository`
20. Consolidate 2 violation creation codepaths
21. Make `RollingWindowManager` a shared singleton
22. Standardize PlantProvider usage (eliminate raw store access)
23. Add ErrorBoundary to remaining 10 pages
24. Add HMAC secret to electronic signature hashes
25. Make GRR %Tolerance multiplier configurable (5.15/6.0)

### Wave 4: Backlog (strategic debt)
26. Extract service layer (start with SampleService)
27. Begin repository extraction for Sprint 9 modules
28. Split ControlChart.tsx (~1,767 lines) into composable pieces
29. Split quality.ts hooks into domain-specific files
30. Consolidate frontend types into `types/` directory
31. Satellite tables for Characteristic god object (37 columns)
32. Extract lifespan() into named initialization functions
33. Move heavy optional deps to extras (`pip install cassini[all]`)
34. Add e-signature integration to FAI/MSA approval workflows
35. Add pagination to commercial list endpoints

---

## Statistics

- **Total unique findings**: 87
- **CRITICAL**: 2
- **HIGH**: 14
- **MEDIUM**: 39
- **LOW**: 32
- **Dead code identified**: ~4,000+ lines
- **Cross-domain overlaps**: 5 findings flagged by multiple agents
- **Files audited**: ~200+ across backend, frontend, and bridge
- **Symbols analyzed**: 7,217 (via GitNexus knowledge graph)
