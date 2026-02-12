"""Add purge_history table for retention purge audit trail.

Revision ID: 022
Revises: 021
Create Date: 2026-02-11

Creates the purge_history table to record each purge engine execution
with statistics about samples/violations deleted per plant.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "purge_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("samples_deleted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("violations_deleted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("characteristics_processed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
    )

    op.create_index("ix_purge_history_plant_id", "purge_history", ["plant_id"])
    op.create_index(
        "ix_purge_history_started_at", "purge_history", ["started_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_purge_history_started_at", table_name="purge_history")
    op.drop_index("ix_purge_history_plant_id", table_name="purge_history")
    op.drop_table("purge_history")
