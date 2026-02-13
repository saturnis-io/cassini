"""Add attribute chart columns to characteristic and sample tables.

Revision ID: 023
Revises: 022
Create Date: 2026-02-12

Adds columns for attribute SPC charts (p, np, c, u):
- characteristic: data_type, attribute_chart_type, default_sample_size
- sample: defect_count, sample_size, units_inspected
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Characteristic columns
    op.add_column(
        "characteristic",
        sa.Column("data_type", sa.String(20), nullable=False, server_default="variable"),
    )
    op.add_column(
        "characteristic",
        sa.Column("attribute_chart_type", sa.String(10), nullable=True),
    )
    op.add_column(
        "characteristic",
        sa.Column("default_sample_size", sa.Integer(), nullable=True),
    )

    # Sample columns
    op.add_column(
        "sample",
        sa.Column("defect_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "sample",
        sa.Column("sample_size", sa.Integer(), nullable=True),
    )
    op.add_column(
        "sample",
        sa.Column("units_inspected", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    # Sample columns
    op.drop_column("sample", "units_inspected")
    op.drop_column("sample", "sample_size")
    op.drop_column("sample", "defect_count")

    # Characteristic columns
    op.drop_column("characteristic", "default_sample_size")
    op.drop_column("characteristic", "attribute_chart_type")
    op.drop_column("characteristic", "data_type")
