"""add logo_url to plant

Revision ID: b4c8f2a71d30
Revises: a3f7d2e91c45
Create Date: 2026-03-15 19:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4c8f2a71d30'
down_revision = 'a3f7d2e91c45'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('plant', schema=None) as batch_op:
        batch_op.add_column(sa.Column('logo_url', sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('plant', schema=None) as batch_op:
        batch_op.drop_column('logo_url')
