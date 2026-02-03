# OpenSPC Database Schema Diagram

## Entity Relationship Diagram

```
┌─────────────────────────────┐
│       HIERARCHY             │
├─────────────────────────────┤
│ PK  id                      │
│ FK  parent_id  ────────┐    │
│     name                │    │
│     type                │    │
└─────────────────────────┴────┘
         │                │
         │                └──── Self-referential (parent-child)
         │
         │ 1:N
         │
         ▼
┌─────────────────────────────┐
│     CHARACTERISTIC          │
├─────────────────────────────┤
│ PK  id                      │
│ FK  hierarchy_id            │
│     name                    │
│     description             │
│     subgroup_size           │
│     target_value            │
│     usl, lsl                │  (Spec Limits)
│     ucl, lcl                │  (Control Limits)
│     provider_type           │  (MANUAL | TAG)
│     mqtt_topic              │
│     trigger_tag             │
└─────────────────────────────┘
         │
         ├──────────────┬──────────────┐
         │              │              │
         │ 1:N          │ 1:N          │
         │              │              │
         ▼              ▼              │
┌──────────────┐   ┌────────┐         │
│ CHAR_RULES   │   │ SAMPLE │         │
├──────────────┤   ├────────┤         │
│ PK char_id   │   │ PK  id │         │
│ PK rule_id   │   │ FK  char_id      │
│    is_enabled│   │     timestamp    │
└──────────────┘   │     batch_number │
                   │     operator_id  │
                   │     is_excluded  │
                   └────────┘
                        │
                        ├──────────┬──────────┐
                        │          │          │
                        │ 1:N      │ 1:N      │
                        │          │          │
                        ▼          ▼          │
                   ┌───────────┐ ┌──────────┐│
                   │MEASUREMENT│ │VIOLATION ││
                   ├───────────┤ ├──────────┤│
                   │ PK  id    │ │ PK  id   ││
                   │ FK sample_id │ FK sample_id
                   │     value │ │    rule_id
                   └───────────┘ │    rule_name
                                 │    severity
                                 │    acknowledged
                                 │    ack_user
                                 │    ack_reason
                                 │    ack_timestamp
                                 └──────────┘
```

## Table Details

### Primary Keys (PK)
All tables use auto-incrementing integer primary keys except:
- `characteristic_rules`: Composite key (char_id, rule_id)

### Foreign Keys (FK)
- `hierarchy.parent_id` → `hierarchy.id` (self-referential)
- `characteristic.hierarchy_id` → `hierarchy.id`
- `characteristic_rules.char_id` → `characteristic.id`
- `sample.char_id` → `characteristic.id`
- `measurement.sample_id` → `sample.id`
- `violation.sample_id` → `sample.id`

### Cascade Behavior
All relationships use `cascade="all, delete-orphan"` for automatic cleanup:
- Deleting a hierarchy node deletes all child nodes and characteristics
- Deleting a characteristic deletes all rules and samples
- Deleting a sample deletes all measurements and violations

## Data Flow Example

```
1. Create Hierarchy
   Site "Raleigh_Site"
   └── Line "Bottling_Line_A"

2. Create Characteristic
   "Fill_Weight" (attached to Line)
   ├── Target: 500g
   ├── Spec Limits: 490-510g
   └── Control Limits: 493-507g

3. Enable Nelson Rules
   Rule 1: One point beyond 3σ
   Rule 2: Nine points in a row on same side
   Rule 3: Six points in a row trending

4. Create Sample
   Sample #1 (timestamp: 2026-02-02 10:00:00)
   ├── Measurement 1: 498.5g
   ├── Measurement 2: 501.2g
   ├── Measurement 3: 499.8g
   ├── Measurement 4: 500.5g
   └── Measurement 5: 502.1g

5. Detect Violation (if any)
   Violation: Rule 1 triggered
   ├── Severity: WARNING
   └── Acknowledged: false
```

## Index Strategy

### Performance Indexes
Created by initial migration:

```sql
CREATE INDEX ix_characteristic_hierarchy_id ON characteristic(hierarchy_id);
CREATE INDEX ix_sample_char_id ON sample(char_id);
CREATE INDEX ix_sample_timestamp ON sample(timestamp);
CREATE INDEX ix_measurement_sample_id ON measurement(sample_id);
CREATE INDEX ix_violation_sample_id ON violation(sample_id);
CREATE INDEX ix_violation_acknowledged ON violation(acknowledged);
```

### Query Optimization

**Common Query Patterns:**

1. **Get all characteristics for a hierarchy node:**
   ```sql
   SELECT * FROM characteristic WHERE hierarchy_id = ?
   -- Uses: ix_characteristic_hierarchy_id
   ```

2. **Get recent samples for a characteristic:**
   ```sql
   SELECT * FROM sample WHERE char_id = ? ORDER BY timestamp DESC
   -- Uses: ix_sample_char_id, ix_sample_timestamp
   ```

3. **Get unacknowledged violations:**
   ```sql
   SELECT * FROM violation WHERE acknowledged = 0
   -- Uses: ix_violation_acknowledged
   ```

## Enum Types

### HierarchyType (ISA-95 Standard)
```
Site  →  Area  →  Line  →  Cell  →  Unit
```

Example:
- Site: "Raleigh Plant"
- Area: "Production Floor"
- Line: "Bottling Line A"
- Cell: "Filling Station"
- Unit: "Filler #3"

### ProviderType
- **MANUAL**: Data entered manually by operators
- **TAG**: Data from MQTT/OPC tags

### Severity
- **WARNING**: Minor deviation, informational
- **CRITICAL**: Major deviation, requires action

## Relationship Cardinalities

| Parent             | Relationship | Child              | Type |
|--------------------|--------------|-------------------|------|
| Hierarchy          | children     | Hierarchy         | 1:N  |
| Hierarchy          | characteristics | Characteristic | 1:N  |
| Characteristic     | rules        | CharacteristicRule| 1:N  |
| Characteristic     | samples      | Sample            | 1:N  |
| Sample             | measurements | Measurement       | 1:N  |
| Sample             | violations   | Violation         | 1:N  |

## Storage Estimates

Approximate storage requirements per record:

| Table              | Size/Record | Notes                          |
|--------------------|-------------|--------------------------------|
| Hierarchy          | ~100 bytes  | Small, rarely changes          |
| Characteristic     | ~200 bytes  | Small, configuration data      |
| CharacteristicRule | ~20 bytes   | Very small, 8 rules max/char   |
| Sample             | ~100 bytes  | Metadata only                  |
| Measurement        | ~20 bytes   | Just value + sample_id         |
| Violation          | ~150 bytes  | Includes ack data              |

**Example**: 100 characteristics, each collecting 1000 samples/day with subgroup size 5:
- Samples: 100,000/day × 100 bytes = ~10 MB/day
- Measurements: 500,000/day × 20 bytes = ~10 MB/day
- Total: ~20 MB/day (before compression/indexing overhead)

## Constraints

### Check Constraints
SQLAlchemy models enforce type checking via Python enums:
- `hierarchy.type` ∈ {Site, Area, Line, Cell, Unit}
- `characteristic.provider_type` ∈ {MANUAL, TAG}
- `violation.severity` ∈ {WARNING, CRITICAL}

### NOT NULL Constraints
Required fields (cannot be NULL):
- All primary keys
- All foreign keys
- `hierarchy.name`, `hierarchy.type`
- `characteristic.name`, `characteristic.subgroup_size`, `characteristic.provider_type`
- `sample.timestamp`, `sample.is_excluded`
- `measurement.value`
- `violation.rule_id`, `violation.severity`, `violation.acknowledged`

### Default Values
- `characteristic.subgroup_size` = 1
- `sample.timestamp` = CURRENT_TIMESTAMP
- `sample.is_excluded` = false
- `characteristic_rules.is_enabled` = true
- `violation.acknowledged` = false
