"""Add decimal_precision to characteristic.

Revision ID: 003
Revises: 002
Create Date: 2026-02-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add decimal_precision column to characteristic table."""
    op.add_column(
        "characteristic",
        sa.Column("decimal_precision", sa.Integer(), nullable=False, server_default="3"),
    )


def downgrade() -> None:
    """Remove decimal_precision column."""
    op.drop_column("characteristic", "decimal_precision")
