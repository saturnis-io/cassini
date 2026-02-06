# Phase: Plant-Scoped Configuration - Research

## Executive Summary

This phase introduces plant-level isolation for all configuration and data. The implementation requires:
1. New Plant model with settings JSON
2. Database migrations adding plant_id FK to Hierarchy and MQTTBroker
3. Refactored API endpoints with plant-scoped paths
4. Frontend API client updates and PlantProvider wiring

## Codebase Analysis

### Backend Architecture (Python/FastAPI)

**Current Models** (`backend/src/openspc/db/models/`):
- `hierarchy.py` - `Hierarchy` model with self-referential parent-child relationship, no plant association
- `broker.py` - `MQTTBroker` model with connection settings, no plant association
- `characteristic.py` - Links to Hierarchy via `hierarchy_id` FK
- Other models: `sample.py`, `violation.py`, `api_key.py`, `characteristic_config.py`

**Current API Routes** (`backend/src/openspc/api/v1/`):
- `hierarchy.py` - CRUD endpoints at `/api/v1/hierarchy/`
- `brokers.py` - CRUD endpoints at `/api/v1/brokers/`
- `characteristics.py` - CRUD at `/api/v1/characteristics/`
- `samples.py`, `violations.py`, `providers.py`, etc.

**Router Registration** (`backend/src/openspc/main.py`):
- Routers registered with `app.include_router()`
- Current prefix: `/api/v1/hierarchy`, etc.
- Need to restructure to `/api/v1/plants/{plantId}/...`

**Database Migrations** (`backend/alembic/versions/`):
- 7 existing migrations
- Naming convention: `20260XXX_description.py`
- Uses SQLAlchemy Alembic with async support

### Frontend Architecture (React/TypeScript)

**API Client** (`frontend/src/api/client.ts`):
- `fetchApi<T>()` - Base fetch wrapper with error handling
- `hierarchyApi` - Tree, node CRUD, characteristics
- `characteristicApi` - Full CRUD with chart data, rules, config
- `sampleApi`, `violationApi`, `brokerApi`, `providerApi`, `apiKeysApi`
- All currently global (no plantId parameter)

**Query Hooks** (`frontend/src/api/hooks.ts`):
- TanStack Query hooks wrapping API client
- Query keys for caching: `['hierarchy', 'tree']`, etc.
- Mutations with cache invalidation

**Plant Infrastructure** (`frontend/src/providers/PlantProvider.tsx`):
- `Plant` interface: `{ id: string; name: string; code: string }`
- `PlantContext` with `plants`, `selectedPlant`, `setSelectedPlant`
- Currently uses `MOCK_PLANTS` array
- Syncs with `uiStore` for persistence

## Implementation Strategy

### Database Changes

1. **New Plant Table**:
```sql
CREATE TABLE plant (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(10) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    settings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

2. **Add plant_id FK to hierarchy**:
```sql
ALTER TABLE hierarchy ADD COLUMN plant_id INTEGER REFERENCES plant(id) ON DELETE CASCADE;
```

3. **Add plant_id FK to mqtt_broker**:
```sql
ALTER TABLE mqtt_broker ADD COLUMN plant_id INTEGER REFERENCES plant(id) ON DELETE CASCADE;
```

4. **Migration Script**:
- Create "Default" plant
- Assign all existing hierarchies to Default plant
- Assign all existing brokers to Default plant

### API Restructuring

**New Endpoints**:
```
/api/v1/plants                              GET, POST
/api/v1/plants/{plantId}                    GET, PUT, DELETE
/api/v1/plants/{plantId}/hierarchies        GET, POST
/api/v1/plants/{plantId}/hierarchies/{id}   GET, PATCH, DELETE
/api/v1/plants/{plantId}/characteristics    GET, POST
/api/v1/plants/{plantId}/characteristics/{id} GET, PATCH, DELETE
/api/v1/plants/{plantId}/brokers            GET, POST
/api/v1/plants/{plantId}/brokers/{id}       GET, PATCH, DELETE
/api/v1/plants/{plantId}/samples            GET, POST
/api/v1/plants/{plantId}/violations         GET
```

**Router Organization**:
- New `plants.py` router for plant CRUD
- Child routers nested under plant prefix
- Dependency injection for plant_id validation

### Frontend Changes

1. **API Client Updates**:
- All API objects receive `plantId` as first parameter
- Update all fetch calls to include plant in path

2. **PlantProvider Updates**:
- Fetch plants from API on mount
- Replace mock data with API response
- Handle loading/error states

3. **Query Key Updates**:
- Include plantId in all query keys
- Invalidate plant-specific queries on plant change

## File Impact Analysis

### Backend Files to Create
- `backend/src/openspc/db/models/plant.py` - Plant model
- `backend/src/openspc/db/repositories/plant.py` - Plant repository
- `backend/src/openspc/api/schemas/plant.py` - Plant schemas
- `backend/src/openspc/api/v1/plants.py` - Plant CRUD endpoints
- `backend/alembic/versions/20260207_add_plant.py` - Migration

### Backend Files to Modify
- `backend/src/openspc/db/models/hierarchy.py` - Add plant_id FK
- `backend/src/openspc/db/models/broker.py` - Add plant_id FK
- `backend/src/openspc/db/models/__init__.py` - Export Plant
- `backend/src/openspc/db/repositories/hierarchy.py` - Filter by plant
- `backend/src/openspc/db/repositories/broker.py` - Filter by plant
- `backend/src/openspc/api/v1/hierarchy.py` - Add plant_id path param
- `backend/src/openspc/api/v1/brokers.py` - Add plant_id path param
- `backend/src/openspc/api/v1/characteristics.py` - Add plant_id path param
- `backend/src/openspc/api/v1/samples.py` - Add plant_id path param
- `backend/src/openspc/api/v1/violations.py` - Add plant_id path param
- `backend/src/openspc/main.py` - Register plant router

### Frontend Files to Modify
- `frontend/src/api/client.ts` - Add plantId to all endpoints
- `frontend/src/api/hooks.ts` - Add plantId to query keys and calls
- `frontend/src/providers/PlantProvider.tsx` - Fetch from API
- `frontend/src/types/index.ts` - Update Plant type

## Technical Risks

1. **Breaking API Changes**: All frontend calls must be updated simultaneously
2. **Migration Complexity**: Existing data must be preserved
3. **Query Key Invalidation**: Plant changes must invalidate all cached data
4. **WebSocket Scoping**: Real-time updates need plant filtering (deferred)

## Recommended Plan Sequence

1. **Plan 1: Database Foundation** - Plant model, migration, repository
2. **Plan 2: Backend API Refactor** - Plant CRUD, endpoint restructuring
3. **Plan 3: Frontend Integration** - API client updates, PlantProvider wiring
4. **Plan 4: Testing & Polish** - E2E tests, edge cases, documentation
