# Phase 2 High Priority Features - Research

## Codebase Analysis

### Existing Patterns

#### Frontend Component Structure

**CharacteristicForm.tsx** (426 lines):
- Functional component with form state via `useState`
- Uses TanStack Query hooks: `useCharacteristic`, `useUpdateCharacteristic`, etc.
- Sections: Basic Info, Spec Limits, Control Limits, Sampling Config, Subgroup Handling
- Pattern: Collapsible sections with headers and form fields
- Styling: Tailwind utility classes with `cn()` helper

**Component Pattern:**
```tsx
export function ComponentName({ prop }: Props) {
  const { data, isLoading } = useQueryHook()
  const [state, setState] = useState(...)

  if (isLoading) return <Loading />

  return (
    <div className="...">
      {/* Sections */}
    </div>
  )
}
```

#### Backend API Structure

**samples.py** (561 lines):
- Uses `APIRouter` with prefix and tags
- Dependency injection via `Depends()` for repos and services
- Pydantic models for request/response
- Error handling: `HTTPException` with appropriate status codes
- Transaction management: `await session.commit()` / `await session.rollback()`

**Endpoint Pattern:**
```python
@router.post("/", response_model=ResponseModel, status_code=status.HTTP_201_CREATED)
async def endpoint_name(
    data: RequestModel,
    session: AsyncSession = Depends(get_db_session),
    service: Service = Depends(get_service),
) -> ResponseModel:
    try:
        # Process
        await session.commit()
        return result
    except ValueError as e:
        await session.rollback()
        raise HTTPException(status_code=400, detail=str(e))
```

#### Existing Nelson Rules Infrastructure

**characteristics.py** endpoints:
- `GET /{char_id}/rules` - Returns list of `NelsonRuleConfig`
- `PUT /{char_id}/rules` - Replaces rule config

**NelsonRuleConfig schema** (in `api/schemas/characteristic.py`):
```python
class NelsonRuleConfig(BaseModel):
    rule_id: int
    is_enabled: bool
```

**CharacteristicRule model** exists with `char_id`, `rule_id`, `is_enabled` fields.

### CSS/Styling Analysis

**index.css** - Sepasoft brand theme:
- CSS variables in `@theme` block
- Primary: `hsl(212 100% 30%)` (Sepasoft Blue)
- Success: `hsl(104 55% 40%)` (Sepasoft Green)
- Warning: `hsl(32 63% 51%)` (Sepasoft Orange)
- Destructive: `hsl(357 80% 52%)` (Sepasoft Red)

**Toggle/Switch pattern** - Not currently in codebase, needs implementation or external library.

### API Hooks Pattern

**hooks.ts** - TanStack Query hooks:
```typescript
export function useFeature(id: number) {
  return useQuery({
    queryKey: queryKeys.feature.detail(id),
    queryFn: () => featureApi.get(id),
    enabled: id > 0,
  })
}

export function useMutateFeature() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data) => featureApi.mutate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.feature.all })
    },
  })
}
```

## Implementation Approach

### Help Tooltip Framework

**Component Design:**
1. Create `HelpTooltip` component using native tooltip/popover
2. Use Radix patterns (existing shadcn/ui approach)
3. Content registry as TypeScript object with typed keys
4. Support for markdown in descriptions

**Help Content Structure:**
```typescript
interface HelpContent {
  title: string
  description: string
  details?: string
  severity?: 'CRITICAL' | 'WARNING' | 'INFO'
  learnMoreUrl?: string
}

const helpContent: Record<string, HelpContent> = {
  "nelson-rule-1": { ... },
  ...
}
```

### Nelson Rules Config Panel

**Component Design:**
1. Fetch rules via existing `GET /{char_id}/rules` endpoint
2. Display 8 toggles with rule name and help icon
3. Save via `PUT /{char_id}/rules` endpoint
4. Integrate into CharacteristicForm as new section

**API Integration:**
- Add `useNelsonRules(charId)` query hook
- Add `useUpdateNelsonRules()` mutation hook
- Use existing API endpoints

### API Data Entry Endpoint

**New Files:**
1. `api_key.py` model with bcrypt hashing
2. `data_entry.py` schemas
3. `data_entry.py` router
4. Authentication middleware/dependency

**Authentication Flow:**
```python
async def verify_api_key(
    x_api_key: str = Header(...),
    session: AsyncSession = Depends(get_session),
) -> APIKey:
    # Hash provided key and lookup
    # Check expiration, permissions, rate limit
    # Return APIKey or raise 401
```

## File Dependencies

### Plan 1: Help Tooltip Framework (Foundation)
- Creates: `HelpTooltip.tsx`, `help-content.ts`
- No dependencies on other features

### Plan 2: Nelson Rules Config UI
- Creates: `NelsonRulesConfigPanel.tsx`
- Modifies: `CharacteristicForm.tsx`, `hooks.ts`
- Depends on: Plan 1 (uses HelpTooltip)

### Plan 3: API Data Entry Endpoint
- Creates: `api_key.py` (model), `data_entry.py` (schemas + router), `api_key.py` (auth)
- Modifies: `__init__.py` (router registration)
- Independent of Plans 1-2

## Risk Assessment

**Low Risk:**
- Help tooltip framework - pure frontend, no backend changes
- Nelson rules UI - uses existing backend API

**Medium Risk:**
- API data entry - new authentication mechanism, database migration

**Mitigations:**
- Follow existing patterns exactly
- Add comprehensive error handling
- Write unit tests for auth middleware
