"""Add outbound publishing columns to mqtt_broker.

Revision ID: 019
Revises: 018
Create Date: 2026-02-10

Adds outbound_enabled, outbound_topic_prefix, outbound_format,
and outbound_rate_limit columns to mqtt_broker for MQTT outbound
publishing support.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.add_column(
            sa.Column(
                "outbound_enabled",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            )
        )
        batch_op.add_column(
            sa.Column(
                "outbound_topic_prefix",
                sa.String(200),
                nullable=False,
                server_default="openspc",
            )
        )
        batch_op.add_column(
            sa.Column(
                "outbound_format",
                sa.String(20),
                nullable=False,
                server_default="json",
            )
        )
        batch_op.add_column(
            sa.Column(
                "outbound_rate_limit",
                sa.Float(),
                nullable=False,
                server_default="1.0",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.drop_column("outbound_rate_limit")
        batch_op.drop_column("outbound_format")
        batch_op.drop_column("outbound_topic_prefix")
        batch_op.drop_column("outbound_enabled")
