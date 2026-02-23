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


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_gage_port_bridge_port",
        "gage_port",
        ["bridge_id", "port_name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_gage_port_bridge_port", "gage_port", type_="unique")
