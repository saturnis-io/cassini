---
type: decision
status: active
id: D-001
created: 2026-02-21
updated: 2026-03-06
sprint: "[[Sprints/Sprint 5 - Statistical Credibility]]"
alternatives_considered: 0
tags: [decision]
---

# D-001: Gap Closure Scope and Phasing

**Date:** 2026-02-21
**Status:** DECIDED

## Context

Competitive analysis identified 20+ feature gaps vs commercial SPC tools. A prioritized phasing plan was needed to close them systematically.

## Decision

15 features selected across 5 sprints:

| Sprint | Phase | Features |
|--------|-------|----------|
| [[Sprints/Sprint 5 - Statistical Credibility]] | A | Non-normal capability, custom run rules, Laney p'/u' |
| [[Sprints/Sprint 6 - Compliance Gate]] | B | Gage R&R/MSA, short-run charts, FAI |
| [[Sprints/Sprint 7 - Shop Floor Connectivity]] | C | RS-232/USB gage integration (only) |
| [[Sprints/Sprint 8 - SSO PWA ERP]] | D | ERP connectors, LIMS/MES middleware, native mobile apps |
| [[Sprints/Sprint 9 - Advanced Analytics]] | E | Multivariate SPC, predictive analytics, gen AI analysis, inter-char correlation, DOE |

## Excluded

OPC-DA, CMM integration, barcode entry, semiconductor (SECS/GEM), validation docs (separate sales effort), GAMP 5 mapping.

## Rationale

Sprint order is deliberate: statistical credibility first (internal quality), then compliance gates (market access), then connectivity/integration (enterprise deals), then advanced analytics (leadership position).

## Consequences

- Multi-week/multi-session effort
- Sprint 7 and Sprint 8 (D3) require architecture decisions before implementation (see [[Decisions/D-002 Python Bridge Agent]])
