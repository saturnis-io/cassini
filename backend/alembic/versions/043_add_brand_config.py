"""Add brand_config JSON column to system_settings.

Stores enterprise branding configuration (colors, fonts, logo, visual style)
as a JSON blob on the singleton system_settings row.

Revision ID: 043
Revises: 042
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa

revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "system_settings",
        sa.Column("brand_config", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("system_settings", "brand_config")
