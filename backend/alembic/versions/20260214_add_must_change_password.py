"""Add must_change_password to user table.

Revision ID: 015
Revises: 014
Create Date: 2026-02-14

Adds:
- must_change_password Boolean column to user table, defaults to False
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("user", "must_change_password")
