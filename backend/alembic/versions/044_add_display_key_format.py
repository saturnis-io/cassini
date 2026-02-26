"""Add display_key_format JSON column to system_settings.

Stores site-wide display key format configuration (date pattern, separator,
number placement, number digits) as a JSON blob on the singleton row.

Revision ID: 044
Revises: 043
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_settings",
        sa.Column("display_key_format", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("system_settings", "display_key_format")
