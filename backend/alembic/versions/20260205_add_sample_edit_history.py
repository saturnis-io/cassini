"""Add sample edit history tracking

Revision ID: 20260205_edit_history
Revises: 20260205_add_require_acknowledgement
Create Date: 2026-02-05

Adds:
- is_modified column to sample table
- sample_edit_history table for audit trail
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_modified column to sample table
    op.add_column(
        "sample",
        sa.Column("is_modified", sa.Boolean(), nullable=False, server_default="0"),
    )

    # Create sample_edit_history table
    op.create_table(
        "sample_edit_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sample_id", sa.Integer(), nullable=False),
        sa.Column("edited_at", sa.DateTime(), nullable=False),
        sa.Column("edited_by", sa.String(255), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("previous_values", sa.Text(), nullable=False),
        sa.Column("new_values", sa.Text(), nullable=False),
        sa.Column("previous_mean", sa.Float(), nullable=False),
        sa.Column("new_mean", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["sample_id"], ["sample.id"], ondelete="CASCADE"),
    )

    # Create index for efficient lookup by sample_id
    op.create_index(
        "ix_sample_edit_history_sample_id",
        "sample_edit_history",
        ["sample_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_sample_edit_history_sample_id", table_name="sample_edit_history")
    op.drop_table("sample_edit_history")
    op.drop_column("sample", "is_modified")
