"""Add OPC-UA server table and update opcua_data_source.

Revision ID: 018
Revises: 017
Create Date: 2026-02-10

Creates the opcua_server table for OPC-UA server configurations.
Updates opcua_data_source with FK to opcua_server, per-node subscription
override columns (sampling_interval, publishing_interval), and server_id index.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Create opcua_server table
    op.create_table(
        "opcua_server",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("endpoint_url", sa.String(500), nullable=False),
        sa.Column(
            "auth_mode",
            sa.String(50),
            nullable=False,
            server_default="anonymous",
        ),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("password", sa.String(500), nullable=True),
        sa.Column(
            "security_policy",
            sa.String(50),
            nullable=False,
            server_default="None",
        ),
        sa.Column(
            "security_mode",
            sa.String(50),
            nullable=False,
            server_default="None",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "session_timeout",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("30000"),
        ),
        sa.Column(
            "publishing_interval",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1000"),
        ),
        sa.Column(
            "sampling_interval",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("250"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Step 2: Alter opcua_data_source — add FK, per-node columns, and index
    with op.batch_alter_table("opcua_data_source") as batch_op:
        batch_op.create_foreign_key(
            "fk_opcua_data_source_server_id",
            "opcua_server",
            ["server_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.add_column(
            sa.Column("sampling_interval", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("publishing_interval", sa.Integer(), nullable=True)
        )
        batch_op.create_index(
            "ix_opcua_data_source_server_id",
            ["server_id"],
        )


def downgrade() -> None:
    # Reverse Step 2: Drop index, columns, FK from opcua_data_source
    with op.batch_alter_table("opcua_data_source") as batch_op:
        batch_op.drop_index("ix_opcua_data_source_server_id")
        batch_op.drop_column("publishing_interval")
        batch_op.drop_column("sampling_interval")
        batch_op.drop_constraint(
            "fk_opcua_data_source_server_id", type_="foreignkey"
        )

    # Reverse Step 1: Drop opcua_server table
    op.drop_table("opcua_server")
