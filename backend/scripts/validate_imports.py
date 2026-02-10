"""Validate that all database modules can be imported successfully."""

import sys
from pathlib import Path

# Add backend/src to Python path
backend_dir = Path(__file__).parent.parent
src_dir = backend_dir / "src"
sys.path.insert(0, str(src_dir))


def validate_imports() -> bool:
    """Validate all database-related imports."""
    errors = []

    print("=" * 60)
    print("OpenSPC Database Import Validation")
    print("=" * 60)

    # Test 1: Import Base and models
    print("\n1. Testing model imports...")
    try:
        from openspc.db.models import (
            Base,
            Characteristic,
            CharacteristicRule,
            Hierarchy,
            Measurement,
            Sample,
            Violation,
        )

        print("   ✓ Base imported")
        print("   ✓ Hierarchy imported")
        print("   ✓ Characteristic imported")
        print("   ✓ CharacteristicRule imported")
        print("   ✓ Sample imported")
        print("   ✓ Measurement imported")
        print("   ✓ Violation imported")
    except Exception as e:
        errors.append(f"Model imports failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 2: Import enums
    print("\n2. Testing enum imports...")
    try:
        from openspc.db.models import DataSourceType, HierarchyType, Severity, TriggerStrategy

        print("   ✓ HierarchyType imported")
        print(f"     Values: {[t.value for t in HierarchyType]}")

        print("   ✓ DataSourceType imported")
        print(f"     Values: {[d.value for d in DataSourceType]}")

        print("   ✓ TriggerStrategy imported")
        print(f"     Values: {[t.value for t in TriggerStrategy]}")

        print("   ✓ Severity imported")
        print(f"     Values: {[s.value for s in Severity]}")
    except Exception as e:
        errors.append(f"Enum imports failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 3: Import database configuration
    print("\n3. Testing database configuration imports...")
    try:
        from openspc.db.database import DatabaseConfig, get_database, set_database

        print("   ✓ DatabaseConfig imported")
        print("   ✓ get_database imported")
        print("   ✓ set_database imported")
    except Exception as e:
        errors.append(f"Database config imports failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 4: Import from main db module
    print("\n4. Testing main db module imports...")
    try:
        from openspc.db import (
            Base,
            Characteristic,
            CharacteristicRule,
            DatabaseConfig,
            DataSource,
            DataSourceType,
            Hierarchy,
            HierarchyType,
            Measurement,
            MQTTDataSource,
            OPCUADataSource,
            Sample,
            Severity,
            TriggerStrategy,
            Violation,
            get_database,
            get_session,
            set_database,
        )

        print("   ✓ All exports accessible from openspc.db")
    except Exception as e:
        errors.append(f"Main db module imports failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 5: Verify SQLAlchemy components
    print("\n5. Testing SQLAlchemy components...")
    try:
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
        from sqlalchemy.orm import selectinload

        print("   ✓ AsyncSession imported")
        print("   ✓ async_sessionmaker imported")
        print("   ✓ selectinload imported")
    except Exception as e:
        errors.append(f"SQLAlchemy imports failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 6: Check model metadata
    print("\n6. Testing model metadata...")
    try:
        from openspc.db.models import Base

        tables = Base.metadata.tables.keys()
        print(f"   ✓ Found {len(tables)} tables in metadata:")
        for table_name in sorted(tables):
            print(f"     - {table_name}")

        expected_tables = {
            "hierarchy",
            "characteristic",
            "characteristic_rules",
            "data_source",
            "mqtt_data_source",
            "opcua_data_source",
            "sample",
            "measurement",
            "violation",
        }
        if expected_tables.issubset(set(tables)):
            print("   ✓ All expected tables present")
        else:
            missing = expected_tables - set(tables)
            if missing:
                errors.append(f"Missing tables: {missing}")
                print(f"   ✗ Missing tables: {missing}")
    except Exception as e:
        errors.append(f"Model metadata check failed: {e}")
        print(f"   ✗ Error: {e}")

    # Test 7: Check model relationships
    print("\n7. Testing model relationships...")
    try:
        from openspc.db.models import Characteristic, Hierarchy, Sample

        # Check Hierarchy relationships
        hierarchy_attrs = dir(Hierarchy)
        assert "children" in hierarchy_attrs, "Hierarchy missing 'children' relationship"
        assert (
            "characteristics" in hierarchy_attrs
        ), "Hierarchy missing 'characteristics' relationship"
        print("   ✓ Hierarchy relationships defined")

        # Check Characteristic relationships
        char_attrs = dir(Characteristic)
        assert "hierarchy" in char_attrs, "Characteristic missing 'hierarchy' relationship"
        assert "rules" in char_attrs, "Characteristic missing 'rules' relationship"
        assert "samples" in char_attrs, "Characteristic missing 'samples' relationship"
        assert "data_source" in char_attrs, "Characteristic missing 'data_source' relationship"
        print("   ✓ Characteristic relationships defined")

        # Check Sample relationships
        sample_attrs = dir(Sample)
        assert "characteristic" in sample_attrs, "Sample missing 'characteristic' relationship"
        assert "measurements" in sample_attrs, "Sample missing 'measurements' relationship"
        assert "violations" in sample_attrs, "Sample missing 'violations' relationship"
        print("   ✓ Sample relationships defined")
    except Exception as e:
        errors.append(f"Relationship check failed: {e}")
        print(f"   ✗ Error: {e}")

    # Summary
    print("\n" + "=" * 60)
    if errors:
        print("VALIDATION FAILED")
        print("=" * 60)
        print("\nErrors encountered:")
        for i, error in enumerate(errors, 1):
            print(f"{i}. {error}")
        return False
    else:
        print("ALL IMPORTS VALIDATED SUCCESSFULLY ✓")
        print("=" * 60)
        print("\nThe database schema is ready to use!")
        return True


def main() -> None:
    """Main entry point."""
    success = validate_imports()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
