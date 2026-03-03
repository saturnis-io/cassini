"""Add sigma_method column to characteristic table.

Allows users to override the automatic sigma estimation method selection.
- NULL = auto (current behavior: moving_range for n=1, r_bar_d2 for n<=10, s_bar_c4 for n>10)
- 'r_bar_d2' = force R-bar/d2 method
- 's_bar_c4' = force S-bar/c4 method
- 'moving_range' = force moving range method

Revision ID: 049
Revises: 048
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa

revision = "049"
down_revision = "048"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "characteristic",
        sa.Column("sigma_method", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("characteristic", "sigma_method")
