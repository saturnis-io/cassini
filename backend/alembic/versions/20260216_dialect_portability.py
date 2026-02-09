"""Dialect portability fixes for multi-database support.

Revision ID: 016
Revises: 015
Create Date: 2026-02-16

Adds explicit String lengths and fixes Boolean server_defaults for
cross-dialect compatibility (PostgreSQL, MySQL, MSSQL).

On existing SQLite databases, String length changes are a no-op
(SQLite ignores VARCHAR length constraints). Boolean server_default
changes ensure portable defaults across all dialects.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- hierarchy: add String lengths ---
    with op.batch_alter_table("hierarchy") as batch_op:
        batch_op.alter_column("name", type_=sa.String(255))
        batch_op.alter_column("type", type_=sa.String(100))

    # --- characteristic: add String lengths ---
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.alter_column("name", type_=sa.String(255))
        batch_op.alter_column("description", type_=sa.String(500))
        batch_op.alter_column("provider_type", type_=sa.String(50))
        batch_op.alter_column("mqtt_topic", type_=sa.String(500))
        batch_op.alter_column("trigger_tag", type_=sa.String(500))
        batch_op.alter_column("subgroup_mode", type_=sa.String(50))

    # --- sample: add String lengths ---
    with op.batch_alter_table("sample") as batch_op:
        batch_op.alter_column("batch_number", type_=sa.String(100))
        batch_op.alter_column("operator_id", type_=sa.String(100))

    # --- violation: add String lengths ---
    with op.batch_alter_table("violation") as batch_op:
        batch_op.alter_column("rule_name", type_=sa.String(100))
        batch_op.alter_column("severity", type_=sa.String(20))
        batch_op.alter_column("ack_user", type_=sa.String(100))
        batch_op.alter_column("ack_reason", type_=sa.String(500))

    # --- user: fix Boolean server_default ---
    with op.batch_alter_table("user") as batch_op:
        batch_op.alter_column(
            "must_change_password",
            server_default=sa.False_(),
        )

    # --- mqtt_broker: fix Boolean server_defaults ---
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.alter_column("use_tls", server_default=sa.False_())
        batch_op.alter_column("is_active", server_default=sa.True_())

    # --- api_keys: fix Boolean server_default ---
    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.alter_column("is_active", server_default=sa.True_())

    # --- plant: fix Boolean server_default ---
    with op.batch_alter_table("plant") as batch_op:
        batch_op.alter_column("is_active", server_default=sa.True_())


def downgrade() -> None:
    # Reverse Boolean server_defaults to SQLite-style text("0")/text("1")
    with op.batch_alter_table("plant") as batch_op:
        batch_op.alter_column("is_active", server_default=sa.text("1"))

    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.alter_column("is_active", server_default=sa.text("1"))

    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.alter_column("is_active", server_default=sa.text("1"))
        batch_op.alter_column("use_tls", server_default=sa.text("0"))

    with op.batch_alter_table("user") as batch_op:
        batch_op.alter_column("must_change_password", server_default=sa.text("0"))

    # String length changes are not reversed — SQLite ignores lengths,
    # and reverting on other dialects could truncate data.
