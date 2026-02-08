"""Add annotation_history table for edit tracking.

Revision ID: 013
Revises: 012
Create Date: 2026-02-12

Adds:
- annotation_history table to record previous text values on edit
- Foreign key to annotation with CASCADE delete
- Index on annotation_id for efficient queries
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "013"
down_revision = "012b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "annotation_history",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("annotation_id", sa.Integer(), nullable=False),
        sa.Column("previous_text", sa.Text(), nullable=False),
        sa.Column("changed_by", sa.String(255), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["annotation_id"],
            ["annotation.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_annotation_history_annotation_id",
        "annotation_history",
        ["annotation_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_annotation_history_annotation_id",
        table_name="annotation_history",
    )
    op.drop_table("annotation_history")
