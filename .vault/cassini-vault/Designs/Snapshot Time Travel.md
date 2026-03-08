---
title: Snapshot Time Travel
type: design
status: research
date: 2026-03-07
tags:
  - time-travel
  - versioning
  - audit
  - compliance
  - history
  - FDA
  - control-limits
---

# Snapshot Time Travel

The ability to view the complete process state for any characteristic as it existed at any historical date — not just the measurement data, but the full configuration envelope (control limits, spec limits, Nelson rules, distribution parameters, capability indices).

## Status

**Research complete.** Full feasibility analysis in [[docs/plans/2026-03-07-snapshot-time-travel-research.md]].

## Summary

### The Problem

Control limits, spec limits, and rule configurations are currently **overwritten in-place**. When an auditor asks "what were the control limits on Jan 15?", the answer is "whatever they are now" — which may be wrong if limits were recalculated since. This is a **compliance gap** for FDA 21 CFR Part 11 and AS9100 customers.

### Recommended Approach

**SCD Type 2 (Slowly Changing Dimensions)** with three new version tables:
- `characteristic_config_version` — all chart/capability config fields
- `characteristic_rules_version` — Nelson rule sets as JSON
- `product_limit_version` — per-product limit overrides

Each config change creates a new version row with `valid_from`/`valid_to` ranges. Existing tables remain source of truth for current state (zero perf impact on hot path).

### Why Not Temporal Tables?

SQLite has no temporal table support. PostgreSQL requires extensions. Only MSSQL has full native support. Multi-dialect requirement rules this out.

### Key Findings

- **Storage**: <20 MB for 3 years of a 500-characteristic deployment
- **Performance**: Zero impact on current-state queries; <50ms for historical reconstruction
- **Competitive**: No major SPC tool offers full snapshot time travel. InfinityQS has effective-dated limits only. Significant differentiator.
- **Regulatory**: Directly addresses FDA 11.10(e) audit trail reconstruction, AS9100 traceability, ALCOA+ principles

## Related

- [[Electronic Signatures]] — signatures on limit changes need version linkage
- [[Show Your Work]] — explain API would need to respect historical config
- Full research document: `docs/plans/2026-03-07-snapshot-time-travel-research.md`
