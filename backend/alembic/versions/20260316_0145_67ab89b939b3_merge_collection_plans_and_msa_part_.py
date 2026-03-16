"""merge collection_plans and msa_part branches

Revision ID: 67ab89b939b3
Revises: d1e2f3a4b5c6, e0f1a2b3c4d5
Create Date: 2026-03-16 01:45:56.363604+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '67ab89b939b3'
down_revision = ('d1e2f3a4b5c6', 'e0f1a2b3c4d5')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
