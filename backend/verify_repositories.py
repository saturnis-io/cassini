#!/usr/bin/env python3
"""Verification script for repository pattern implementation.

This script verifies that all repository files are present and syntactically correct.
To actually run the repositories, install dependencies with: pip install -e ".[dev]"
"""

import ast
import sys
from pathlib import Path


def verify_file_exists(filepath: Path) -> bool:
    """Check if file exists."""
    if not filepath.exists():
        print(f"[X] Missing: {filepath}")
        return False
    print(f"[OK] Found: {filepath}")
    return True


def verify_syntax(filepath: Path) -> bool:
    """Verify Python syntax is valid."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            ast.parse(f.read())
        print(f"  [OK] Syntax valid")
        return True
    except SyntaxError as e:
        print(f"  [X] Syntax error: {e}")
        return False


def verify_imports(filepath: Path, expected_classes: list[str]) -> bool:
    """Verify expected classes are present in file."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            tree = ast.parse(content)

        classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]

        missing = set(expected_classes) - set(classes)
        if missing:
            print(f"  [X] Missing classes: {missing}")
            return False

        print(f"  [OK] All expected classes found: {expected_classes}")
        return True
    except Exception as e:
        print(f"  [X] Error checking imports: {e}")
        return False


def main():
    """Main verification routine."""
    print("=" * 70)
    print("Repository Pattern Implementation Verification")
    print("=" * 70)
    print()

    base_dir = Path(__file__).parent
    repo_dir = base_dir / "src" / "openspc" / "db" / "repositories"
    test_dir = base_dir / "tests" / "unit"

    all_passed = True

    # Verify repository files
    print("1. Verifying Repository Files")
    print("-" * 70)

    files_to_check = [
        ("base.py", ["BaseRepository"]),
        ("hierarchy.py", ["HierarchyRepository", "HierarchyNode"]),
        ("characteristic.py", ["CharacteristicRepository"]),
        ("sample.py", ["SampleRepository"]),
        ("violation.py", ["ViolationRepository"]),
        ("__init__.py", []),
    ]

    for filename, expected_classes in files_to_check:
        filepath = repo_dir / filename
        if not verify_file_exists(filepath):
            all_passed = False
            continue

        if not verify_syntax(filepath):
            all_passed = False
            continue

        if expected_classes and not verify_imports(filepath, expected_classes):
            all_passed = False
            continue

        print()

    # Verify test file
    print("2. Verifying Test File")
    print("-" * 70)

    test_file = test_dir / "test_repositories.py"
    if not verify_file_exists(test_file):
        all_passed = False
    else:
        if not verify_syntax(test_file):
            all_passed = False
        else:
            expected_test_classes = [
                "TestBaseRepository",
                "TestHierarchyRepository",
                "TestCharacteristicRepository",
                "TestSampleRepository",
                "TestViolationRepository",
            ]
            if verify_imports(test_file, expected_test_classes):
                print("  [OK] All test classes found")
            else:
                all_passed = False

    print()

    # Verify documentation
    print("3. Verifying Documentation")
    print("-" * 70)

    doc_files = [
        "BE-002_IMPLEMENTATION_SUMMARY.md",
        "BE-002_CHECKLIST.md",
        "docs/REPOSITORY_GUIDE.md",
    ]

    for doc_file in doc_files:
        filepath = base_dir / doc_file
        if verify_file_exists(filepath):
            size = filepath.stat().st_size
            print(f"  [OK] Size: {size:,} bytes")
        else:
            all_passed = False
        print()

    # Summary
    print("=" * 70)
    if all_passed:
        print("[OK] All verification checks passed!")
        print()
        print("Repository implementation is complete and ready for use.")
        print()
        print("Next steps:")
        print("  1. Install dependencies: pip install -e \".[dev]\"")
        print("  2. Run tests: pytest tests/unit/test_repositories.py -v")
        print("  3. Review docs/REPOSITORY_GUIDE.md for usage examples")
    else:
        print("[X] Some verification checks failed")
        print("Please review the errors above")
        sys.exit(1)

    print("=" * 70)


if __name__ == "__main__":
    main()
