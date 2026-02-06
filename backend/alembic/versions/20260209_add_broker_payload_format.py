"""Add payload_format column to mqtt_broker table.

Revision ID: 010
Revises: 009
Create Date: 2026-02-09

Adds:
- payload_format VARCHAR(20) NOT NULL DEFAULT 'json' to mqtt_broker table
- Existing brokers default to 'json' for backward compatibility
- Valid values: 'protobuf', 'json'
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mqtt_broker",
        sa.Column(
            "payload_format",
            sa.String(20),
            nullable=False,
            server_default="json",
        ),
    )


def downgrade() -> None:
    op.drop_column("mqtt_broker", "payload_format")
