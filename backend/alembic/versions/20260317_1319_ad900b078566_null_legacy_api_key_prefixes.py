"""null legacy api key prefixes

All existing API key prefixes are 'cassini_' (the first 8 chars of every key),
which defeats the purpose of prefix-based candidate narrowing. Nulling them
triggers the backfill path in verify_api_key() which will re-compute the prefix
using the fixed extract_prefix() (chars 8-15, after 'cassini_').

Revision ID: ad900b078566
Revises: d6e7f8a9b0c1
Create Date: 2026-03-17 13:19:00.000000+00:00

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'ad900b078566'
down_revision = 'd6e7f8a9b0c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE api_keys SET key_prefix = NULL WHERE key_prefix = 'cassini_'")


def downgrade() -> None:
    pass  # No-op — old prefix was useless anyway
