"""Test script to verify database setup and models."""

import asyncio
import sys
from pathlib import Path

# Add backend/src to Python path
backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))

from sqlalchemy import select

from openspc.db import (
    Characteristic,
    CharacteristicRule,
    DatabaseConfig,
    DataSourceType,
    Hierarchy,
    HierarchyType,
    Measurement,
    Sample,
    Severity,
    TriggerStrategy,
    Violation,
)


async def test_database_setup() -> None:
    """Test database creation and basic operations."""
    print("=" * 60)
    print("OpenSPC Database Setup Test")
    print("=" * 60)

    # Use in-memory database for testing
    db_config = DatabaseConfig(
        database_url="sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    print("\n1. Creating database tables...")
    await db_config.create_tables()
    print("   ✓ Tables created successfully")

    print("\n2. Testing model creation and relationships...")

    async with db_config.session() as session:
        # Create hierarchy
        site = Hierarchy(
            name="Test_Site",
            type=HierarchyType.SITE.value,
            parent_id=None,
        )
        session.add(site)
        await session.flush()
        print(f"   ✓ Created Site: {site}")

        area = Hierarchy(
            name="Test_Area",
            type=HierarchyType.AREA.value,
            parent_id=site.id,
        )
        session.add(area)
        await session.flush()
        print(f"   ✓ Created Area: {area}")

        # Create characteristic
        char = Characteristic(
            hierarchy_id=area.id,
            name="Test_Characteristic",
            description="Test characteristic for validation",
            subgroup_size=5,
            target_value=100.0,
            usl=110.0,
            lsl=90.0,
            ucl=107.0,
            lcl=93.0,
        )
        session.add(char)
        await session.flush()
        print(f"   ✓ Created Characteristic: {char}")

        # Create characteristic rules
        for rule_id in [1, 2, 3]:
            rule = CharacteristicRule(
                char_id=char.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)
        await session.flush()
        print("   ✓ Created 3 CharacteristicRules")

        # Create sample with measurements
        sample = Sample(
            char_id=char.id,
            batch_number="BATCH001",
            operator_id="OP123",
            is_excluded=False,
        )
        session.add(sample)
        await session.flush()
        print(f"   ✓ Created Sample: {sample}")

        # Add measurements to sample
        for value in [98.5, 101.2, 99.8, 100.5, 102.1]:
            measurement = Measurement(
                sample_id=sample.id,
                value=value,
            )
            session.add(measurement)
        await session.flush()
        print("   ✓ Created 5 Measurements")

        # Create violation
        violation = Violation(
            sample_id=sample.id,
            rule_id=1,
            rule_name="One point beyond 3σ",
            severity=Severity.WARNING.value,
            acknowledged=False,
        )
        session.add(violation)
        await session.flush()
        print(f"   ✓ Created Violation: {violation}")

        await session.commit()

    print("\n3. Testing relationships and queries...")

    async with db_config.session() as session:
        # Query hierarchy with children
        result = await session.execute(
            select(Hierarchy).where(Hierarchy.name == "Test_Site")
        )
        site = result.scalar_one()
        print(f"   ✓ Site has {len(site.children)} child(ren)")
        print(f"   ✓ Area has {len(site.children[0].characteristics)} characteristic(s)")

        # Query characteristic with relationships
        result = await session.execute(
            select(Characteristic).where(Characteristic.name == "Test_Characteristic")
        )
        char = result.scalar_one()
        print(f"   ✓ Characteristic has {len(char.rules)} rule(s)")
        print(f"   ✓ Characteristic has {len(char.samples)} sample(s)")

        # Query sample with measurements and violations
        result = await session.execute(
            select(Sample).where(Sample.batch_number == "BATCH001")
        )
        sample = result.scalar_one()
        print(f"   ✓ Sample has {len(sample.measurements)} measurement(s)")
        print(f"   ✓ Sample has {len(sample.violations)} violation(s)")

        # Calculate average from measurements
        values = [m.value for m in sample.measurements]
        avg = sum(values) / len(values)
        print(f"   ✓ Average measurement value: {avg:.2f}")

    print("\n4. Testing enum types...")
    print(f"   ✓ HierarchyType values: {[h.value for h in HierarchyType]}")
    print(f"   ✓ DataSourceType values: {[d.value for d in DataSourceType]}")
    print(f"   ✓ TriggerStrategy values: {[t.value for t in TriggerStrategy]}")
    print(f"   ✓ Severity values: {[s.value for s in Severity]}")

    await db_config.dispose()

    print("\n" + "=" * 60)
    print("All tests passed! ✓")
    print("=" * 60)
    print("\nDatabase schema is ready for use.")
    print("\nNext steps:")
    print("1. Run 'alembic upgrade head' to apply migrations")
    print("2. Run 'python scripts/seed_db.py' to seed development data")
    print("=" * 60)


def main() -> None:
    """Main entry point."""
    try:
        asyncio.run(test_database_setup())
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
