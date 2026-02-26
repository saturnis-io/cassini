"""Add system_settings table.

Single-row table for system-wide settings (date/datetime format tokens).

Revision ID: 042
Revises: 041
Create Date: 2026-02-26
"""

from alembic import op
import sqlalchemy as sa

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("date_format", sa.String(length=50), nullable=False),
        sa.Column("datetime_format", sa.String(length=50), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint("id = 1", name="ck_system_settings_singleton"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Seed the singleton row with defaults
    op.execute(
        "INSERT INTO system_settings (id, date_format, datetime_format) "
        "VALUES (1, 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss')"
    )


def downgrade() -> None:
    op.drop_table("system_settings")
