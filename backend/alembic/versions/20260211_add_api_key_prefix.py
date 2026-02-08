"""Add key_prefix column to api_keys table.

Revision ID: 012
Revises: 011
Create Date: 2026-02-11

Adds:
- key_prefix VARCHAR(16) nullable to api_keys table
- Stores the first 8 chars of the plaintext key (unhashed) for O(1) lookup
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "012b"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "api_keys",
        sa.Column("key_prefix", sa.String(16), nullable=True),
    )
    op.create_index("ix_api_keys_key_prefix", "api_keys", ["key_prefix"])


def downgrade() -> None:
    op.drop_index("ix_api_keys_key_prefix", table_name="api_keys")
    op.drop_column("api_keys", "key_prefix")
