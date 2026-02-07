"""Add annotation table for chart annotations.

Revision ID: 012
Revises: 011
Create Date: 2026-02-06

Adds:
- annotation table with point and period annotation support
- Foreign keys to characteristic and sample tables
- Index on characteristic_id for efficient queries
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "annotation",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column("annotation_type", sa.String(20), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("sample_id", sa.Integer(), nullable=True),
        sa.Column("start_sample_id", sa.Integer(), nullable=True),
        sa.Column("end_sample_id", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["characteristic_id"], ["characteristic.id"]),
        sa.ForeignKeyConstraint(["sample_id"], ["sample.id"]),
        sa.ForeignKeyConstraint(["start_sample_id"], ["sample.id"]),
        sa.ForeignKeyConstraint(["end_sample_id"], ["sample.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_annotation_characteristic_id",
        "annotation",
        ["characteristic_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_annotation_characteristic_id", table_name="annotation")
    op.drop_table("annotation")
