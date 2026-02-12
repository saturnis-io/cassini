"""Add retention_policy table for SPC data lifecycle management.

Revision ID: 021
Revises: 020
Create Date: 2026-02-11

Creates the retention_policy table with:
- Plant-scoped global defaults
- Hierarchy-level overrides
- Characteristic-level overrides
- CHECK constraints for scope/type consistency
- CASCADE FKs for hierarchy and characteristic deletion
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "retention_policy",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column(
            "hierarchy_id",
            sa.Integer(),
            sa.ForeignKey("hierarchy.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "characteristic_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("retention_type", sa.String(20), nullable=False),
        sa.Column("retention_value", sa.Integer(), nullable=True),
        sa.Column("retention_unit", sa.String(10), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "plant_id", "scope", "hierarchy_id", "characteristic_id",
            name="uq_retention_policy_scope_target",
        ),
        sa.CheckConstraint(
            "(scope = 'global' AND hierarchy_id IS NULL AND characteristic_id IS NULL) OR "
            "(scope = 'hierarchy' AND hierarchy_id IS NOT NULL AND characteristic_id IS NULL) OR "
            "(scope = 'characteristic' AND characteristic_id IS NOT NULL AND hierarchy_id IS NULL)",
            name="ck_retention_policy_scope",
        ),
        sa.CheckConstraint(
            "(retention_type = 'forever' AND retention_value IS NULL AND retention_unit IS NULL) OR "
            "(retention_type = 'sample_count' AND retention_value IS NOT NULL AND retention_unit IS NULL) OR "
            "(retention_type = 'time_delta' AND retention_value IS NOT NULL AND retention_unit IS NOT NULL)",
            name="ck_retention_policy_type_value",
        ),
    )

    # Indexes for common queries
    op.create_index("ix_retention_policy_plant_id", "retention_policy", ["plant_id"])
    op.create_index("ix_retention_policy_hierarchy_id", "retention_policy", ["hierarchy_id"])
    op.create_index(
        "ix_retention_policy_characteristic_id", "retention_policy", ["characteristic_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_retention_policy_characteristic_id", table_name="retention_policy")
    op.drop_index("ix_retention_policy_hierarchy_id", table_name="retention_policy")
    op.drop_index("ix_retention_policy_plant_id", table_name="retention_policy")
    op.drop_table("retention_policy")
