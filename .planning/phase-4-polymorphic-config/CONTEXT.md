# Phase 4: Polymorphic Characteristic Configuration

## Overview

Implement backend support for polymorphic characteristic configuration (ManualConfig vs TagConfig) with persistent storage. The frontend ScheduleConfigSection component already exists; this phase focuses on backend implementation and frontend integration.

## Business Value

- **ManualConfig**: Enables scheduled due tasks for operator data entry workflows
- **TagConfig**: Enables automated MQTT/PLC data ingestion with configurable triggers
- **Flexibility**: Same characteristic model supports both manual and automated data collection

## Technical Context

### Current State
- `Characteristic` model has `provider_type` field (MANUAL | TAG)
- Frontend `ScheduleConfigSection.tsx` exists with full schedule configuration UI
- No backend persistence for polymorphic configuration
- Schedule config state is local to component (not saved)

### Target State
- New `CharacteristicConfig` database model storing JSON configuration
- Discriminated union schemas (ManualConfig | TagConfig) with Pydantic
- REST API endpoints for config CRUD operations
- Frontend integration persisting schedule config to backend

## Dependencies

- Phase 3.5 (Reporting) - COMPLETE
- ScheduleConfigSection component - EXISTS (frontend/src/components/ScheduleConfigSection.tsx)
- Pydantic discriminated unions support - AVAILABLE (Pydantic v2)

## Scope Boundaries

### In Scope (Phase 4)
1. Pydantic schemas for ManualConfig/TagConfig with nested discriminators
2. SQLAlchemy model for CharacteristicConfig with JSON storage
3. Repository pattern with JSON parsing
4. REST API endpoints (GET/PUT/DELETE)
5. Frontend API client methods and React Query hooks
6. CharacteristicForm integration to persist config

### Out of Scope (Future)
- Due task scheduling system (DueTaskManager)
- Due task dashboard/notifications
- TagConfig trigger evaluation service
- MQTT subscription management based on TagConfig

## Key Files Reference

### Backend (to create)
- `backend/src/openspc/api/schemas/characteristic_config.py`
- `backend/src/openspc/db/models/characteristic_config.py`
- `backend/src/openspc/db/repositories/characteristic_config.py`
- `backend/src/openspc/api/v1/characteristic_config.py`
- `backend/alembic/versions/20260206_add_characteristic_config.py`

### Backend (to modify)
- `backend/src/openspc/db/models/characteristic.py` - Add relationship
- `backend/src/openspc/main.py` - Register router

### Frontend (to modify)
- `frontend/src/api/client.ts` - Add API methods
- `frontend/src/api/hooks.ts` - Add React Query hooks
- `frontend/src/components/CharacteristicForm.tsx` - Persist config on save
