---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/WS-6 Records Retention]]"
tags:
  - feature
  - active
aliases:
  - Data Retention
  - Purge Engine
---

# Records Retention

Configurable data retention policies with inheritance chain resolution and a purge engine for controlled data deletion. Policies can be scoped at three levels: plant-global, hierarchy, or individual characteristic. The purge engine resolves the effective policy via inheritance (characteristic -> parent hierarchy -> ... -> plant global) and deletes expired samples/violations with full history tracking.

## Key Backend Components

- **Purge Engine**: `core/purge_engine.py` -- `execute(plant_id)`, `resolve_policy(char_id)` with inheritance chain
- **Models**: `RetentionPolicy` in `db/models/retention_policy.py`; `PurgeHistory` in `db/models/purge_history.py`
- **Router**: `api/v1/retention.py` -- 10 endpoints (policy CRUD, resolve, tree, purge, preview, history)
- **Repositories**: `db/repositories/retention.py`, `db/repositories/purge_history.py`
- **Migration**: 021 (retention_policy with CHECK constraints, purge_history)

## Key Frontend Components

- `RetentionSettings.tsx` -- policy list and management
- `RetentionTreeBrowser.tsx` -- visual hierarchy tree showing policy inheritance
- `RetentionPolicyForm.tsx` -- create/edit policy with scope selection
- `RetentionOverridePanel.tsx` -- override inherited policy at a specific scope
- `InheritanceChain.tsx` -- shows resolved policy chain for a characteristic
- Hooks: `useRetentionPolicies`, `useRetentionTree`, `useResolveRetention`, `usePurge`

## Connections

- Deletes data from [[SPC Engine]] (samples, violations) and related tables
- Purge authorization optionally requires [[Electronic Signatures]]
- Settings accessible in [[Admin]] settings page (Retention tab)
- Respects [[Auth]] engineer role for policy management

## Known Limitations

- Inheritance chain resolution order: characteristic-specific -> parent hierarchy -> ... -> plant global default
- `retention_policy` table has CHECK constraints for scope/type validation
- Purge is destructive -- always use the preview endpoint before executing
- Retention types: `forever`, `sample_count`, `time_delta`
