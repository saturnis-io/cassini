"""Add TLS certificate columns to mqtt_broker and opcua_server.

Adds:
- mqtt_broker.ca_cert_pem (Text, nullable)
- mqtt_broker.client_cert_pem (Text, nullable)
- mqtt_broker.client_key_pem (Text, nullable)
- mqtt_broker.tls_insecure (Boolean, default False)
- opcua_server.ca_cert_pem (Text, nullable)
- opcua_server.client_cert_pem (Text, nullable)
- opcua_server.client_key_pem (Text, nullable)
- opcua_server.tls_insecure (Boolean, default False)

Revision ID: 046
Revises: 045
Create Date: 2026-03-01
"""

from alembic import op
import sqlalchemy as sa

revision = "046"
down_revision = "045"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table("mqtt_broker", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("ca_cert_pem", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("client_cert_pem", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("client_key_pem", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("tls_insecure", sa.Boolean(), nullable=False, server_default="0")
        )

    with op.batch_alter_table("opcua_server", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("ca_cert_pem", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("client_cert_pem", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("client_key_pem", sa.Text(), nullable=True))
        batch_op.add_column(
            sa.Column("tls_insecure", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("opcua_server", naming_convention=naming_convention) as batch_op:
        batch_op.drop_column("tls_insecure")
        batch_op.drop_column("client_key_pem")
        batch_op.drop_column("client_cert_pem")
        batch_op.drop_column("ca_cert_pem")

    with op.batch_alter_table("mqtt_broker", naming_convention=naming_convention) as batch_op:
        batch_op.drop_column("tls_insecure")
        batch_op.drop_column("client_key_pem")
        batch_op.drop_column("client_cert_pem")
        batch_op.drop_column("ca_cert_pem")
