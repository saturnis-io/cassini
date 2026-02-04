"""Add MQTT broker configuration table.

Revision ID: 004
Revises: 003
Create Date: 2026-02-04
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create mqtt_broker table for MQTT connection configuration."""
    op.create_table(
        "mqtt_broker",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("host", sa.String(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="1883"),
        sa.Column("username", sa.String(length=100), nullable=True),
        sa.Column("password", sa.String(length=255), nullable=True),
        sa.Column("client_id", sa.String(length=100), nullable=False, server_default="openspc-client"),
        sa.Column("keepalive", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("max_reconnect_delay", sa.Integer(), nullable=False, server_default="300"),
        sa.Column("use_tls", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )


def downgrade() -> None:
    """Remove mqtt_broker table."""
    op.drop_table("mqtt_broker")
