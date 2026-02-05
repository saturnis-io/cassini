# Plan 1: Nelson Rules Acknowledgement Configuration

## Objective
Add per-rule "require acknowledgement" setting to Nelson rules configuration, defaulting to true.

---

## Task 1: Database Migration + Model Update

### Changes
1. Add `require_acknowledgement` column to `characteristic_rules` table
2. Add `requires_acknowledgement` column to `violation` table

### Files
- `backend/src/openspc/db/models/characteristic.py`
- `backend/src/openspc/db/models/violation.py`

### Implementation

**CharacteristicRule model:**
```python
class CharacteristicRule(Base):
    # ... existing fields ...
    require_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
```

**Violation model:**
```python
class Violation(Base):
    # ... existing fields ...
    requires_acknowledgement: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
```

### Migration
```bash
alembic revision --autogenerate -m "add_require_acknowledgement_to_rules_and_violations"
alembic upgrade head
```

### Verification
- [ ] Migration runs successfully
- [ ] New columns exist with default `True`
- [ ] Existing rules/violations have `True` value

---

## Task 2: API Schema + Endpoint Updates

### Changes
1. Update NelsonRuleConfig schema with `require_acknowledgement`
2. Update violation response schema
3. Update nelson rules GET/PUT endpoints
4. Update violation stats endpoint to return separate counts

### Files
- `backend/src/openspc/api/schemas/characteristic.py`
- `backend/src/openspc/api/schemas/violation.py`
- `backend/src/openspc/api/v1/characteristics.py`
- `backend/src/openspc/api/v1/violations.py`

### Implementation

**NelsonRuleConfig schema:**
```python
class NelsonRuleConfig(BaseModel):
    rule_id: int = Field(..., ge=1, le=8)
    is_enabled: bool = True
    require_acknowledgement: bool = True  # NEW
```

**NelsonRulesResponse:**
```python
class NelsonRulesResponse(BaseModel):
    enabled_rules: list[int]
    rule_configs: list[NelsonRuleConfig]  # Full config per rule
```

**ViolationResponse update:**
```python
class ViolationResponse(BaseModel):
    # ... existing fields ...
    requires_acknowledgement: bool = True
```

**ViolationStats update:**
```python
class ViolationStatsResponse(BaseModel):
    total: int
    unacknowledged: int  # Only violations where requires_ack=True AND acknowledged=False
    unacknowledged_required: int  # Alias for clarity
    informational: int  # Violations where requires_ack=False AND acknowledged=False
    by_severity: dict[str, int]
```

### Verification
- [ ] GET /nelson-rules returns rule_configs with require_acknowledgement
- [ ] PUT /nelson-rules accepts require_acknowledgement per rule
- [ ] GET /violations/stats returns separate counts
- [ ] Violation responses include requires_acknowledgement

---

## Task 3: SPC Engine Integration

### Changes
1. When creating violations, look up the rule's `require_acknowledgement` setting
2. Copy the setting to the violation record

### Files
- `backend/src/openspc/core/engine/spc_engine.py`

### Implementation

When creating a violation:
```python
# Look up rule config
rule_config = get_rule_config(characteristic_id, rule_id)
requires_ack = rule_config.require_acknowledgement if rule_config else True

violation = Violation(
    sample_id=sample_id,
    rule_id=rule_id,
    rule_name=rule_name,
    severity=severity,
    requires_acknowledgement=requires_ack,  # NEW
)
```

### Verification
- [ ] New violations inherit require_ack from rule config
- [ ] Default is True when rule config not found

---

## Dependencies
- None (first wave)

## Commits
After each task:
```
feat(3.5-1): add require_acknowledgement to CharacteristicRule model
feat(3.5-1): add requires_acknowledgement to Violation model
feat(3.5-1): update API schemas for acknowledgement config
feat(3.5-1): integrate require_ack into violation creation
```

## Estimated Scope
- 2 model files
- 4 API files
- 1 migration
- ~150 lines of changes
