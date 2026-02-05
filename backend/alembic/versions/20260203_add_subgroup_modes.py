"""Add subgroup mode fields to characteristic and sample tables.

Revision ID: 002
Revises: 001
Create Date: 2026-02-03 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add subgroup mode columns to characteristic and sample tables."""
    # Add subgroup mode configuration to characteristic table
    op.add_column(
        "characteristic",
        sa.Column(
            "subgroup_mode",
            sa.String(),
            nullable=False,
            server_default="NOMINAL_TOLERANCE",
        ),
    )
    op.add_column(
        "characteristic",
        sa.Column("min_measurements", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "characteristic",
        sa.Column("warn_below_count", sa.Integer(), nullable=True),
    )
    op.add_column(
        "characteristic",
        sa.Column("stored_sigma", sa.Float(), nullable=True),
    )
    op.add_column(
        "characteristic",
        sa.Column("stored_center_line", sa.Float(), nullable=True),
    )

    # Add variable subgroup tracking to sample table
    op.add_column(
        "sample",
        sa.Column("actual_n", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "sample",
        sa.Column("is_undersized", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sample",
        sa.Column("effective_ucl", sa.Float(), nullable=True),
    )
    op.add_column(
        "sample",
        sa.Column("effective_lcl", sa.Float(), nullable=True),
    )
    op.add_column(
        "sample",
        sa.Column("z_score", sa.Float(), nullable=True),
    )

    # Backfill actual_n from measurement count
    # This updates existing samples with their actual measurement count
    op.execute(
        """
        UPDATE sample
        SET actual_n = (
            SELECT COUNT(*)
            FROM measurement
            WHERE measurement.sample_id = sample.id
        )
        """
    )


def downgrade() -> None:
    """Remove subgroup mode columns."""
    # Remove sample columns
    op.drop_column("sample", "z_score")
    op.drop_column("sample", "effective_lcl")
    op.drop_column("sample", "effective_ucl")
    op.drop_column("sample", "is_undersized")
    op.drop_column("sample", "actual_n")

    # Remove characteristic columns
    op.drop_column("characteristic", "stored_center_line")
    op.drop_column("characteristic", "stored_sigma")
    op.drop_column("characteristic", "warn_below_count")
    op.drop_column("characteristic", "min_measurements")
    op.drop_column("characteristic", "subgroup_mode")
