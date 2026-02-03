"""Example usage of the SPC Engine.

This script demonstrates how to set up and use the SPC Engine
to process quality control samples through the complete SPC pipeline.
"""

import asyncio
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from openspc.core.engine.nelson_rules import NelsonRuleLibrary
from openspc.core.engine.rolling_window import RollingWindowManager
from openspc.core.engine.spc_engine import SPCEngine
from openspc.core.providers.protocol import SampleContext
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

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session_factory = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    return async_session_factory


async def create_test_characteristic(session: AsyncSession) -> Characteristic:
    """Create a test characteristic with all rules enabled."""
    # Create hierarchy
    hierarchy_repo = HierarchyRepository(session)
    factory = await hierarchy_repo.create(
        name="Demo Factory", description="Example factory for demo", parent_id=None
    )
    await session.commit()

    # Create characteristic
    char = Characteristic(
        hierarchy_id=factory.id,
        name="Widget Diameter",
        description="Diameter of manufactured widgets in mm",
        subgroup_size=5,  # 5 measurements per sample
        target_value=10.0,
        ucl=10.6,  # Upper Control Limit
        lcl=9.4,  # Lower Control Limit
        usl=11.0,  # Upper Spec Limit
        lsl=9.0,  # Lower Spec Limit
        provider_type=ProviderType.MANUAL,
    )
    session.add(char)
    await session.flush()

    # Enable all Nelson Rules
    for rule_id in range(1, 9):
        rule = CharacteristicRule(char_id=char.id, rule_id=rule_id, is_enabled=True)
        session.add(rule)

    await session.commit()
    await session.refresh(char)

    print(f"✓ Created characteristic: {char.name} (ID: {char.id})")
    print(f"  Subgroup size: {char.subgroup_size}")
    print(f"  Control limits: {char.lcl:.2f} - {char.ucl:.2f}")
    print()

    return char


async def main():
    """Run the SPC Engine demo."""
    print("=" * 60)
    print("SPC Engine Demo")
    print("=" * 60)
    print()

    # Setup
    session_factory = await setup_database()

    async with session_factory() as session:
        # Create test characteristic
        char = await create_test_characteristic(session)

        # Initialize SPC Engine
        sample_repo = SampleRepository(session)
        char_repo = CharacteristicRepository(session)
        violation_repo = ViolationRepository(session)
        window_manager = RollingWindowManager(
            sample_repo, max_cached_windows=100, window_size=25
        )
        rule_library = NelsonRuleLibrary()

        engine = SPCEngine(
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            window_manager=window_manager,
            rule_library=rule_library,
        )

        print("✓ SPC Engine initialized")
        print()

        # Example 1: Process in-control samples
        print("-" * 60)
        print("Example 1: In-Control Samples")
        print("-" * 60)

        in_control_samples = [
            [10.0, 10.1, 10.0, 9.9, 10.0],
            [10.1, 10.0, 10.2, 10.0, 10.1],
            [9.9, 10.0, 10.1, 10.0, 9.9],
        ]

        for i, measurements in enumerate(in_control_samples, 1):
            result = await engine.process_sample(
                characteristic_id=char.id,
                measurements=measurements,
                context=SampleContext(
                    batch_number=f"BATCH-{i:03d}",
                    operator_id="OP-001",
                    source="MANUAL",
                ),
            )
            await session.commit()

            print(f"Sample {i}:")
            print(f"  Mean: {result.mean:.3f} mm")
            print(f"  Range: {result.range_value:.3f} mm")
            print(f"  Zone: {result.zone}")
            print(f"  In Control: {result.in_control}")
            print(f"  Processing time: {result.processing_time_ms:.2f} ms")
            print()

        # Example 2: Out-of-control sample (Rule 1 - Outlier)
        print("-" * 60)
        print("Example 2: Out-of-Control Sample (Outlier)")
        print("-" * 60)

        outlier_measurements = [11.0, 11.1, 11.2, 11.0, 11.1]  # Mean = 11.08

        result = await engine.process_sample(
            characteristic_id=char.id,
            measurements=outlier_measurements,
            context=SampleContext(batch_number="BATCH-999", operator_id="OP-001"),
        )
        await session.commit()

        print(f"Sample (Outlier):")
        print(f"  Mean: {result.mean:.3f} mm")
        print(f"  Range: {result.range_value:.3f} mm")
        print(f"  Zone: {result.zone}")
        print(f"  In Control: {result.in_control}")
        print(f"  Sigma distance: {result.sigma_distance:.2f}σ")

        if result.violations:
            print(f"  VIOLATIONS DETECTED: {len(result.violations)}")
            for violation in result.violations:
                print(f"    - Rule {violation.rule_id}: {violation.rule_name}")
                print(f"      Severity: {violation.severity}")
                print(f"      Message: {violation.message}")
        print()

        # Example 3: Process shift (Rule 2 - 9 points above center)
        print("-" * 60)
        print("Example 3: Process Shift (9 points above center)")
        print("-" * 60)

        for i in range(9):
            # All measurements slightly above center (10.0)
            measurements = [10.2, 10.3, 10.2, 10.1, 10.2]

            result = await engine.process_sample(
                characteristic_id=char.id,
                measurements=measurements,
                context=SampleContext(batch_number=f"SHIFT-{i+1:03d}"),
            )
            await session.commit()

            if i < 8:
                print(f"Sample {i+1}: Mean={result.mean:.3f}, In Control={result.in_control}")
            else:
                # 9th sample should trigger Rule 2
                print(f"\nSample {i+1}: Mean={result.mean:.3f}, In Control={result.in_control}")
                if result.violations:
                    print(f"  SHIFT DETECTED!")
                    for violation in result.violations:
                        print(f"    - Rule {violation.rule_id}: {violation.rule_name}")
                        print(f"      {violation.message}")
                        print(f"      Involved samples: {len(violation.involved_sample_ids)}")
        print()

        # Example 4: Check violation repository
        print("-" * 60)
        print("Example 4: Query Violations")
        print("-" * 60)

        all_violations = await violation_repo.get_unacknowledged(char_id=char.id)
        print(f"Total unacknowledged violations: {len(all_violations)}")

        for v in all_violations:
            print(f"  - Violation {v.id}: Rule {v.rule_id} ({v.rule_name})")
            print(f"    Sample ID: {v.sample_id}")
            print(f"    Severity: {v.severity}")
            print(f"    Acknowledged: {v.acknowledged}")
        print()

        # Example 5: Acknowledge a violation
        if all_violations:
            print("-" * 60)
            print("Example 5: Acknowledge Violation")
            print("-" * 60)

            violation = all_violations[0]
            print(f"Acknowledging violation {violation.id}...")

            await violation_repo.acknowledge(
                violation_id=violation.id,
                user="john.doe",
                reason="Investigated - equipment calibration was in progress",
            )
            await session.commit()

            print(f"✓ Violation {violation.id} acknowledged by john.doe")
            print()

        # Example 6: Recalculate control limits
        print("-" * 60)
        print("Example 6: Recalculate Control Limits")
        print("-" * 60)

        center_line, ucl, lcl = await engine.recalculate_limits(
            characteristic_id=char.id, exclude_ooc=True
        )

        print(f"Recalculated control limits from historical data:")
        print(f"  Center Line: {center_line:.3f} mm")
        print(f"  UCL: {ucl:.3f} mm")
        print(f"  LCL: {lcl:.3f} mm")
        print()

        # Summary
        print("=" * 60)
        print("Demo Complete")
        print("=" * 60)
        print()
        print("The SPC Engine successfully:")
        print("  ✓ Processed in-control samples")
        print("  ✓ Detected outliers (Rule 1)")
        print("  ✓ Detected process shift (Rule 2)")
        print("  ✓ Tracked violations")
        print("  ✓ Allowed violation acknowledgment")
        print("  ✓ Recalculated control limits")
        print()


if __name__ == "__main__":
    asyncio.run(main())
