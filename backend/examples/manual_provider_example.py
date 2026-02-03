"""Example usage of the ManualProvider with SPC Engine.

This script demonstrates how to set up and use the ManualProvider
to submit operator-entered measurements to the SPC processing pipeline.
"""

import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.manual import ManualProvider
from openspc.core.providers.protocol import SampleEvent
from openspc.db.models import Base
from openspc.db.models.characteristic import Characteristic, CharacteristicRule, ProviderType
from openspc.db.models.hierarchy import Hierarchy
from openspc.db.repositories import (
    CharacteristicRepository,
    HierarchyRepository,
    SampleRepository,
    ViolationRepository,
)


async def setup_database():
    """Create in-memory database for demo."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session factory
    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    return engine, async_session_factory


async def create_test_data(session: AsyncSession):
    """Create test hierarchy and characteristics."""
    # Create hierarchy
    factory = Hierarchy(name="Demo Factory", type="FACTORY")
    session.add(factory)
    await session.flush()

    # Create manual characteristic (subgroup size = 3)
    char = Characteristic(
        hierarchy_id=factory.id,
        name="Shaft Diameter",
        description="Diameter of machined shaft (mm)",
        subgroup_size=3,
        target_value=25.0,
        usl=25.5,
        lsl=24.5,
        ucl=25.3,
        lcl=24.7,
        provider_type=ProviderType.MANUAL,
    )
    session.add(char)
    await session.flush()

    # Enable all Nelson Rules
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        session.add(rule)

    await session.commit()
    return char


async def main():
    """Main demo function."""
    print("=" * 70)
    print("ManualProvider Integration Example")
    print("=" * 70)

    # Setup database
    engine, session_factory = await setup_database()

    async with session_factory() as session:
        # Create test data
        char = await create_test_data(session)
        print(f"\nCreated characteristic: {char.name}")
        print(f"  Subgroup size: {char.subgroup_size}")
        print(f"  Provider type: {char.provider_type}")
        print(f"  Target: {char.target_value} mm")
        print(f"  USL/LSL: {char.usl}/{char.lsl} mm")
        print(f"  UCL/LCL: {char.ucl}/{char.lcl} mm")

        # Initialize repositories
        char_repo = CharacteristicRepository(session)
        sample_repo = SampleRepository(session)
        violation_repo = ViolationRepository(session)

        # Initialize SPC components
        window_manager = RollingWindowManager(sample_repository=sample_repo)
        rule_library = NelsonRuleLibrary()

        # Initialize SPC Engine
        spc_engine = SPCEngine(
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            window_manager=window_manager,
            rule_library=rule_library,
        )

        # Initialize ManualProvider
        manual_provider = ManualProvider(char_repo=char_repo)

        # Define callback to process samples through SPC engine
        async def process_sample(event: SampleEvent) -> None:
            """Process sample event through SPC engine."""
            result = await spc_engine.process_sample(
                characteristic_id=event.characteristic_id,
                measurements=event.measurements,
                context=event.context,
            )

            # Display results
            print(f"\n  Sample #{result.sample_id}:")
            print(f"    Measurements: {event.measurements}")
            print(f"    Mean: {result.mean:.3f} mm")
            print(f"    Range: {result.range_value:.3f} mm")
            print(f"    Zone: {result.zone}")
            print(f"    Sigma distance: {result.sigma_distance:.2f}σ")
            print(f"    In control: {result.in_control}")
            if not result.in_control:
                print(f"    Violations:")
                for v in result.violations:
                    print(f"      - Rule {v.rule_id}: {v.rule_name} ({v.severity})")

            await session.commit()

        # Wire up provider with callback
        manual_provider.set_callback(process_sample)

        print("\n" + "=" * 70)
        print("Submitting Manual Samples")
        print("=" * 70)

        # Submit samples with different scenarios
        print("\n1. In-control samples:")
        await manual_provider.submit_sample(
            characteristic_id=char.id,
            measurements=[25.0, 25.1, 24.9],
            operator_id="OPR-001",
            batch_number="BATCH-001",
        )

        await manual_provider.submit_sample(
            characteristic_id=char.id,
            measurements=[25.05, 24.95, 25.02],
            operator_id="OPR-001",
            batch_number="BATCH-001",
        )

        await manual_provider.submit_sample(
            characteristic_id=char.id,
            measurements=[24.98, 25.03, 25.01],
            operator_id="OPR-002",
            batch_number="BATCH-001",
        )

        print("\n2. Out-of-control sample (beyond UCL):")
        await manual_provider.submit_sample(
            characteristic_id=char.id,
            measurements=[25.4, 25.5, 25.45],  # Mean ~25.45, above UCL
            operator_id="OPR-001",
            batch_number="BATCH-001",
        )

        print("\n3. Another in-control sample:")
        await manual_provider.submit_sample(
            characteristic_id=char.id,
            measurements=[25.0, 25.0, 25.0],
            operator_id="OPR-002",
            batch_number="BATCH-002",
        )

        # Demonstrate validation errors
        print("\n" + "=" * 70)
        print("Demonstrating Validation Errors")
        print("=" * 70)

        # Error: Wrong measurement count
        print("\n1. Wrong measurement count:")
        try:
            await manual_provider.submit_sample(
                characteristic_id=char.id,
                measurements=[25.0, 25.1],  # Only 2 instead of 3
                operator_id="OPR-001",
            )
        except ValueError as e:
            print(f"   ✓ Caught expected error: {e}")

        # Error: Characteristic not found
        print("\n2. Characteristic not found:")
        try:
            await manual_provider.submit_sample(
                characteristic_id=999,
                measurements=[25.0, 25.1, 25.2],
                operator_id="OPR-001",
            )
        except ValueError as e:
            print(f"   ✓ Caught expected error: {e}")

        # Create TAG characteristic to test provider type validation
        tag_char = Characteristic(
            hierarchy_id=factory.id,
            name="Temperature Sensor",
            subgroup_size=1,
            provider_type=ProviderType.TAG,
            mqtt_topic="factory/line1/temp",
        )
        session.add(tag_char)
        await session.commit()

        print("\n3. Wrong provider type (TAG instead of MANUAL):")
        try:
            await manual_provider.submit_sample(
                characteristic_id=tag_char.id,
                measurements=[100.5],
                operator_id="OPR-001",
            )
        except ValueError as e:
            print(f"   ✓ Caught expected error: {e}")

    print("\n" + "=" * 70)
    print("Demo Complete!")
    print("=" * 70)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
