# Phase 2 High Priority Features - Context

## Overview

This phase implements the three high-priority features from Phase 2:

1. **Help Tooltip Framework** - Reusable React component with content registry
2. **Nelson Rules Configuration UI** - Panel with toggles for each rule plus help tooltips
3. **API Data Entry Endpoint** - REST endpoint with API key authentication

## Architecture Reference

Full design in `.company/artifacts/architect/phase-2-design.md`

## Feature Details

### Feature 1: Help Tooltip Framework

**Purpose:** Reusable contextual help system with "?" icons providing rich tooltips.

**Key Components:**
- `HelpTooltip` React component using Radix UI Tooltip/Popover primitives
- `helpContent` registry with typed content entries
- Support for markdown rendering, rich content, severity levels
- Both hover (desktop) and click (mobile) interaction modes

**Standard Help Keys:**
- `nelson-rule-{1-8}` - Nelson Rule explanations
- `ucl-recalculation`, `lcl-recalculation` - When/why to recalculate
- `subgroup-mode-{a,b,c}` - Mode explanations
- `zone-{a,b,c}` - Zone definitions

### Feature 2: Nelson Rules Configuration UI

**Purpose:** UI to configure which Nelson rules apply per characteristic.

**Existing Infrastructure:**
- `CharacteristicRule` model with `char_id`, `rule_id`, `is_enabled`
- API endpoints: `GET/PUT /{char_id}/rules`
- Rules already checked during sample processing

**New UI Component:**
- `NelsonRulesConfigPanel` with toggle switches for 8 rules
- Help tooltip for each rule explaining what it detects
- Integration into `CharacteristicForm.tsx`

### Feature 3: API Data Entry Endpoint

**Purpose:** REST API for programmatic data submission from external systems.

**Endpoints:**
```
POST /api/v1/data-entry/submit     # Single sample
POST /api/v1/data-entry/batch      # Multiple samples
GET  /api/v1/data-entry/schema     # Payload schema
```

**Authentication:**
- API key in `X-API-Key` header
- `api_keys` database table with hashed keys
- Rate limiting per API key

## Codebase Patterns

### Frontend Patterns

- **Components:** Functional React with TypeScript
- **State:** Zustand stores (`configStore`, `dashboardStore`)
- **Data fetching:** TanStack Query with hooks in `api/hooks.ts`
- **Styling:** Tailwind CSS with Sepasoft brand colors in `index.css`
- **Types:** Centralized in `types/index.ts`

### Backend Patterns

- **API:** FastAPI with APIRouter and dependency injection
- **Schemas:** Pydantic models in `api/schemas/`
- **Repositories:** Async SQLAlchemy repositories
- **Engine:** `SPCEngine.process_sample()` for sample processing

## File Structure

### Files to Create

**Frontend:**
- `frontend/src/components/HelpTooltip.tsx`
- `frontend/src/components/NelsonRulesConfigPanel.tsx`
- `frontend/src/lib/help-content.ts`

**Backend:**
- `backend/src/openspc/api/v1/data_entry.py`
- `backend/src/openspc/api/schemas/data_entry.py`
- `backend/src/openspc/db/models/api_key.py`
- `backend/src/openspc/core/auth/api_key.py`

### Files to Modify

- `frontend/src/components/CharacteristicForm.tsx` - Add Nelson Rules section
- `backend/src/openspc/api/v1/__init__.py` - Register data-entry router
- `backend/src/openspc/db/models/__init__.py` - Export APIKey model

## Dependencies

### Backend Dependencies to Add
- `bcrypt` - API key hashing

### Frontend Dependencies (Already Available)
- `@radix-ui/react-tooltip` - Via shadcn/ui patterns
- `lucide-react` - Icons (already in use)

## Technical Constraints

1. **Authentication:** Use API key header (not session-based) for data-entry endpoint
2. **Reuse existing patterns:** Follow existing `samples.py` endpoint patterns
3. **No breaking changes:** Existing Nelson rules API must remain compatible
4. **Sepasoft styling:** Use established brand colors from `index.css`
