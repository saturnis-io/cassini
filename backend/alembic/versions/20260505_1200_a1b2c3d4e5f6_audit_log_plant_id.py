"""audit_log plant_id for tenant-scoped queries

Revision ID: a1b2c3d4e5f6
Revises: f5006ab282e0
Create Date: 2026-05-05 12:00:00.000000+00:00

Adds ``audit_log.plant_id`` so audit list/export queries can scope to the
caller's accessible plants. Existing rows are left NULL — they remain visible
only to admins (any plant) until the application backfills them via the
resource → plant lookup. New rows populate plant_id at write time when the
endpoint context provides one.
"""
from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f6"
down_revision = "f5006ab282e0"
branch_labels = None
depends_on = None


# Naming convention dict required for SQLite batch-FK recreation per project rules.
_NAMING = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table(
            "audit_log",
            naming_convention=_NAMING,
        ) as batch_op:
            batch_op.add_column(
                sa.Column("plant_id", sa.Integer(), nullable=True)
            )
            batch_op.create_foreign_key(
                "fk_audit_log_plant_id_plant",
                "plant",
                ["plant_id"],
                ["id"],
                ondelete="SET NULL",
            )
            batch_op.create_index(
                "ix_audit_log_plant_id", ["plant_id"], unique=False
            )
    else:
        op.add_column(
            "audit_log",
            sa.Column("plant_id", sa.Integer(), nullable=True),
        )
        op.create_foreign_key(
            "fk_audit_log_plant_id_plant",
            "audit_log",
            "plant",
            ["plant_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index("ix_audit_log_plant_id", "audit_log", ["plant_id"])


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table(
            "audit_log",
            naming_convention=_NAMING,
        ) as batch_op:
            batch_op.drop_index("ix_audit_log_plant_id")
            batch_op.drop_constraint(
                "fk_audit_log_plant_id_plant", type_="foreignkey"
            )
            batch_op.drop_column("plant_id")
    else:
        op.drop_index("ix_audit_log_plant_id", table_name="audit_log")
        op.drop_constraint(
            "fk_audit_log_plant_id_plant", "audit_log", type_="foreignkey"
        )
        op.drop_column("audit_log", "plant_id")
