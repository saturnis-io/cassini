#!/usr/bin/env python3
"""
Validates handoff documents between roles.
Ensures handoffs meet the required schema and quality standards.
"""

import json
import sys
from pathlib import Path

def load_governance_matrix():
    """Load the governance matrix configuration."""
    matrix_path = Path('.company/governance-matrix.json')
    if matrix_path.exists():
        return json.loads(matrix_path.read_text())
    return None

def validate_handoff(handoff_path, from_role, to_role):
    """
    Validate a handoff document.

    Returns: (valid: bool, errors: list, warnings: list)
    """
    errors = []
    warnings = []

    handoff_file = Path(handoff_path)

    # Check file exists
    if not handoff_file.exists():
        return False, [f"Handoff file not found: {handoff_path}"], []

    content = handoff_file.read_text()

    # Required sections
    required_sections = [
        '## Deliverables',
        '## Acceptance Criteria',
    ]

    for section in required_sections:
        if section not in content:
            errors.append(f"Missing required section: {section}")

    # Check for verification commands/section
    if '## Verification' not in content and '```bash' not in content:
        warnings.append("No verification commands found")

    # Check acceptance criteria format (should have checkboxes)
    if '## Acceptance Criteria' in content:
        ac_section = content.split('## Acceptance Criteria')[1]
        if '## ' in ac_section:
            ac_section = ac_section.split('## ')[0]

        if '- [ ]' not in ac_section and '- [x]' not in ac_section:
            errors.append("Acceptance criteria should use checkbox format (- [ ] or - [x])")

    # Check handoff permissions
    matrix = load_governance_matrix()
    if matrix:
        allowed = matrix.get('handoff_allowed', {})
        allowed_targets = allowed.get(from_role, [])
        if to_role not in allowed_targets:
            errors.append(f"Handoff not allowed: {from_role} -> {to_role}")

    # Check for context/summary
    if '## Context' not in content and '## Summary' not in content:
        warnings.append("Consider adding a Context or Summary section")

    valid = len(errors) == 0
    return valid, errors, warnings

def main():
    if len(sys.argv) < 4:
        print("Usage: validate_handoff.py <handoff_file> <from_role> <to_role>")
        sys.exit(1)

    handoff_path = sys.argv[1]
    from_role = sys.argv[2]
    to_role = sys.argv[3]

    valid, errors, warnings = validate_handoff(handoff_path, from_role, to_role)

    if warnings:
        for warning in warnings:
            print(f"WARNING: {warning}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"\nVALIDATION FAILED: {len(errors)} error(s)")
        sys.exit(1)
    else:
        print(f"VALIDATION PASSED: Handoff from {from_role} to {to_role} is valid")
        sys.exit(0)

if __name__ == '__main__':
    main()
