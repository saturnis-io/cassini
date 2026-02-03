#!/usr/bin/env python3
"""
Validates proposals against governance rules.
Called by hooks or orchestrator to check if a proposal can be auto-approved.
"""

import json
import sys
from pathlib import Path
from datetime import datetime

def load_governance_matrix():
    """Load the governance matrix configuration."""
    matrix_path = Path('.company/governance-matrix.json')
    if matrix_path.exists():
        return json.loads(matrix_path.read_text())
    return None

def load_config():
    """Load company configuration."""
    config_path = Path('.company/config.json')
    if config_path.exists():
        return json.loads(config_path.read_text())
    return None

def can_auto_approve(proposal, matrix, config):
    """
    Determine if a proposal can be auto-approved.

    Returns: (can_approve: bool, reason: str)
    """
    proposal_type = proposal.get('proposal_type')
    from_role = proposal.get('from_role')
    target_role = proposal.get('target_role', proposal.get('payload', {}).get('target_role'))

    auto_approve_rules = matrix.get('proposal_auto_approve', {})
    needs_review = matrix.get('proposal_needs_review', {})
    needs_ceo = matrix.get('proposal_needs_ceo', {})

    # Check if requires CEO
    if proposal_type in needs_ceo and needs_ceo[proposal_type]:
        return False, f"Proposal type '{proposal_type}' requires CEO approval"

    if proposal.get('requires_ceo_approval'):
        return False, "Proposal explicitly requires CEO approval"

    # Check auto-approve rules
    if proposal_type == 'create_task':
        # Check task creation permissions
        key = f"{from_role}_create_{target_role}_task"
        if auto_approve_rules.get('developer_create_qa_task') and from_role == 'developer' and target_role == 'qa':
            return True, "Developer can create QA tasks"
        if auto_approve_rules.get('tech_lead_create_developer_task') and from_role == 'tech-lead' and target_role == 'developer':
            return True, "Tech Lead can create Developer tasks"

        # Check task permissions matrix
        task_perms = matrix.get('task_permissions', {}).get('create_task', {})
        allowed_targets = task_perms.get(from_role, [])
        if target_role in allowed_targets:
            return True, f"{from_role} can create tasks for {target_role}"

        return False, f"{from_role} cannot auto-create tasks for {target_role}"

    if proposal_type == 'escalate':
        if auto_approve_rules.get('escalate_up'):
            return True, "Escalations are auto-approved for routing"
        return False, "Escalation requires review"

    if proposal_type == 'request_expertise':
        # Usually auto-approve expertise requests for routing
        return True, "Expertise requests are auto-approved for evaluation"

    if proposal_type == 'reject_handoff':
        if needs_review.get('reject_handoff'):
            return False, "Handoff rejections require review"
        return True, "Handoff rejection approved"

    if proposal_type == 'scope_change':
        return False, "Scope changes require CEO approval"

    # Default: require review
    return False, f"Unknown proposal type '{proposal_type}' requires review"

def validate_proposal_schema(proposal):
    """Validate that proposal has required fields."""
    required_fields = ['proposal_type', 'from_role', 'timestamp']
    missing = [f for f in required_fields if f not in proposal]

    if missing:
        return False, f"Missing required fields: {missing}"

    return True, "Schema valid"

def main():
    if len(sys.argv) < 2:
        print("Usage: validate_proposal.py <proposal_file>")
        sys.exit(1)

    proposal_path = Path(sys.argv[1])

    if not proposal_path.exists():
        print(f"ERROR: Proposal file not found: {proposal_path}")
        sys.exit(1)

    try:
        proposal = json.loads(proposal_path.read_text())
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in proposal: {e}")
        sys.exit(1)

    # Validate schema
    valid, reason = validate_proposal_schema(proposal)
    if not valid:
        print(f"INVALID: {reason}")
        sys.exit(1)

    # Load governance rules
    matrix = load_governance_matrix()
    config = load_config()

    if not matrix:
        print("WARNING: No governance matrix found, defaulting to require review")
        print("REVIEW_REQUIRED: No governance matrix")
        sys.exit(0)

    # Check auto-approve
    can_approve, reason = can_auto_approve(proposal, matrix, config)

    if can_approve:
        print(f"AUTO_APPROVE: {reason}")
        sys.exit(0)
    else:
        print(f"REVIEW_REQUIRED: {reason}")
        sys.exit(0)

if __name__ == '__main__':
    main()
