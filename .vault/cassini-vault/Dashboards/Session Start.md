---
type: dashboard
status: active
created: 2026-03-06
updated: 2026-03-08
tags:
  - active
  - dashboard
---

# Session Start

> Read this note first at the start of every session.

## Quick Status

| Field | Value |
|-------|-------|
| Branch | `feature/material-management` (active), `fix/material-override-spc-integration` |
| Active Sprint | Post-Sprint 9 -- Feature development phase |
| Last Updated | 2026-03-08 |
| Blockers | None |
| Tier 1 Score | 8/8 -- competitive parity achieved |

All 5 gap-closure sprints (5--9) and the cross-sprint skeptic audit are **complete**. Material management feature implemented with full SPC integration. Open-core licensing strategy decided ([[D-003 Licensing Strategy]]).

## Recent Work (2026-03-08)

1. **Material Management SPC Integration** -- all SPC paths (Shewhart, CUSUM, EWMA, attribute) now resolve material-specific limit overrides via MaterialResolver cascade. Rolling window partitioned by `(char_id, material_id)` to prevent Nelson Rule cross-contamination. 14 files changed, 720 tests passing. Commit `bb70b4e`.
2. **D-003 Licensing Strategy** -- Signed JWT keys for v1, Ignition-style offline activation exchange for v1.x.

## Remaining Work

1. Merge `fix/material-override-spc-integration` to main
2. Regenerate knowledge graph -- stale after Sprint 8/9 + material management
3. Address remaining WARNING items from skeptic review (see `SKEPTIC-REVIEW-REPORT.md`)
4. Frontend material selector integration for CUSUM/EWMA/attribute chart views

## Session Start Checklist

- [ ] Read [[Lessons Learned]] -- internalize past mistakes before repeating them
- [ ] Read this note -- know what sprint/phase is active
- [ ] Identify which cross-cutting requirements apply to the current task:
    - [[Audit Trail Checklist]]
    - [[Electronic Signatures Checklist]]
    - [[API Contract Checklist]]
- [ ] Check [[Pitfalls]] for relevant gotchas

## Key Links

- [[Roadmap]] -- scope source of truth (15 features across 5 sprints)
- [[Lessons Learned]] -- recurring patterns and rules
- [[Pitfalls]] -- backend and frontend rules that prevent bugs
- [[Decisions]] -- architecture decision records
- [[Project Status]] -- codebase stats and milestone timeline

### Sprint Notes

- [[Sprint 5 - Statistical Credibility]]
- [[Sprint 6 - Compliance Gate]]
- [[Sprint 7 - Shop Floor Connectivity]]
- [[Sprint 8 - Enterprise Integration]]
- [[Sprint 9 - Advanced Analytics]]
