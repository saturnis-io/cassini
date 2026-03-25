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
    dialect_name = bind.dialect.name

    if dialect_name == "mssql":
        # MSSQL rejects multiple ON DELETE CASCADE / SET NULL paths that could
        # reach the same row through different FK chains.  Temporarily rewrite
        # all CASCADE and SET NULL → NO ACTION for DDL, then restore.
        # ORM-level cascade="all, delete-orphan" still handles actual deletion
        # logic on all dialects.
        _patched = []
        for table in Base.metadata.sorted_tables:
            for fk in table.foreign_key_constraints:
                original = fk.ondelete
                if original and original.upper() in ("CASCADE", "SET NULL", "RESTRICT"):
                    _patched.append((fk, original))
                    fk.ondelete = "NO ACTION"

        Base.metadata.create_all(bind=bind)

        # Restore original ondelete values so model metadata stays correct
        for fk, original in _patched:
            fk.ondelete = original
    else:
        Base.metadata.create_all(bind=bind)

    # Seed default plant so admin bootstrap has a plant to attach to.
    # Use the ORM to avoid dialect differences (PostgreSQL asyncpg rejects
    # integer literals for boolean columns; MySQL/MSSQL don't accept TRUE).
    from cassini.db.models.plant import Plant
    from sqlalchemy.orm import Session

    with Session(bind=bind) as session:
        session.add(Plant(name="Default Plant", code="DEFAULT", is_active=True))
        session.commit()


def downgrade() -> None:
    from cassini.db.models import Base  # noqa: F401

    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
