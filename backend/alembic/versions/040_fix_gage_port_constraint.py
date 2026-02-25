"""Fix gage_port unique constraint for SQLite compatibility.

Revision ID: 040
Revises: 039
"""
from alembic import op

revision = "040"
down_revision = "039"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table("gage_port", naming_convention=naming_convention) as batch_op:
        try:
            batch_op.drop_constraint("uq_gage_port_bridge_port", type_="unique")
        except Exception:
            pass
        batch_op.create_unique_constraint(
            "uq_gage_port_bridge_port",
            ["bridge_id", "port_name"],
        )


def downgrade() -> None:
    with op.batch_alter_table("gage_port", naming_convention=naming_convention) as batch_op:
        batch_op.drop_constraint("uq_gage_port_bridge_port", type_="unique")
