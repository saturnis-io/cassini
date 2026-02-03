# Database Quick Start Guide

This guide will help you get the OpenSPC database up and running quickly.

## Prerequisites

Ensure you have the required dependencies installed:

```bash
pip install -e .
```

## Step 1: Run Initial Migration

Apply the database schema using Alembic:

```bash
cd backend
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 001, Initial schema for OpenSPC database
```

## Step 2: Seed Development Data

Populate the database with sample data:

```bash
python scripts/seed_db.py
```

Expected output:
```
Created Site: Raleigh_Site (ID: 1)
Created Line: Bottling_Line_A (ID: 2)
Created Characteristic: Fill_Weight (ID: 1)
Enabled Nelson Rules 1-4 for Fill_Weight
Created Characteristic: Fill_Volume (ID: 2)
Enabled Nelson Rules 1, 2, 5, 6 for Fill_Volume
```

## Step 3: Verify Setup (Optional)

Run the test script to verify everything works:

```bash
python scripts/test_db_setup.py
```

## Quick Commands

### View Current Migration
```bash
alembic current
```

### View Migration History
```bash
alembic history
```

### Downgrade One Version
```bash
alembic downgrade -1
```

### Clear and Reseed Database
```bash
python scripts/seed_db.py --clear
python scripts/seed_db.py
```

## Database Location

By default, the database is created at:
```
backend/openspc.db
```

## Using the Database in Code

### Basic Query Example

```python
from openspc.db import get_database, Hierarchy
from sqlalchemy import select

async def list_sites():
    db = get_database()
    async with db.session() as session:
        result = await session.execute(
            select(Hierarchy).where(Hierarchy.type == "Site")
        )
        sites = result.scalars().all()
        for site in sites:
            print(f"Site: {site.name}")
```

### Creating a Sample with Measurements

```python
from openspc.db import get_database, Sample, Measurement
from datetime import datetime

async def create_sample(char_id: int, values: list[float]):
    db = get_database()
    async with db.session() as session:
        # Create sample
        sample = Sample(
            char_id=char_id,
            timestamp=datetime.utcnow(),
            batch_number="BATCH123",
            operator_id="OP001",
        )
        session.add(sample)
        await session.flush()  # Get sample.id

        # Add measurements
        for value in values:
            measurement = Measurement(
                sample_id=sample.id,
                value=value,
            )
            session.add(measurement)

        await session.commit()
        return sample.id
```

### Querying with Relationships

```python
from openspc.db import get_database, Characteristic
from sqlalchemy import select
from sqlalchemy.orm import selectinload

async def get_characteristic_with_samples(char_id: int):
    db = get_database()
    async with db.session() as session:
        result = await session.execute(
            select(Characteristic)
            .where(Characteristic.id == char_id)
            .options(
                selectinload(Characteristic.samples)
                .selectinload(Sample.measurements)
            )
        )
        char = result.scalar_one()

        print(f"Characteristic: {char.name}")
        print(f"Samples: {len(char.samples)}")
        for sample in char.samples:
            avg = sum(m.value for m in sample.measurements) / len(sample.measurements)
            print(f"  Sample {sample.id}: avg={avg:.2f}")
```

## Common Issues

### "No such table" Error
Run the migration: `alembic upgrade head`

### "Database is locked" Error
Ensure no other process is using the database. WAL mode should prevent this in most cases.

### Foreign Key Violations
Check that parent records exist before creating child records.

## Next Steps

1. **Read the full documentation**: See `DATABASE.md` for detailed information
2. **Create custom migrations**: Use `alembic revision --autogenerate -m "message"`
3. **Integrate with FastAPI**: Use the `get_session()` dependency
4. **Write tests**: See `tests/` directory for examples

## Support

For issues or questions:
- Check the full documentation in `DATABASE.md`
- Review the test script: `scripts/test_db_setup.py`
- Examine the model definitions in `src/openspc/db/models/`
