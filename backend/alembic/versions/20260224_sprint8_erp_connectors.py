"""Sprint 8: ERP/LIMS connector tables.

Adds four tables for enterprise integration:
- erp_connector: plant-scoped connector configs (SAP, Oracle, LIMS, webhook)
- erp_field_mapping: bidirectional field mapping rules
- erp_sync_schedule: cron-based sync scheduling
- erp_sync_log: audit trail for sync operations

Revision ID: 038
Revises: 037
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. erp_connector — plant-scoped ERP/LIMS connection config
    # ------------------------------------------------------------------
    op.create_table(
        "erp_connector",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("connector_type", sa.String(50), nullable=False),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("auth_type", sa.String(50), nullable=False),
        sa.Column("auth_config", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("headers", sa.Text(), nullable=False, server_default="{}"),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="disconnected",
        ),
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plant.id"],
            name="fk_erp_connector_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("plant_id", "name", name="uq_erp_connector_plant_name"),
    )
    op.create_index("ix_erp_connector_plant_id", "erp_connector", ["plant_id"])

    # ------------------------------------------------------------------
    # 2. erp_field_mapping — bidirectional field mapping rules
    # ------------------------------------------------------------------
    op.create_table(
        "erp_field_mapping",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("connector_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("erp_entity", sa.String(100), nullable=False),
        sa.Column("erp_field_path", sa.String(500), nullable=False),
        sa.Column("openspc_entity", sa.String(50), nullable=False),
        sa.Column("openspc_field", sa.String(100), nullable=False),
        sa.Column("transform", sa.Text(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.ForeignKeyConstraint(
            ["connector_id"],
            ["erp_connector.id"],
            name="fk_erp_field_mapping_connector_id_erp_connector",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_erp_field_mapping_connector_id", "erp_field_mapping", ["connector_id"]
    )

    # ------------------------------------------------------------------
    # 3. erp_sync_schedule — cron-based scheduling per direction
    # ------------------------------------------------------------------
    op.create_table(
        "erp_sync_schedule",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("connector_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["connector_id"],
            ["erp_connector.id"],
            name="fk_erp_sync_schedule_connector_id_erp_connector",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "connector_id", "direction",
            name="uq_erp_sync_schedule_connector_direction",
        ),
    )

    # ------------------------------------------------------------------
    # 4. erp_sync_log — audit trail for sync operations
    # ------------------------------------------------------------------
    op.create_table(
        "erp_sync_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("connector_id", sa.Integer(), nullable=False),
        sa.Column("direction", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column(
            "records_processed",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "records_failed",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["connector_id"],
            ["erp_connector.id"],
            name="fk_erp_sync_log_connector_id_erp_connector",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_erp_sync_log_connector_id", "erp_sync_log", ["connector_id"]
    )
    op.create_index(
        "ix_erp_sync_log_started_at", "erp_sync_log", ["started_at"]
    )


def downgrade() -> None:
    # Drop in reverse order of creation
    op.drop_index("ix_erp_sync_log_started_at", table_name="erp_sync_log")
    op.drop_index("ix_erp_sync_log_connector_id", table_name="erp_sync_log")
    op.drop_table("erp_sync_log")

    op.drop_table("erp_sync_schedule")

    op.drop_index("ix_erp_field_mapping_connector_id", table_name="erp_field_mapping")
    op.drop_table("erp_field_mapping")

    op.drop_index("ix_erp_connector_plant_id", table_name="erp_connector")
    op.drop_table("erp_connector")
