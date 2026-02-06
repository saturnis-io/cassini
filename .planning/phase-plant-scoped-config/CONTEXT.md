# Phase: Plant-Scoped Configuration

## Overview

Introduce plant-level isolation for all configuration and data. Hierarchies, characteristics, and broker configurations will be scoped per-plant. The frontend will filter all data based on the selected plant.

## CEO Requirements

1. Characteristic hierarchy isolated per plant
2. Screens scoped for the selected plant
3. Per-site data connectivity settings (MQTT brokers)
4. Future work (deferred): User/role management, plant assignments, AD integration

## Decisions

### 1. Plant Data Model Structure
**Decision**: C - Plant with Settings JSON

```csharp
public class Plant
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Code { get; set; }  // Short identifier (e.g., "PLT1")
    public bool IsActive { get; set; }
    public JsonDocument? Settings { get; set; }  // Flexible per-plant config
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

**Settings JSON may include**:
- `timezone` - Plant's local timezone
- `locale` - Language/number formatting
- `dateFormat` - Display format preference
- `shiftDefinitions` - Shift start/end times
- `defaultSubgroupSize` - Plant-wide SPC default
- `dataRetentionDays` - History retention policy
- `tagPrefix` - Plant-specific tag naming convention

### 2. Hierarchy Scoping Strategy
**Decision**: A - Add `plant_id` FK to Hierarchy

- Direct foreign key on `Hierarchy` table
- Root hierarchies MUST belong to a plant
- Child hierarchies inherit plant from parent (denormalized for query performance)
- Cascading delete: deleting a plant deletes all its hierarchies

### 3. Data Connectivity Configuration
**Decision**: B - Per-Plant Brokers

- Each plant has its own `MqttBrokerConfig` records
- Add `plant_id` FK to `MqttBrokerConfig`
- **Broker differentiation**: Add `client_id_prefix` or `client_id` field to differentiate connections to the same broker from different plants
- Example: Plant A and Plant B both connect to `broker.company.com` but with different client IDs (`plant-a-spc`, `plant-b-spc`)

### 4. Migration Strategy
**Decision**: A - Create Default Plant, Move All

- Migration creates a "Default Plant" with code "DEFAULT"
- All existing hierarchies assigned to Default Plant
- All existing broker configs assigned to Default Plant
- Zero data loss, immediate functionality
- Admin can reorganize later

### 5. API Change Strategy
**Decision**: A - Path Parameter (Full Refactor)

**New API structure**:
```
GET    /api/v1/plants
POST   /api/v1/plants
GET    /api/v1/plants/{plantId}
PUT    /api/v1/plants/{plantId}
DELETE /api/v1/plants/{plantId}

GET    /api/v1/plants/{plantId}/hierarchies
POST   /api/v1/plants/{plantId}/hierarchies
GET    /api/v1/plants/{plantId}/hierarchies/{id}
...

GET    /api/v1/plants/{plantId}/characteristics
POST   /api/v1/plants/{plantId}/characteristics
...

GET    /api/v1/plants/{plantId}/brokers
POST   /api/v1/plants/{plantId}/brokers
...

GET    /api/v1/plants/{plantId}/measurements
...
```

**Refactor requirements**:
- All existing endpoints must be migrated to plant-scoped paths
- Frontend API client must be updated to include plantId in all calls
- PlantProvider context provides current plantId to all components

### 6. OPC-UA Support
**Decision**: C - Defer Entirely

OPC-UA connectivity is out of scope for this phase. Will be addressed in a future phase.

### 7. User-Plant Assignment
**Decision**: C - Defer Entirely

User management, role assignment, and AD integration are out of scope. The existing mock role system in the frontend remains unchanged.

## Current State Analysis

### Backend (from codebase)

**Existing Models** (in `api/Models/`):
- `Hierarchy` - No plant association currently
- `Characteristic` - Links to Hierarchy
- `CharacteristicConfig` - Polymorphic config (ManualConfig/TagConfig)
- `MqttBrokerConfig` - Global broker settings
- `Measurement`, `ControlLimit`, `NelsonRuleViolation` - Data tables

**Existing Endpoints** (in `api/Controllers/`):
- `HierarchyController` - CRUD for hierarchies
- `CharacteristicsController` - CRUD for characteristics
- `MeasurementsController` - Data ingestion and retrieval
- `MqttController` - Broker management
- `ReportsController` - Report generation

### Frontend (from codebase)

**Plant Infrastructure** (already exists):
- `PlantProvider.tsx` - Context for current plant selection
- `PlantSelector.tsx` - Dropdown for plant selection
- `uiStore.ts` - Persists selected plant ID

**Current limitation**: Plant selector has mock data; API calls are not plant-scoped.

**API Client** (`frontend/src/lib/api.ts`):
- All endpoints currently global (no plantId parameter)
- Uses TanStack Query for caching

## Scope

### In Scope
1. Plant model with settings JSON
2. Database migration adding Plant table
3. Add `plant_id` FK to Hierarchy and MqttBrokerConfig
4. Migration script for existing data → Default Plant
5. New Plant CRUD endpoints
6. Refactor ALL existing endpoints to plant-scoped paths
7. Update frontend API client for plant-scoped calls
8. Wire PlantProvider to actual API data
9. Filter all screens by selected plant
10. Broker client ID differentiation

### Out of Scope
- OPC-UA connectivity
- User management / authentication
- Role management / AD integration
- Multi-plant dashboards (showing data from multiple plants)
- Plant-to-plant data sharing

## Technical Considerations

### Database
- PostgreSQL with EF Core
- Settings JSON uses `JsonDocument` (native PostgreSQL jsonb)
- Cascading deletes for plant → hierarchies → characteristics

### API Versioning
- Consider `/api/v2/` for new plant-scoped endpoints OR
- Migrate existing `/api/v1/` endpoints in place (breaking change, but no external consumers)

### Frontend State
- PlantProvider already has `currentPlant` state
- Need to load plants from API on app init
- All queries must include plantId from context

### WebSocket
- SignalR hub may need plant-scoped groups
- Consider: `/hubs/measurements?plantId={id}` or group-based filtering

## Success Criteria

1. **Plant CRUD**: Admin can create, edit, delete plants
2. **Data Isolation**: Hierarchies/characteristics only visible within their plant
3. **Screen Scoping**: Changing plant selector updates all visible data
4. **Broker Isolation**: Each plant can have independent broker configs
5. **Migration**: Existing data preserved in Default Plant
6. **No Regressions**: All existing functionality works within plant context

## Dependencies

- Existing polymorphic config system (Phase 4)
- Existing enterprise UI (sidebar, plant selector)
- Existing hierarchy/characteristic CRUD

## Risks

1. **API Breaking Change**: All frontend API calls need updating
2. **WebSocket Complexity**: Real-time data needs plant filtering
3. **Migration Edge Cases**: Orphaned records during migration
4. **Performance**: Plant-scoped queries need proper indexing
