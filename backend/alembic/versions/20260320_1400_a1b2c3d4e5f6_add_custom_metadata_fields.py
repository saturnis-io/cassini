"""Add custom metadata fields for I8.

Adds 4 nullable JSON columns:
- sample.metadata
- characteristic.custom_fields_schema
- mqtt_data_source.metadata_json_paths
- opcua_data_source.metadata_node_ids

Revision ID: a1b2c3d4e5f6
Revises: f5006ab282e0
Create Date: 2026-03-20 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "f5006ab282e0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # sample.metadata
    with op.batch_alter_table("sample", schema=None) as batch_op:
        batch_op.add_column(sa.Column("metadata", sa.JSON(), nullable=True))

    # characteristic.custom_fields_schema
    with op.batch_alter_table("characteristic", schema=None) as batch_op:
        batch_op.add_column(sa.Column("custom_fields_schema", sa.JSON(), nullable=True))

    # mqtt_data_source.metadata_json_paths
    with op.batch_alter_table("mqtt_data_source", schema=None) as batch_op:
        batch_op.add_column(sa.Column("metadata_json_paths", sa.JSON(), nullable=True))

    # opcua_data_source.metadata_node_ids
    with op.batch_alter_table("opcua_data_source", schema=None) as batch_op:
        batch_op.add_column(sa.Column("metadata_node_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("opcua_data_source", schema=None) as batch_op:
        batch_op.drop_column("metadata_node_ids")

    with op.batch_alter_table("mqtt_data_source", schema=None) as batch_op:
        batch_op.drop_column("metadata_json_paths")

    with op.batch_alter_table("characteristic", schema=None) as batch_op:
        batch_op.drop_column("custom_fields_schema")

    with op.batch_alter_table("sample", schema=None) as batch_op:
        batch_op.drop_column("metadata")
