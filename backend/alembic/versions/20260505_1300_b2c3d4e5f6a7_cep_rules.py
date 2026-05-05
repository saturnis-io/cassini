"""cep_rule table — streaming complex event processing patterns

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-05 13:00:00.000000+00:00

Stores YAML-based multi-stream pattern rules that combine per-characteristic
Nelson rules across sliding time windows. Plant-scoped (cascade delete on
plant removal).

Idempotent: the initial migration ``f5006ab282e0`` uses
``Base.metadata.create_all()`` which already creates ``cep_rule`` on fresh
databases. Existing pre-Sprint-15 databases upgraded incrementally still need
the table created. Guard with ``inspect()`` so both paths succeed.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


# Naming convention dict required for SQLite batch-FK recreation per project rules.
_NAMING = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "cep_rule" not in inspector.get_table_names():
        op.create_table(
            "cep_rule",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column(
                "plant_id",
                sa.Integer(),
                sa.ForeignKey("plant.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("description", sa.String(length=500), nullable=True),
            sa.Column("yaml_text", sa.Text(), nullable=False),
            sa.Column("parsed_json", sa.Text(), nullable=False),
            sa.Column(
                "enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint("plant_id", "name", name="uq_cep_rule_plant_name"),
        )

    # Refresh inspector after potential create_table; check index existence.
    inspector = inspect(bind)
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("cep_rule")}
    if "ix_cep_rule_plant_id" not in existing_indexes:
        op.create_index("ix_cep_rule_plant_id", "cep_rule", ["plant_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if "cep_rule" not in inspector.get_table_names():
        return

    existing_indexes = {ix["name"] for ix in inspector.get_indexes("cep_rule")}
    if "ix_cep_rule_plant_id" in existing_indexes:
        op.drop_index("ix_cep_rule_plant_id", table_name="cep_rule")
    op.drop_table("cep_rule")
