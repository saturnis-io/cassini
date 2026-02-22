"""Sprint 5: Statistical credibility schema changes.

Adds columns for non-normal capability analysis, custom run rule parameters,
Laney p'/u' chart overdispersion correction, and a rule_preset table.

Revision ID: 032
Revises: 031
Create Date: 2026-02-21
"""
from alembic import op
import sqlalchemy as sa
import json

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None

# ---------------------------------------------------------------------------
# Built-in rule preset configurations
# ---------------------------------------------------------------------------

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
    {"rule_id": 1, "is_enabled": True,  "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True,  "parameters": {"consecutive_count": 8}},
    {"rule_id": 3, "is_enabled": True,  "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True,  "parameters": {"consecutive_count": 14}},
    {"rule_id": 5, "is_enabled": True,  "parameters": {"count": 2, "window": 3}},
    {"rule_id": 6, "is_enabled": True,  "parameters": {"count": 4, "window": 5}},
    {"rule_id": 7, "is_enabled": False, "parameters": {"consecutive_count": 15}},
    {"rule_id": 8, "is_enabled": False, "parameters": {"consecutive_count": 8}},
]

_WHEELER_RULES = [
    {"rule_id": 1, "is_enabled": True,  "parameters": {"sigma_multiplier": 3.0}},
    {"rule_id": 2, "is_enabled": True,  "parameters": {"consecutive_count": 8}},
    {"rule_id": 3, "is_enabled": True,  "parameters": {"consecutive_count": 6}},
    {"rule_id": 4, "is_enabled": True,  "parameters": {"consecutive_count": 14}},
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
    # -----------------------------------------------------------------------
    # 1. Add distribution-fitting and Laney-correction columns to characteristic
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.add_column(
            sa.Column("distribution_method", sa.String(30), nullable=True)
        )
        batch_op.add_column(
            sa.Column("box_cox_lambda", sa.Float(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("distribution_params", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "use_laney_correction",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )

    # -----------------------------------------------------------------------
    # 2. Add custom rule parameters column to characteristic_rules
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic_rules") as batch_op:
        batch_op.add_column(
            sa.Column("parameters", sa.Text(), nullable=True)
        )

    # -----------------------------------------------------------------------
    # 3. Create rule_preset table
    # -----------------------------------------------------------------------
    op.create_table(
        "rule_preset",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column(
            "is_builtin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("rules_config", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.UniqueConstraint("name", name="uq_rule_preset_name"),
    )

    # -----------------------------------------------------------------------
    # 4. Seed built-in presets
    # -----------------------------------------------------------------------
    for preset_name, preset_description, preset_rules in _PRESETS:
        op.execute(
            sa.text(
                "INSERT INTO rule_preset (name, description, is_builtin, rules_config) "
                "VALUES (:name, :description, 1, :rules_config)"
            ).bindparams(
                name=preset_name,
                description=preset_description,
                rules_config=json.dumps(preset_rules),
            )
        )


def downgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. Drop rule_preset table (includes seeded rows)
    # -----------------------------------------------------------------------
    op.drop_table("rule_preset")

    # -----------------------------------------------------------------------
    # 2. Remove parameters column from characteristic_rules
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic_rules") as batch_op:
        batch_op.drop_column("parameters")

    # -----------------------------------------------------------------------
    # 3. Remove new columns from characteristic
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.drop_column("use_laney_correction")
        batch_op.drop_column("distribution_params")
        batch_op.drop_column("box_cox_lambda")
        batch_op.drop_column("distribution_method")
