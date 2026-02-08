"""Add metric_name column to characteristic table.

Revision ID: 011
Revises: 010
Create Date: 2026-02-10

Adds:
- metric_name VARCHAR(255) nullable to characteristic table
- Stores the SparkplugB metric name within a topic payload
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "characteristic",
        sa.Column("metric_name", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("characteristic", "metric_name")
