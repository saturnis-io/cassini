"""Add CUSUM and EWMA chart type support.

Revision ID: 028
Revises: 027
Create Date: 2026-02-13

Adds columns to `characteristic` table for CUSUM/EWMA configuration
and columns to `sample` table for running CUSUM/EWMA values.

CUSUM (Cumulative Sum) detects small persistent shifts in process mean.
EWMA (Exponentially Weighted Moving Average) detects small shifts with
weighted recent data emphasis.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "028"
down_revision = "027"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add CUSUM/EWMA columns to characteristic and sample tables."""

    # -----------------------------------------------------------------------
    # 1. characteristic: Add chart_type and CUSUM/EWMA configuration columns
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.add_column(
            sa.Column(
                "chart_type",
                sa.String(20),
                nullable=True,
                comment="Advanced chart type: cusum, ewma, or NULL for standard",
            )
        )
        batch_op.add_column(
            sa.Column(
                "cusum_target",
                sa.Float(),
                nullable=True,
                comment="CUSUM target value (process mean)",
            )
        )
        batch_op.add_column(
            sa.Column(
                "cusum_k",
                sa.Float(),
                nullable=True,
                comment="CUSUM slack value (allowance), typical 0.5",
            )
        )
        batch_op.add_column(
            sa.Column(
                "cusum_h",
                sa.Float(),
                nullable=True,
                comment="CUSUM decision interval, typical 4 or 5",
            )
        )
        batch_op.add_column(
            sa.Column(
                "ewma_lambda",
                sa.Float(),
                nullable=True,
                comment="EWMA smoothing constant (0-1), typical 0.2",
            )
        )
        batch_op.add_column(
            sa.Column(
                "ewma_l",
                sa.Float(),
                nullable=True,
                comment="EWMA control limit multiplier, typical 2.7",
            )
        )

    # -----------------------------------------------------------------------
    # 2. sample: Add running CUSUM/EWMA values
    # -----------------------------------------------------------------------
    with op.batch_alter_table("sample") as batch_op:
        batch_op.add_column(
            sa.Column(
                "cusum_high",
                sa.Float(),
                nullable=True,
                comment="Running CUSUM+ (upper) value",
            )
        )
        batch_op.add_column(
            sa.Column(
                "cusum_low",
                sa.Float(),
                nullable=True,
                comment="Running CUSUM- (lower) value",
            )
        )
        batch_op.add_column(
            sa.Column(
                "ewma_value",
                sa.Float(),
                nullable=True,
                comment="Running EWMA value",
            )
        )


def downgrade() -> None:
    """Remove CUSUM/EWMA columns from characteristic and sample tables."""

    with op.batch_alter_table("sample") as batch_op:
        batch_op.drop_column("ewma_value")
        batch_op.drop_column("cusum_low")
        batch_op.drop_column("cusum_high")

    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.drop_column("ewma_l")
        batch_op.drop_column("ewma_lambda")
        batch_op.drop_column("cusum_h")
        batch_op.drop_column("cusum_k")
        batch_op.drop_column("cusum_target")
        batch_op.drop_column("chart_type")
