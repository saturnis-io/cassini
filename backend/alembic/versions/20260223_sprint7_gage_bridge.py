"""Sprint 7: RS-232/USB gage bridge schema.

Adds gage_bridge (registered bridge agents) and gage_port (serial port
configurations per bridge) tables for shop floor gage integration.

Revision ID: 034
Revises: 033
Create Date: 2026-02-23
"""
from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gage_bridge",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("api_key_hash", sa.String(128), nullable=False),
        sa.Column("mqtt_broker_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="offline"),
        sa.Column("last_heartbeat_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("registered_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_gage_bridge_plant_id_plant", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["mqtt_broker_id"], ["mqtt_broker.id"],
            name="fk_gage_bridge_mqtt_broker_id_mqtt_broker", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["registered_by"], ["user.id"],
            name="fk_gage_bridge_registered_by_user",
        ),
    )
    op.create_index("ix_gage_bridge_plant", "gage_bridge", ["plant_id"])

    op.create_table(
        "gage_port",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("bridge_id", sa.Integer(), nullable=False),
        sa.Column("port_name", sa.String(50), nullable=False),
        sa.Column("baud_rate", sa.Integer(), nullable=False, server_default="9600"),
        sa.Column("data_bits", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("parity", sa.String(10), nullable=False, server_default="none"),
        sa.Column("stop_bits", sa.Float(), nullable=False, server_default="1"),
        sa.Column("protocol_profile", sa.String(50), nullable=False, server_default="generic"),
        sa.Column("parse_pattern", sa.String(500), nullable=True),
        sa.Column("mqtt_topic", sa.String(500), nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["bridge_id"], ["gage_bridge.id"],
            name="fk_gage_port_bridge_id_gage_bridge", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"], ["characteristic.id"],
            name="fk_gage_port_characteristic_id_characteristic", ondelete="SET NULL",
        ),
    )
    op.create_index("ix_gage_port_bridge", "gage_port", ["bridge_id"])


def downgrade() -> None:
    op.drop_index("ix_gage_port_bridge", table_name="gage_port")
    op.drop_table("gage_port")
    op.drop_index("ix_gage_bridge_plant", table_name="gage_bridge")
    op.drop_table("gage_bridge")
