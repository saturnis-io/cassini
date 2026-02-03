# OpenSPC Database Documentation

This document describes the database schema, ORM models, and usage for the OpenSPC system.

## Overview

OpenSPC uses SQLite with SQLAlchemy 2.0 ORM for data persistence. The database is configured with:
- WAL (Write-Ahead Logging) mode for better concurrency
- Foreign key constraints enabled
- Async operations using `aiosqlite`
- Alembic for schema migrations

## Database Schema

### Tables

#### 1. `hierarchy`
ISA-95 equipment hierarchy model.

```sql
CREATE TABLE hierarchy (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- 'Site', 'Area', 'Line', 'Cell', 'Unit'
    FOREIGN KEY(parent_id) REFERENCES hierarchy(id)
);
```

**Relationships:**
- Self-referential parent-child relationship
- One-to-many with `characteristic`

#### 2. `characteristic`
SPC characteristic configuration.

```sql
CREATE TABLE characteristic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hierarchy_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    subgroup_size INTEGER DEFAULT 1,
    target_value REAL,
    usl REAL,  -- Upper Spec Limit
    lsl REAL,  -- Lower Spec Limit
    ucl REAL,  -- Upper Control Limit
    lcl REAL,  -- Lower Control Limit
    provider_type TEXT NOT NULL,  -- 'MANUAL' or 'TAG'
    mqtt_topic TEXT,
    trigger_tag TEXT,
    FOREIGN KEY(hierarchy_id) REFERENCES hierarchy(id)
);
```

**Relationships:**
- Many-to-one with `hierarchy`
- One-to-many with `characteristic_rules`
- One-to-many with `sample`

#### 3. `characteristic_rules`
Nelson Rules configuration per characteristic.

```sql
CREATE TABLE characteristic_rules (
    char_id INTEGER,
    rule_id INTEGER,
    is_enabled BOOLEAN DEFAULT 1,
    PRIMARY KEY (char_id, rule_id),
    FOREIGN KEY(char_id) REFERENCES characteristic(id)
);
```

**Relationships:**
- Many-to-one with `characteristic`

#### 4. `sample`
Measurement event/sample.

```sql
CREATE TABLE sample (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    char_id INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    batch_number TEXT,
    operator_id TEXT,
    is_excluded BOOLEAN DEFAULT 0,
    FOREIGN KEY(char_id) REFERENCES characteristic(id)
);
```

**Relationships:**
- Many-to-one with `characteristic`
- One-to-many with `measurement`
- One-to-many with `violation`

#### 5. `measurement`
Individual measurement values within a sample.

```sql
CREATE TABLE measurement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    value REAL NOT NULL,
    FOREIGN KEY(sample_id) REFERENCES sample(id)
);
```

**Relationships:**
- Many-to-one with `sample`

#### 6. `violation`
Nelson Rule violations.

```sql
CREATE TABLE violation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    rule_id INTEGER NOT NULL,
    rule_name TEXT,
    severity TEXT NOT NULL,  -- 'WARNING' or 'CRITICAL'
    acknowledged BOOLEAN DEFAULT 0,
    ack_user TEXT,
    ack_reason TEXT,
    ack_timestamp DATETIME,
    FOREIGN KEY(sample_id) REFERENCES sample(id)
);
```

**Relationships:**
- Many-to-one with `sample`

## ORM Models

All models are defined in `backend/src/openspc/db/models/`:

- `hierarchy.py` - `Hierarchy` model and `HierarchyType` enum
- `characteristic.py` - `Characteristic`, `CharacteristicRule` models and `ProviderType` enum
- `sample.py` - `Sample` and `Measurement` models
- `violation.py` - `Violation` model and `Severity` enum

### Example Usage

```python
from openspc.db import (
    DatabaseConfig,
    Hierarchy,
    Characteristic,
    Sample,
    Measurement,
    HierarchyType,
    ProviderType,
)
from sqlalchemy import select

# Initialize database
db = DatabaseConfig(database_url="sqlite+aiosqlite:///openspc.db")

# Create session and query
async with db.session() as session:
    # Query with relationships
    result = await session.execute(
        select(Hierarchy)
        .where(Hierarchy.type == HierarchyType.SITE.value)
    )
    sites = result.scalars().all()

    # Access relationships
    for site in sites:
        print(f"Site: {site.name}")
        for child in site.children:
            print(f"  Child: {child.name}")
            for char in child.characteristics:
                print(f"    Characteristic: {char.name}")
```

## Database Configuration

The database configuration is managed by the `DatabaseConfig` class in `backend/src/openspc/db/database.py`.

### Key Features

1. **Async Support**: Uses `aiosqlite` for async database operations
2. **Session Management**: Provides async context manager for sessions
3. **SQLite Optimizations**: Automatically enables WAL mode, foreign keys, and busy timeout
4. **Global Instance**: Provides `get_database()` and `set_database()` for global access

### Configuration Example

```python
from openspc.db import DatabaseConfig, set_database

# Create custom configuration
config = DatabaseConfig(
    database_url="sqlite+aiosqlite:///custom.db",
    echo=True,  # Enable SQL logging
)

# Set as global instance
set_database(config)
```

## Alembic Migrations

### Initial Setup

The initial migration is provided in `backend/alembic/versions/20260202_0000_initial_schema.py`.

### Running Migrations

```bash
# Upgrade to latest version
alembic upgrade head

# Downgrade one version
alembic downgrade -1

# Show current version
alembic current

# Show migration history
alembic history
```

### Creating New Migrations

```bash
# Auto-generate migration from model changes
alembic revision --autogenerate -m "description of changes"

# Create empty migration
alembic revision -m "description of changes"
```

## Seeding Data

Use the provided seed script to populate the database with development data:

```bash
# Seed the database
python scripts/seed_db.py

# Clear and recreate tables
python scripts/seed_db.py --clear
```

### Seed Data Structure

The seed script creates:
- **Raleigh_Site** (Site)
  - **Bottling_Line_A** (Line)
    - **Fill_Weight** characteristic (Manual entry, subgroup size 5)
    - **Fill_Volume** characteristic (MQTT tag, subgroup size 1)

## Testing

Run the database setup test to verify everything is working:

```bash
python scripts/test_db_setup.py
```

This test:
1. Creates an in-memory database
2. Creates all tables
3. Tests model creation and relationships
4. Verifies enum types
5. Tests query operations

## Performance Considerations

### Indexes

The initial migration creates indexes on frequently queried columns:
- `characteristic.hierarchy_id`
- `sample.char_id`
- `sample.timestamp`
- `measurement.sample_id`
- `violation.sample_id`
- `violation.acknowledged`

### SQLite Configuration

The database is configured with:
- **WAL Mode**: Allows concurrent reads while writing
- **Foreign Keys**: Enforces referential integrity
- **Busy Timeout**: 5000ms to handle concurrent access

### Best Practices

1. **Use transactions**: Always use the session context manager
2. **Eager loading**: Use `selectinload()` for relationships when needed
3. **Batch operations**: Use `session.add_all()` for multiple inserts
4. **Connection pooling**: Disabled for SQLite (uses NullPool)

## Integration with FastAPI

Use the `get_session()` dependency for FastAPI routes:

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from openspc.db import get_session

@app.get("/hierarchies")
async def list_hierarchies(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Hierarchy))
    return result.scalars().all()
```

## Enum Types

### HierarchyType
- `SITE`
- `AREA`
- `LINE`
- `CELL`
- `UNIT`

### ProviderType
- `MANUAL` - Manual data entry
- `TAG` - MQTT tag-based data

### Severity
- `WARNING` - Minor rule violation
- `CRITICAL` - Major rule violation

## File Structure

```
backend/
├── src/openspc/db/
│   ├── __init__.py              # Database exports
│   ├── database.py              # Database configuration
│   └── models/
│       ├── __init__.py          # Model exports
│       ├── hierarchy.py         # Hierarchy model
│       ├── characteristic.py    # Characteristic models
│       ├── sample.py            # Sample/Measurement models
│       └── violation.py         # Violation model
├── alembic/
│   ├── env.py                   # Alembic environment
│   ├── script.py.mako           # Migration template
│   └── versions/
│       └── 20260202_0000_initial_schema.py
├── alembic.ini                  # Alembic configuration
└── scripts/
    ├── seed_db.py               # Database seeding
    ├── test_db_setup.py         # Setup verification
    └── README.md                # Scripts documentation
```

## Troubleshooting

### Migration Issues

If you encounter migration issues:

```bash
# Check current version
alembic current

# View migration history
alembic history --verbose

# Stamp database to specific version (without running migrations)
alembic stamp head
```

### Database Locked Errors

If you get "database is locked" errors:
1. Ensure WAL mode is enabled (automatic in configuration)
2. Check that no other processes have the database open
3. Increase busy_timeout in database configuration

### Foreign Key Violations

Foreign keys are enforced by default. To disable temporarily:

```python
# Don't do this in production!
async with engine.begin() as conn:
    await conn.execute(text("PRAGMA foreign_keys=OFF"))
```

## Additional Resources

- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [ISA-95 Standard](https://www.isa.org/standards-and-publications/isa-standards/isa-standards-committees/isa95)
