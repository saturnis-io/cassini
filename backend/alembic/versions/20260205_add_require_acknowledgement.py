"""Add require_acknowledgement to characteristic_rules and requires_acknowledgement to violation.

Revision ID: 005
Revises: 004
Create Date: 2026-02-05
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add require_acknowledgement columns to rules and violations."""
    # Add require_acknowledgement to characteristic_rules (default True)
    op.add_column(
        "characteristic_rules",
        sa.Column(
            "require_acknowledgement",
            sa.Boolean(),
            nullable=False,
            server_default="1"
        )
    )

    # Add requires_acknowledgement to violation (default True)
    op.add_column(
        "violation",
        sa.Column(
            "requires_acknowledgement",
            sa.Boolean(),
            nullable=False,
            server_default="1"
        )
    )


def downgrade() -> None:
    """Remove require_acknowledgement columns."""
    op.drop_column("violation", "requires_acknowledgement")
    op.drop_column("characteristic_rules", "require_acknowledgement")
