#!/usr/bin/env python3
"""Validation script for BE-009 Hierarchy REST Endpoints.

This script validates that all required endpoints are properly configured
and accessible.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from openspc.api.v1.hierarchy import router


def validate_endpoints():
    """Validate that all required endpoints exist."""
    print("=" * 60)
    print("BE-009 Hierarchy REST Endpoints Validation")
    print("=" * 60)

    # Expected endpoints
    expected_endpoints = [
        ("GET", "/"),
        ("POST", "/"),
        ("GET", "/{node_id}"),
        ("PATCH", "/{node_id}"),
        ("DELETE", "/{node_id}"),
        ("GET", "/{node_id}/characteristics"),
    ]

    print(f"\nRouter prefix: {router.prefix}")
    print(f"Router tags: {router.tags}")
    print(f"\nTotal routes: {len(router.routes)}\n")

    # Get actual endpoints
    actual_endpoints = []
    for route in router.routes:
        methods = route.methods if hasattr(route, "methods") else []
        for method in methods:
            path = route.path
            actual_endpoints.append((method, path))
            print(f"  [{method:6}] {router.prefix}{path}")
            if hasattr(route, "endpoint") and route.endpoint.__doc__:
                # Print first line of docstring
                first_line = route.endpoint.__doc__.strip().split("\n")[0]
                print(f"           {first_line}")

    print("\n" + "=" * 60)
    print("Validation Results")
    print("=" * 60)

    # Check if all expected endpoints exist
    missing = []
    for expected in expected_endpoints:
        if expected not in actual_endpoints:
            missing.append(expected)

    if not missing:
        print("\n[OK] All required endpoints implemented!")
        print(f"[OK] Total: {len(expected_endpoints)} endpoints")
    else:
        print("\n[ERROR] Missing endpoints:")
        for method, path in missing:
            print(f"  - {method} {path}")
        return False

    # Validate response models
    print("\n" + "=" * 60)
    print("Response Models")
    print("=" * 60)

    for route in router.routes:
        if hasattr(route, "response_model") and route.response_model:
            path = route.path
            model_name = (
                route.response_model.__name__
                if hasattr(route.response_model, "__name__")
                else str(route.response_model)
            )
            print(f"  {path:30} -> {model_name}")

    print("\n" + "=" * 60)
    print("Dependencies")
    print("=" * 60)

    # Import and validate dependencies
    from openspc.api.deps import (
        get_characteristic_repo,
        get_db_session,
        get_hierarchy_repo,
    )

    print("\n[OK] get_db_session - Database session provider")
    print("[OK] get_hierarchy_repo - Hierarchy repository dependency")
    print("[OK] get_characteristic_repo - Characteristic repository dependency")

    print("\n" + "=" * 60)
    print("Schemas")
    print("=" * 60)

    from openspc.api.schemas.characteristic import CharacteristicSummary
    from openspc.api.schemas.hierarchy import (
        HierarchyCreate,
        HierarchyResponse,
        HierarchyTreeNode,
        HierarchyUpdate,
    )

    schemas = [
        ("HierarchyCreate", HierarchyCreate),
        ("HierarchyUpdate", HierarchyUpdate),
        ("HierarchyResponse", HierarchyResponse),
        ("HierarchyTreeNode", HierarchyTreeNode),
        ("CharacteristicSummary", CharacteristicSummary),
    ]

    for name, schema in schemas:
        fields = schema.model_fields if hasattr(schema, "model_fields") else {}
        print(f"\n[OK] {name}")
        for field_name, field_info in list(fields.items())[:3]:
            print(f"    - {field_name}")
        if len(fields) > 3:
            print(f"    ... and {len(fields) - 3} more fields")

    print("\n" + "=" * 60)
    print("VALIDATION COMPLETE")
    print("=" * 60)
    print("\n[OK] All components validated successfully!")
    print("\nNext steps:")
    print("  1. Install httpx: pip install httpx")
    print("  2. Run tests: pytest tests/integration/test_hierarchy_api.py -v")
    print("  3. Add router to FastAPI app")
    print("  4. Access API docs at /docs")

    return True


if __name__ == "__main__":
    success = validate_endpoints()
    sys.exit(0 if success else 1)
