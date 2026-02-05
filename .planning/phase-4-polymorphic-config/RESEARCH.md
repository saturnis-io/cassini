# Phase 4 Research: Polymorphic Configuration

## Implementation Reference

Primary source: `POLYMORPHIC_CONFIG_IMPLEMENTATION.md` - Contains complete code for all components.

## Codebase Analysis

### Database Patterns

**Model Pattern** (from `backend/src/openspc/db/models/characteristic.py`):
- Uses SQLAlchemy declarative mapping with `Mapped[]` type hints
- `Base` imported from `hierarchy.py`
- Relationships defined with `back_populates`
- TYPE_CHECKING imports for circular dependency avoidance

**Migration Pattern** (from `20260205_add_sample_edit_history.py`):
- Revision ID: sequential numeric string (e.g., "006")
- `down_revision` references previous migration
- Uses `op.add_column()`, `op.create_table()`, `op.create_index()`
- Next revision should be "007" with `down_revision = "006"`

### Repository Pattern

**Base Repository** (`backend/src/openspc/db/repositories/base.py`):
```python
class BaseRepository(Generic[ModelT]):
    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
```
Note: Constructor takes `session` FIRST, then `model`. This differs from the implementation guide which has them swapped.

### API Router Pattern

**Router Registration** (`backend/src/openspc/main.py`):
- Import router from module
- `app.include_router(router)` - No prefix needed if defined in router
- Characteristics router: `prefix="/api/v1/characteristics"` in router file

### Frontend API Pattern

**Client Pattern** (`frontend/src/api/client.ts`):
- Uses `fetchApi<T>()` helper for all requests
- Grouped by domain (e.g., `characteristicApi = { ... }`)
- Types imported from `@/types`

**Hooks Pattern** (`frontend/src/api/hooks.ts`):
- Query keys defined in `queryKeys` object
- `useQuery` for reads, `useMutation` for writes
- Toast notifications on success/error
- `queryClient.invalidateQueries()` on mutations

### ScheduleConfigSection Analysis

**Existing Component** (`frontend/src/components/ScheduleConfigSection.tsx`):
- Exports `ScheduleType = 'INTERVAL' | 'SHIFT' | 'CRON' | 'BATCH_START'`
- Exports `ScheduleConfig` interface with union of all type fields
- Already integrated in CharacteristicForm but state not persisted

## Technical Decisions

### JSON Storage vs Columns

**Decision**: JSON blob in `config_json` column
- Simpler migrations when adding new config fields
- Pydantic handles validation on read/write
- Discriminated union naturally maps to JSON

### Discriminator Strategy

**Decision**: Use `config_type` as discriminator field
- Pydantic `Annotated[Union[...], Field(discriminator="config_type")]`
- Matches existing `provider_type` field semantics
- Backend validates config_type matches characteristic provider_type

### API Design

**Decision**: Nested under characteristic endpoint
- `GET /api/v1/characteristics/{id}/config`
- `PUT /api/v1/characteristics/{id}/config`
- `DELETE /api/v1/characteristics/{id}/config`

Rationale: Config is owned by characteristic, natural REST hierarchy.

## Risks and Mitigations

### Risk: BaseRepository constructor signature
The implementation guide has wrong parameter order.
**Mitigation**: Follow actual codebase pattern - `session` first.

### Risk: Migration revision conflicts
**Mitigation**: Check latest revision before creating migration.

### Risk: Frontend type synchronization
**Mitigation**: Define TypeScript types that mirror Pydantic schemas.

## File Dependencies

1. Schema must exist before model (model uses schema types in parsing)
2. Model must exist before repository
3. Repository must exist before API endpoints
4. Migration must exist before model can be instantiated
5. Backend API must exist before frontend integration
