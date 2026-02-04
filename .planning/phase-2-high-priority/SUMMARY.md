# Phase 2 High Priority Features - Summary

## Overview

This phase implements the three high-priority features from Phase 2:
1. Help Tooltip Framework
2. Nelson Rules Configuration UI
3. API Data Entry Endpoint

## Plans

### Plan 1: Help Tooltip Framework (Wave 1)

**Status:** Pending

**Files:**
- `frontend/src/lib/help-content.ts` - Content registry with 20+ entries
- `frontend/src/components/HelpTooltip.tsx` - Reusable tooltip component

**Tasks:**
1. Create help content registry with Nelson rules and statistical terms
2. Create HelpTooltip component with hover/click interaction

### Plan 2: Nelson Rules Configuration UI (Wave 2)

**Status:** Pending (depends on Plan 1)

**Files:**
- `frontend/src/components/NelsonRulesConfigPanel.tsx` - Toggle panel
- `frontend/src/components/CharacteristicForm.tsx` - Integration
- `frontend/src/api/hooks.ts` - New hooks for rules API
- `frontend/src/api/client.ts` - API client methods

**Tasks:**
1. Add API hooks for fetching/updating Nelson rules
2. Create NelsonRulesConfigPanel with 8 toggles + help icons
3. Integrate panel into CharacteristicForm

### Plan 3: API Data Entry Endpoint (Wave 1)

**Status:** Pending

**Files:**
- `backend/src/openspc/db/models/api_key.py` - APIKey model
- `backend/src/openspc/core/auth/api_key.py` - Authentication
- `backend/src/openspc/api/schemas/data_entry.py` - Request/response schemas
- `backend/src/openspc/api/v1/data_entry.py` - REST endpoints

**Tasks:**
1. Create APIKey database model
2. Create API key authentication dependency
3. Create data entry schemas and endpoints

## Execution Order

```
Wave 1 (parallel):
  - Plan 1: Help Tooltip Framework
  - Plan 3: API Data Entry Endpoint

Wave 2 (sequential):
  - Plan 2: Nelson Rules Config UI (requires Plan 1)
```

## Success Criteria

- [ ] HelpTooltip component renders help icons throughout the app
- [ ] Nelson Rules panel shows 8 toggles with save functionality
- [ ] API endpoint accepts samples with X-API-Key authentication
- [ ] All TypeScript compiles without errors
- [ ] Backend starts without import errors

## Next Steps

After completion:
1. Run `/company-execute 2-high-priority` to implement all plans
2. Test help tooltips in CharacteristicForm
3. Test Nelson rules toggle persistence
4. Test API data entry with sample API key
5. Move to Phase 2 Medium Priority (Chart Styling, Dark Mode)
