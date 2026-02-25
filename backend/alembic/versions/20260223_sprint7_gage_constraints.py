"""Sprint 7: Add unique constraint on gage_port (bridge_id, port_name).

Prevents duplicate port names per bridge, which would cause serial port
locking conflicts and MQTT topic collisions.

Revision ID: 035
Revises: 034
Create Date: 2026-02-23
"""
from alembic import op

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table("gage_port", naming_convention=naming_convention) as batch_op:
        batch_op.create_unique_constraint(
            "uq_gage_port_bridge_port",
            ["bridge_id", "port_name"],
        )


def downgrade() -> None:
    with op.batch_alter_table("gage_port", naming_convention=naming_convention) as batch_op:
        batch_op.drop_constraint("uq_gage_port_bridge_port", type_="unique")
