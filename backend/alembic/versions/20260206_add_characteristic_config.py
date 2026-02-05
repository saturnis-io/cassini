"""Add characteristic_config table for polymorphic configuration.

Revision ID: 007
Revises: 006
Create Date: 2026-02-06

Adds:
- characteristic_config table to store ManualConfig or TagConfig JSON
- Unique foreign key to characteristic table with CASCADE delete
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "characteristic_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "characteristic_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("config_json", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), default=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_index(
        "ix_characteristic_config_characteristic_id",
        "characteristic_config",
        ["characteristic_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_characteristic_config_characteristic_id")
    op.drop_table("characteristic_config")
