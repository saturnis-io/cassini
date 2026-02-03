#!/usr/bin/env python3
"""
Validates task updates against governance rules.
Called as a PreToolUse hook for TaskUpdate.

Environment variables expected:
- TOOL_INPUT: JSON string with task update parameters
- CURRENT_ROLE: The role attempting the update (optional)
"""

import json
import os
import sys
from pathlib import Path

def load_governance_matrix():
    """Load the governance matrix configuration."""
    matrix_path = Path('.company/governance-matrix.json')
    if matrix_path.exists():
        return json.loads(matrix_path.read_text())
    return None

def get_task_metadata(task_id):
    """
    Get task metadata. In practice, this would query the task system.
    For now, we'll check if there's a metadata file.
    """
    # This is a simplified implementation
    # In practice, would need to integrate with actual task system
    return {
        'owner': None,  # Unknown without task system query
        'governance': {
            'can_update': ['owner', 'tech-lead', 'senior-dev'],
            'can_complete': ['owner', 'tech-lead'],
        }
    }

def validate_update(tool_input, current_role, matrix):
    """
    Validate if the current role can perform this task update.

    Returns: (allowed: bool, reason: str)
    """
    task_id = tool_input.get('taskId')
    new_status = tool_input.get('status')

    if not task_id:
        return True, "No task ID, allowing"

    # Get task permissions from governance
    task_perms = matrix.get('task_permissions', {})

    # Check status update permissions
    if new_status == 'completed':
        allowed_roles = task_perms.get('complete_task', ['owner', 'senior-dev', 'tech-lead'])
        if current_role in allowed_roles or 'owner' in allowed_roles:
            return True, f"Role {current_role} can complete tasks"
        return False, f"Role {current_role} cannot complete tasks"

    if new_status == 'in_progress':
        # Generally allowed for claiming tasks
        return True, "Starting task is allowed"

    if new_status == 'deleted':
        allowed_roles = task_perms.get('delete_task', ['tech-lead', 'architect', 'cto'])
        if current_role in allowed_roles:
            return True, f"Role {current_role} can delete tasks"
        return False, f"Role {current_role} cannot delete tasks"

    # Check if modifying another's task
    if tool_input.get('owner') and current_role not in ['tech-lead', 'orchestrator']:
        return False, "Only tech-lead or orchestrator can reassign tasks"

    return True, "Update allowed"

def main():
    # Get tool input from environment or stdin
    tool_input_str = os.environ.get('TOOL_INPUT', '{}')
    current_role = os.environ.get('CURRENT_ROLE', 'unknown')

    try:
        tool_input = json.loads(tool_input_str)
    except json.JSONDecodeError:
        # If no valid input, allow (hook might be called differently)
        print("ALLOWED: No parseable input")
        sys.exit(0)

    # Load governance
    matrix = load_governance_matrix()

    if not matrix:
        # No governance, allow all
        print("ALLOWED: No governance matrix")
        sys.exit(0)

    # Validate
    allowed, reason = validate_update(tool_input, current_role, matrix)

    if allowed:
        print(f"ALLOWED: {reason}")
        sys.exit(0)
    else:
        print(f"BLOCKED: {reason}")
        sys.exit(1)

if __name__ == '__main__':
    main()
