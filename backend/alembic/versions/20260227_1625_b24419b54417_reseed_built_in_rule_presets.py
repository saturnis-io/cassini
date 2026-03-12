"""reseed built-in rule presets

Migration 041 (batch_alter_table on rule_preset) dropped the 4 built-in
presets originally seeded in migration 032 due to SQLite table recreation.
This migration re-inserts them if they are missing.

Revision ID: b24419b54417
Revises: 1dcf6aaa092f
Create Date: 2026-02-27 16:25:26.912371+00:00
"""

import json

from alembic import op
import sqlalchemy as sa

revision = 'b24419b54417'
down_revision = '1dcf6aaa092f'
branch_labels = None
depends_on = None

_NELSON_RULES = [
    {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 9}},
    {"rule_id": 3, "is_enabled": True, "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True, "parameters": {"consecutive_count": 14}},
    {"rule_id": 5, "is_enabled": True, "parameters": {"count": 2, "window": 3}},
    {"rule_id": 6, "is_enabled": True, "parameters": {"count": 4, "window": 5}},
    {"rule_id": 7, "is_enabled": True, "parameters": {"consecutive_count": 15}},
    {"rule_id": 8, "is_enabled": True, "parameters": {"consecutive_count": 8}},
]

_AIAG_RULES = [
    {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 7}},
    {"rule_id": 3, "is_enabled": True, "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True, "parameters": {"consecutive_count": 14}},
    {"rule_id": 5, "is_enabled": True, "parameters": {"count": 2, "window": 3}},
    {"rule_id": 6, "is_enabled": True, "parameters": {"count": 4, "window": 5}},
    {"rule_id": 7, "is_enabled": True, "parameters": {"consecutive_count": 15}},
    {"rule_id": 8, "is_enabled": True, "parameters": {"consecutive_count": 8}},
]

_WESTERN_ELECTRIC_RULES = [
    {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 8}},
    {"rule_id": 3, "is_enabled": True, "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True, "parameters": {"consecutive_count": 14}},
    {"rule_id": 5, "is_enabled": True, "parameters": {"count": 2, "window": 3}},
    {"rule_id": 6, "is_enabled": True, "parameters": {"count": 4, "window": 5}},
    {"rule_id": 7, "is_enabled": False, "parameters": {"consecutive_count": 15}},
    {"rule_id": 8, "is_enabled": False, "parameters": {"consecutive_count": 8}},
]

_WHEELER_RULES = [
    {"rule_id": 1, "is_enabled": True, "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True, "parameters": {"consecutive_count": 8}},
    {"rule_id": 3, "is_enabled": True, "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True, "parameters": {"consecutive_count": 14}},
    {"rule_id": 5, "is_enabled": False, "parameters": {"count": 2, "window": 3}},
    {"rule_id": 6, "is_enabled": False, "parameters": {"count": 4, "window": 5}},
    {"rule_id": 7, "is_enabled": False, "parameters": {"consecutive_count": 15}},
    {"rule_id": 8, "is_enabled": False, "parameters": {"consecutive_count": 8}},
]

_PRESETS = [
    (
        "Nelson (Standard)",
        "Classic 8-rule Nelson ruleset as defined in the 1984 Journal of Quality Technology. "
        "Rule 2 uses the original 9-point run threshold.",
        _NELSON_RULES,
    ),
    (
        "AIAG",
        "AIAG SPC Reference Manual ruleset. Identical to Nelson except Rule 2 uses a "
        "7-point run threshold as recommended by the Automotive Industry Action Group.",
        _AIAG_RULES,
    ),
    (
        "Western Electric",
        "Western Electric Statistical Quality Control Handbook ruleset. Uses an 8-point "
        "run threshold for Rule 2. Rules 7 and 8 are disabled as per the original handbook.",
        _WESTERN_ELECTRIC_RULES,
    ),
    (
        "Wheeler",
        "Donald Wheeler's ruleset from 'Understanding Statistical Process Control'. "
        "Uses an 8-point run threshold and enables only the four primary sensitising rules.",
        _WHEELER_RULES,
    ),
]


def upgrade() -> None:
    conn = op.get_bind()

    for preset_name, preset_description, preset_rules in _PRESETS:
        # Only insert if not already present (idempotent)
        existing = conn.execute(
            sa.text("SELECT COUNT(*) FROM rule_preset WHERE name = :name AND is_builtin = true"),
            {"name": preset_name},
        ).scalar()
        if not existing:
            conn.execute(
                sa.text(
                    "INSERT INTO rule_preset (name, description, is_builtin, rules_config) "
                    "VALUES (:name, :description, true, :rules_config)"
                ),
                {
                    "name": preset_name,
                    "description": preset_description,
                    "rules_config": json.dumps(preset_rules),
                },
            )


def downgrade() -> None:
    # Remove the re-seeded built-in presets
    op.execute(
        sa.text("DELETE FROM rule_preset WHERE is_builtin = 1")
    )
