"""Initial schema for OpenSPC database.

Revision ID: 001
Revises:
Create Date: 2026-02-02 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all tables for OpenSPC schema."""
    # Create hierarchy table
    op.create_table(
        "hierarchy",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["hierarchy.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create characteristic table
    op.create_table(
        "characteristic",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("hierarchy_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("subgroup_size", sa.Integer(), nullable=False),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("usl", sa.Float(), nullable=True),
        sa.Column("lsl", sa.Float(), nullable=True),
        sa.Column("ucl", sa.Float(), nullable=True),
        sa.Column("lcl", sa.Float(), nullable=True),
        sa.Column("provider_type", sa.String(), nullable=False),
        sa.Column("mqtt_topic", sa.String(), nullable=True),
        sa.Column("trigger_tag", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(
            ["hierarchy_id"],
            ["hierarchy.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create characteristic_rules table
    op.create_table(
        "characteristic_rules",
        sa.Column("char_id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["char_id"],
            ["characteristic.id"],
        ),
        sa.PrimaryKeyConstraint("char_id", "rule_id"),
    )

    # Create sample table
    op.create_table(
        "sample",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("char_id", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("batch_number", sa.String(), nullable=True),
        sa.Column("operator_id", sa.String(), nullable=True),
        sa.Column("is_excluded", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["char_id"],
            ["characteristic.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create measurement table
    op.create_table(
        "measurement",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sample_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(
            ["sample_id"],
            ["sample.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create violation table
    op.create_table(
        "violation",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sample_id", sa.Integer(), nullable=False),
        sa.Column("rule_id", sa.Integer(), nullable=False),
        sa.Column("rule_name", sa.String(), nullable=True),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), nullable=False),
        sa.Column("ack_user", sa.String(), nullable=True),
        sa.Column("ack_reason", sa.String(), nullable=True),
        sa.Column("ack_timestamp", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["sample_id"],
            ["sample.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create indexes for common queries
    op.create_index(
        "ix_characteristic_hierarchy_id", "characteristic", ["hierarchy_id"], unique=False
    )
    op.create_index("ix_sample_char_id", "sample", ["char_id"], unique=False)
    op.create_index("ix_sample_timestamp", "sample", ["timestamp"], unique=False)
    op.create_index("ix_measurement_sample_id", "measurement", ["sample_id"], unique=False)
    op.create_index("ix_violation_sample_id", "violation", ["sample_id"], unique=False)
    op.create_index(
        "ix_violation_acknowledged", "violation", ["acknowledged"], unique=False
    )


def downgrade() -> None:
    """Drop all tables."""
    # Drop indexes first
    op.drop_index("ix_violation_acknowledged", table_name="violation")
    op.drop_index("ix_violation_sample_id", table_name="violation")
    op.drop_index("ix_measurement_sample_id", table_name="measurement")
    op.drop_index("ix_sample_timestamp", table_name="sample")
    op.drop_index("ix_sample_char_id", table_name="sample")
    op.drop_index("ix_characteristic_hierarchy_id", table_name="characteristic")

    # Drop tables in reverse order (respecting foreign keys)
    op.drop_table("violation")
    op.drop_table("measurement")
    op.drop_table("sample")
    op.drop_table("characteristic_rules")
    op.drop_table("characteristic")
    op.drop_table("hierarchy")
