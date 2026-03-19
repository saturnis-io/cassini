"""initial schema

Revision ID: f5006ab282e0
Revises:
Create Date: 2026-03-19 02:01:49.035150+00:00

Uses metadata.create_all() instead of individual op.create_table() calls
to correctly handle table dependency ordering (characteristic <-> sample
circular FK).
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'f5006ab282e0'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Import all models so metadata is fully populated
    from cassini.db.models import Base  # noqa: F401

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)

    # Seed default plant so admin bootstrap has a plant to attach to
    from sqlalchemy import text

    bind.execute(text(
        "INSERT INTO plant (name, code, is_active) "
        "VALUES ('Default Plant', 'DEFAULT', TRUE)"
    ))


def downgrade() -> None:
    from cassini.db.models import Base  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
