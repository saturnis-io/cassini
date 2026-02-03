#!/usr/bin/env python3
"""
Synchronization notification script.
Called after TaskUpdate to notify affected roles.

This script:
1. Reads the task that was updated
2. Determines who needs to be notified
3. Writes notification to affected role inboxes
4. Updates sync state
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime

def load_sync_state():
    """Load current sync state."""
    state_path = Path('.company/sync-state.json')
    if state_path.exists():
        return json.loads(state_path.read_text())
    return {
        'last_updated': None,
        'task_versions': {},
        'pending_notifications': []
    }

def save_sync_state(state):
    """Save sync state."""
    state_path = Path('.company/sync-state.json')
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state, indent=2))

def write_notification(role, notification):
    """Write notification to role's inbox."""
    inbox_path = Path(f'.company/inboxes/{role}')
    inbox_path.mkdir(parents=True, exist_ok=True)

    timestamp = int(datetime.now().timestamp())
    notif_type = notification.get('type', 'update')
    notif_file = inbox_path / f'{timestamp}-{notif_type}.json'

    notif_file.write_text(json.dumps(notification, indent=2))
    return str(notif_file)

def determine_notifications(task_id, new_status, updated_by):
    """
    Determine who should be notified about this update.

    Returns list of (role, notification) tuples.
    """
    notifications = []

    if new_status == 'completed':
        # Notify orchestrator
        notifications.append(('orchestrator', {
            'type': 'task_completed',
            'task_id': task_id,
            'completed_by': updated_by,
            'timestamp': datetime.now().isoformat()
        }))

        # Would also notify roles blocked by this task
        # (requires querying task dependencies)

    elif new_status == 'in_progress':
        # Notify orchestrator of task start
        notifications.append(('orchestrator', {
            'type': 'task_started',
            'task_id': task_id,
            'started_by': updated_by,
            'timestamp': datetime.now().isoformat()
        }))

    return notifications

def main():
    # Get update info from environment
    task_id = os.environ.get('TASK_ID')
    new_status = os.environ.get('NEW_STATUS')
    updated_by = os.environ.get('CURRENT_ROLE', 'unknown')

    if not task_id:
        # No task ID, nothing to do
        sys.exit(0)

    # Load sync state
    state = load_sync_state()

    # Update task version
    current_version = state['task_versions'].get(task_id, 0)
    state['task_versions'][task_id] = current_version + 1
    state['last_updated'] = datetime.now().isoformat()

    # Determine notifications
    notifications = determine_notifications(task_id, new_status, updated_by)

    # Write notifications
    for role, notification in notifications:
        notif_file = write_notification(role, notification)
        print(f"Notified {role}: {notif_file}")

    # Save sync state
    save_sync_state(state)

    print(f"Sync complete: task {task_id} version {state['task_versions'][task_id]}")

if __name__ == '__main__':
    main()
