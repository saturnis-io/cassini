# Repository Pattern Guide

This guide provides practical examples for using the OpenSPC repository layer.

## Quick Start

### Basic Setup with FastAPI

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from openspc.db.database import get_session
from openspc.db.repositories import CharacteristicRepository

@app.get("/characteristics/{char_id}")
async def get_characteristic(
    char_id: int,
    session: AsyncSession = Depends(get_session)
):
    repo = CharacteristicRepository(session)
    char = await repo.get_by_id(char_id)
    if char is None:
        raise HTTPException(status_code=404)
    return char
```

### Direct Usage

```python
from openspc.db.database import DatabaseConfig
from openspc.db.repositories import HierarchyRepository

async def main():
    db = DatabaseConfig()
    async with db.session() as session:
        repo = HierarchyRepository(session)
        tree = await repo.get_tree()
        print(tree)
```

## Common Patterns

### 1. Creating Records

```python
# Simple creation
repo = HierarchyRepository(session)
site = await repo.create(
    name="Factory A",
    type="Site",
    parent_id=None
)

# Create with nested relationships
sample_repo = SampleRepository(session)
sample = await sample_repo.create_with_measurements(
    char_id=1,
    values=[10.1, 10.2, 10.0, 10.3, 10.1],
    batch_number="BATCH-001",
    operator_id="OPR-123"
)
```

### 2. Querying Records

```python
# Get by ID
char = await char_repo.get_by_id(1)

# Get all with pagination
page1 = await char_repo.get_all(offset=0, limit=20)
page2 = await char_repo.get_all(offset=20, limit=20)

# Count total
total = await char_repo.count()
```

### 3. Updating Records

```python
# Update specific fields
updated = await char_repo.update(
    char_id,
    target_value=100.0,
    usl=110.0,
    lsl=90.0
)

# Check if update succeeded
if updated is None:
    raise ValueError("Characteristic not found")
```

### 4. Deleting Records

```python
# Delete returns True/False
deleted = await repo.delete(char_id)
if not deleted:
    raise ValueError("Characteristic not found")
```

## Repository-Specific Examples

### HierarchyRepository

#### Building a Complete Tree

```python
repo = HierarchyRepository(session)

# Create hierarchy
site = await repo.create(name="Factory A", type="Site", parent_id=None)
area = await repo.create(name="Area 1", type="Area", parent_id=site.id)
line = await repo.create(name="Line 1", type="Line", parent_id=area.id)
cell = await repo.create(name="Cell 1", type="Cell", parent_id=line.id)

# Get complete tree
tree = await repo.get_tree()
# Returns: [HierarchyNode(name="Factory A", children=[...])]
```

#### Navigating Relationships

```python
# Get direct children
children = await repo.get_children(site.id)
# Returns: [Hierarchy(name="Area 1"), ...]

# Get all descendants
descendants = await repo.get_descendants(site.id)
# Returns: [Hierarchy(name="Area 1"), Hierarchy(name="Line 1"), ...]

# Get path to root
ancestors = await repo.get_ancestors(cell.id)
# Returns: [Hierarchy(name="Line 1"), Hierarchy(name="Area 1"), ...]
```

### CharacteristicRepository

#### Filtering by Hierarchy

```python
repo = CharacteristicRepository(session)

# Get characteristics at specific node
chars = await repo.get_by_hierarchy(hierarchy_id=site.id)

# Get all characteristics in subtree
all_chars = await repo.get_by_hierarchy(
    hierarchy_id=site.id,
    include_descendants=True
)
```

#### Filtering by Provider Type

```python
# Get all manual entry characteristics
manual = await repo.get_by_provider_type("MANUAL")

# Get all tag-based characteristics
tag_chars = await repo.get_by_provider_type("TAG")
```

#### Loading with Rules

```python
# Eager load Nelson Rules configuration
char = await repo.get_with_rules(char_id=1)

# Access rules without additional queries
for rule in char.rules:
    print(f"Rule {rule.rule_id}: {'Enabled' if rule.is_enabled else 'Disabled'}")
```

### SampleRepository

#### Rolling Window Queries

```python
repo = SampleRepository(session)

# Get last 25 samples for SPC chart
samples = await repo.get_rolling_window(
    char_id=1,
    window_size=25,
    exclude_excluded=True  # Don't include excluded samples
)

# Samples are in chronological order (oldest to newest)
for sample in samples:
    print(f"{sample.timestamp}: {sample.measurements}")
```

#### Date Range Queries

```python
from datetime import datetime, timedelta

# Get samples from last 30 days
start = datetime.utcnow() - timedelta(days=30)
samples = await repo.get_by_characteristic(
    char_id=1,
    start_date=start
)

# Get samples for specific period
samples = await repo.get_by_characteristic(
    char_id=1,
    start_date=datetime(2025, 1, 1),
    end_date=datetime(2025, 1, 31)
)
```

#### Creating Samples

```python
# Single measurement (subgroup size = 1)
sample = await repo.create_with_measurements(
    char_id=1,
    values=[10.5],
    batch_number="BATCH-001"
)

# Multiple measurements (subgroup size = 5)
sample = await repo.create_with_measurements(
    char_id=2,
    values=[10.1, 10.2, 10.0, 10.3, 10.1],
    batch_number="BATCH-002",
    operator_id="OPR-123"
)

# All measurements are created atomically
```

### ViolationRepository

#### Querying Violations

```python
repo = ViolationRepository(session)

# Get all unacknowledged violations
unacked = await repo.get_unacknowledged()

# Get unacknowledged violations for specific characteristic
char_violations = await repo.get_unacknowledged(char_id=1)

# Get all violations for a sample
violations = await repo.get_by_sample(sample_id=42)
```

#### Acknowledging Violations

```python
# Acknowledge with reason
violation = await repo.acknowledge(
    violation_id=42,
    user="john.doe",
    reason="False positive - equipment calibration was in progress"
)

# Check acknowledgment details
if violation:
    print(f"Acknowledged by {violation.ack_user} at {violation.ack_timestamp}")
    print(f"Reason: {violation.ack_reason}")
```

## Advanced Patterns

### Combining Repositories

```python
async def get_characteristic_with_recent_violations(
    char_id: int,
    session: AsyncSession
) -> dict:
    """Get characteristic with recent samples and violations."""
    char_repo = CharacteristicRepository(session)
    sample_repo = SampleRepository(session)
    violation_repo = ViolationRepository(session)

    # Load characteristic with rules
    char = await char_repo.get_with_rules(char_id)

    # Get recent samples
    samples = await sample_repo.get_rolling_window(char_id, window_size=25)

    # Get unacknowledged violations
    violations = await violation_repo.get_unacknowledged(char_id=char_id)

    return {
        "characteristic": char,
        "recent_samples": samples,
        "active_violations": violations
    }
```

### Transaction Management

```python
async def create_characteristic_with_rules(
    hierarchy_id: int,
    name: str,
    session: AsyncSession
) -> Characteristic:
    """Create characteristic with default rules."""
    char_repo = CharacteristicRepository(session)

    # Create characteristic
    char = await char_repo.create(
        hierarchy_id=hierarchy_id,
        name=name,
        provider_type="MANUAL",
        subgroup_size=1
    )

    # Add default rules (Nelson Rules 1-4 enabled)
    from openspc.db.models.characteristic import CharacteristicRule
    for rule_id in range(1, 5):
        rule = CharacteristicRule(
            char_id=char.id,
            rule_id=rule_id,
            is_enabled=True
        )
        session.add(rule)

    await session.flush()

    # Return characteristic with rules loaded
    return await char_repo.get_with_rules(char.id)
```

### Background Task Processing

```python
from openspc.db.database import get_database

async def process_mqtt_sample(char_id: int, value: float):
    """Process sample from MQTT in background task."""
    db = get_database()

    async with db.session() as session:
        repo = SampleRepository(session)

        # Create sample with measurement
        sample = await repo.create_with_measurements(
            char_id=char_id,
            values=[value]
        )

        # Session auto-commits on context exit
        return sample
```

## Performance Tips

### 1. Use Eager Loading

```python
# Good: Loads rules in one query
char = await repo.get_with_rules(char_id)

# Bad: Causes N+1 queries
char = await repo.get_by_id(char_id)
for rule in char.rules:  # Each iteration queries database
    process(rule)
```

### 2. Batch Operations

```python
# Create multiple records efficiently
chars_to_create = [
    {"name": f"Char {i}", "hierarchy_id": 1, "provider_type": "MANUAL", "subgroup_size": 1}
    for i in range(100)
]

for char_data in chars_to_create:
    await repo.create(**char_data)

# Flush once after all creates
await session.flush()
```

### 3. Pagination for Large Datasets

```python
# Process large datasets in chunks
offset = 0
limit = 100

while True:
    batch = await repo.get_all(offset=offset, limit=limit)
    if not batch:
        break

    for item in batch:
        await process(item)

    offset += limit
```

## Error Handling

```python
from sqlalchemy.exc import IntegrityError

async def create_characteristic_safe(
    hierarchy_id: int,
    name: str,
    session: AsyncSession
) -> Characteristic | None:
    """Create characteristic with error handling."""
    repo = CharacteristicRepository(session)

    try:
        char = await repo.create(
            hierarchy_id=hierarchy_id,
            name=name,
            provider_type="MANUAL",
            subgroup_size=1
        )
        return char
    except IntegrityError as e:
        # Handle constraint violations (e.g., duplicate names)
        await session.rollback()
        logger.error(f"Failed to create characteristic: {e}")
        return None
```

## Testing with Repositories

```python
import pytest
from openspc.db.repositories import HierarchyRepository

@pytest.mark.asyncio
async def test_create_hierarchy(async_session):
    """Test creating hierarchy node."""
    repo = HierarchyRepository(async_session)

    node = await repo.create(
        name="Test Site",
        type="Site",
        parent_id=None
    )

    assert node.id is not None
    assert node.name == "Test Site"
```

## Best Practices

1. **Always use dependency injection** with FastAPI
2. **Let the session context manager handle commits/rollbacks**
3. **Use type hints** for better IDE support
4. **Eager load relationships** when you know you'll need them
5. **Paginate large queries** to avoid memory issues
6. **Handle None returns** from get_by_id and update operations
7. **Use transactions** for multi-step operations
8. **Test repository operations** in isolation

## Further Reading

- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [FastAPI Dependency Injection](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [Pytest Async](https://pytest-asyncio.readthedocs.io/)
