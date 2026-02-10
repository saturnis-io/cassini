"""Database seeding script for development environment.

Creates sample hierarchy and characteristics:
- Raleigh_Site
  - Bottling_Line_A
    - Fill_Weight characteristic (manual)
    - Fill_Volume characteristic (MQTT tag)
"""

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
    Hierarchy,
    HierarchyType,
    MQTTDataSource,
)


async def seed_database() -> None:
    """Seed the database with initial development data."""
    # Configure database
    db_path = backend_dir / "openspc.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=True,
    )

    print(f"Seeding database at: {db_path}")

    # Create tables if they don't exist
    await db_config.create_tables()

    async with db_config.session() as session:
        # Check if data already exists
        result = await session.execute(
            select(Hierarchy).where(Hierarchy.name == "Raleigh_Site")
        )
        existing_site = result.scalar_one_or_none()

        if existing_site:
            print("Database already seeded. Skipping...")
            return

        # Create Site
        site = Hierarchy(
            name="Raleigh_Site",
            type=HierarchyType.SITE.value,
            parent_id=None,
        )
        session.add(site)
        await session.flush()  # Get the ID
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

        # Create Characteristic 1: Fill Weight (Manual)
        char_fill_weight = Characteristic(
            hierarchy_id=line.id,
            name="Fill_Weight",
            description="Bottle fill weight in grams",
            subgroup_size=5,
            target_value=500.0,
            usl=510.0,  # Upper Spec Limit
            lsl=490.0,  # Lower Spec Limit
            ucl=507.0,  # Upper Control Limit
            lcl=493.0,  # Lower Control Limit
        )
        session.add(char_fill_weight)
        await session.flush()
        print(f"Created Characteristic: {char_fill_weight.name} (ID: {char_fill_weight.id})")

        # Enable Nelson Rules 1, 2, 3, 4 for Fill Weight
        for rule_id in [1, 2, 3, 4]:
            rule = CharacteristicRule(
                char_id=char_fill_weight.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)
        print(f"Enabled Nelson Rules 1-4 for {char_fill_weight.name}")

        # Create Characteristic 2: Fill Volume (MQTT)
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

        # Create MQTT data source for Fill Volume
        fill_volume_source = MQTTDataSource(
            characteristic_id=char_fill_volume.id,
            topic="plant/raleigh/line_a/fill_volume",
            trigger_tag="plant/raleigh/line_a/trigger",
            trigger_strategy="on_trigger",
            is_active=True,
        )
        session.add(fill_volume_source)
        await session.flush()
        print(f"Created MQTTDataSource for {char_fill_volume.name}")

        # Enable Nelson Rules 1, 2, 5, 6 for Fill Volume
        for rule_id in [1, 2, 5, 6]:
            rule = CharacteristicRule(
                char_id=char_fill_volume.id,
                rule_id=rule_id,
                is_enabled=True,
            )
            session.add(rule)
        print(f"Enabled Nelson Rules 1, 2, 5, 6 for {char_fill_volume.name}")

        await session.commit()
        print("\nDatabase seeded successfully!")

        # Display summary
        print("\n=== Seed Summary ===")
        print(f"Site: {site.name}")
        print(f"  Line: {line.name}")
        print(f"    Characteristic: {char_fill_weight.name} (Manual, Subgroup: 5)")
        print(f"    Characteristic: {char_fill_volume.name} (MQTT, Subgroup: 1)")

    await db_config.dispose()


async def clear_database() -> None:
    """Clear all data from the database."""
    db_path = backend_dir / "openspc.db"
    db_config = DatabaseConfig(
        database_url=f"sqlite+aiosqlite:///{db_path}",
        echo=True,
    )

    print(f"Clearing database at: {db_path}")
    await db_config.drop_tables()
    await db_config.create_tables()
    print("Database cleared successfully!")

    await db_config.dispose()


def main() -> None:
    """Main entry point."""
    if len(sys.argv) > 1 and sys.argv[1] == "--clear":
        asyncio.run(clear_database())
    else:
        asyncio.run(seed_database())


if __name__ == "__main__":
    main()
