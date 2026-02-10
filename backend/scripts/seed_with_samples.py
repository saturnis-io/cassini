"""Extended database seeding script with sample data for testing.

Creates sample hierarchy, characteristics, and 30 samples with measurements
to provide data for control chart visualization.
"""

import asyncio
import random
import sys
from datetime import datetime, timedelta
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
    Hierarchy,
    HierarchyType,
)
from openspc.db.models.sample import Sample, Measurement


async def seed_database_with_samples() -> None:
    """Seed the database with hierarchy, characteristics, and sample data."""
    # Configure database
    db_path = backend_dir / "openspc.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=False,  # Reduce noise
    )

    print(f"Seeding database at: {db_path}")

    # Drop and recreate tables for clean slate
    await db_config.drop_tables()
    await db_config.create_tables()

    async with db_config.session() as session:
        # Create Site
        site = Hierarchy(
            name="Raleigh_Site",
            type=HierarchyType.SITE.value,
            parent_id=None,
        )
        session.add(site)
        await session.flush()
        print(f"Created Site: {site.name} (ID: {site.id})")

        # Create Line
        line = Hierarchy(
            name="Bottling_Line_A",
            type=HierarchyType.LINE.value,
            parent_id=site.id,
        )
        session.add(line)
        await session.flush()
        print(f"Created Line: {line.name} (ID: {line.id})")

        # Create second line for more testing
        line2 = Hierarchy(
            name="Bottling_Line_B",
            type=HierarchyType.LINE.value,
            parent_id=site.id,
        )
        session.add(line2)
        await session.flush()
        print(f"Created Line: {line2.name} (ID: {line2.id})")

        # Create Characteristic 1: Fill Weight (Manual, subgroup size 5)
        # Target: 500g, UCL: 507, LCL: 493 (3-sigma limits)
        char_fill_weight = Characteristic(
            hierarchy_id=line.id,
            name="Fill_Weight",
            description="Bottle fill weight in grams",
            subgroup_size=5,
            target_value=500.0,
            usl=510.0,
            lsl=490.0,
            ucl=507.0,
            lcl=493.0,
        )
        session.add(char_fill_weight)
        await session.flush()
        print(f"Created Characteristic: {char_fill_weight.name} (ID: {char_fill_weight.id})")

        # Enable Nelson Rules 1-4 for Fill Weight
        for rule_id in [1, 2, 3, 4]:
            rule = CharacteristicRule(
                char_id=char_fill_weight.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)

        # Create Characteristic 2: Fill Volume (Manual for testing, subgroup size 1)
        char_fill_volume = Characteristic(
            hierarchy_id=line.id,
            name="Fill_Volume",
            description="Bottle fill volume in milliliters",
            subgroup_size=1,
            target_value=500.0,
            usl=505.0,
            lsl=495.0,
            ucl=503.0,
            lcl=497.0,
        )
        session.add(char_fill_volume)
        await session.flush()
        print(f"Created Characteristic: {char_fill_volume.name} (ID: {char_fill_volume.id})")

        # Enable Nelson Rules for Fill Volume
        for rule_id in [1, 2, 5, 6]:
            rule = CharacteristicRule(
                char_id=char_fill_volume.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)

        # Create Characteristic 3: Pressure (on Line B)
        char_pressure = Characteristic(
            hierarchy_id=line2.id,
            name="Line_Pressure",
            description="Line pressure in PSI",
            subgroup_size=1,
            target_value=30.0,
            usl=35.0,
            lsl=25.0,
            ucl=33.0,
            lcl=27.0,
        )
        session.add(char_pressure)
        await session.flush()
        print(f"Created Characteristic: {char_pressure.name} (ID: {char_pressure.id})")

        for rule_id in [1, 2, 3]:
            rule = CharacteristicRule(
                char_id=char_pressure.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)

        # Generate sample data for Fill_Weight (30 samples)
        print("\nGenerating sample data for Fill_Weight...")
        base_time = datetime.utcnow() - timedelta(hours=30)
        random.seed(42)  # Reproducible

        for i in range(30):
            sample_time = base_time + timedelta(hours=i)

            # Create sample
            sample = Sample(
                char_id=char_fill_weight.id,
                timestamp=sample_time,
                batch_number=f"BATCH-{i+1:03d}",
                operator_id="operator1",
                is_excluded=False,
            )
            session.add(sample)
            await session.flush()

            # Generate 5 measurements for subgroup (mean ~500, std ~2)
            for j in range(5):
                # Add some variation, occasional shift to test rules
                base_value = 500.0
                if 15 <= i <= 22:  # Create a shift pattern
                    base_value = 504.0

                value = base_value + random.gauss(0, 2)
                measurement = Measurement(
                    sample_id=sample.id,
                    value=round(value, 2),
                )
                session.add(measurement)

        print(f"  Created 30 samples with 5 measurements each")

        # Generate sample data for Fill_Volume (25 samples)
        print("Generating sample data for Fill_Volume...")
        for i in range(25):
            sample_time = base_time + timedelta(hours=i)

            sample = Sample(
                char_id=char_fill_volume.id,
                timestamp=sample_time,
                batch_number=f"VOL-{i+1:03d}",
                operator_id="operator2",
                is_excluded=False,
            )
            session.add(sample)
            await session.flush()

            # Single measurement (subgroup size 1)
            value = 500.0 + random.gauss(0, 1.5)
            # Add one outlier at sample 12
            if i == 12:
                value = 505.5  # Beyond UCL

            measurement = Measurement(
                sample_id=sample.id,
                value=round(value, 2),
            )
            session.add(measurement)

        print(f"  Created 25 samples with 1 measurement each")

        # Generate sample data for Pressure (20 samples)
        print("Generating sample data for Line_Pressure...")
        for i in range(20):
            sample_time = base_time + timedelta(hours=i)

            sample = Sample(
                char_id=char_pressure.id,
                timestamp=sample_time,
                batch_number=f"PRES-{i+1:03d}",
                operator_id="operator3",
                is_excluded=False,
            )
            session.add(sample)
            await session.flush()

            value = 30.0 + random.gauss(0, 1.5)
            measurement = Measurement(
                sample_id=sample.id,
                value=round(value, 2),
            )
            session.add(measurement)

        print(f"  Created 20 samples with 1 measurement each")

        await session.commit()
        print("\n=== Database Seeded Successfully ===")
        print(f"\nHierarchy:")
        print(f"  {site.name}")
        print(f"    +-- {line.name}")
        print(f"    |     +-- {char_fill_weight.name} (30 samples)")
        print(f"    |     +-- {char_fill_volume.name} (25 samples)")
        print(f"    +-- {line2.name}")
        print(f"          +-- {char_pressure.name} (20 samples)")
        print(f"\nTotal: 3 characteristics, 75 samples")

    await db_config.dispose()


def main() -> None:
    """Main entry point."""
    asyncio.run(seed_database_with_samples())


if __name__ == "__main__":
    main()
