"""Add product_code and product_json_path to data source tables.

Adds:
- mqtt_data_source.product_code (VARCHAR(100), nullable)
- mqtt_data_source.product_json_path (VARCHAR(255), nullable)
- opcua_data_source.product_code (VARCHAR(100), nullable)
- opcua_data_source.product_json_path (VARCHAR(255), nullable)

Revision ID: 048
Revises: 047
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa

revision = "048"
down_revision = "047"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table("mqtt_data_source", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("product_code", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("product_json_path", sa.String(255), nullable=True))

    with op.batch_alter_table("opcua_data_source", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("product_code", sa.String(100), nullable=True))
        batch_op.add_column(sa.Column("product_json_path", sa.String(255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("opcua_data_source", naming_convention=naming_convention) as batch_op:
        batch_op.drop_column("product_json_path")
        batch_op.drop_column("product_code")

    with op.batch_alter_table("mqtt_data_source", naming_convention=naming_convention) as batch_op:
        batch_op.drop_column("product_json_path")
        batch_op.drop_column("product_code")
