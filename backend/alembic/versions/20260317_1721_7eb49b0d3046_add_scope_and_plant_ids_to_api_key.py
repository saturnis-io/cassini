"""add scope and plant_ids to api_key

Revision ID: 7eb49b0d3046
Revises: ad900b078566
Create Date: 2026-03-17 17:21:18.626676+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7eb49b0d3046'
down_revision = 'ad900b078566'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('api_keys', schema=None) as batch_op:
        batch_op.add_column(sa.Column('scope', sa.String(length=20), server_default='read-write', nullable=False))
        batch_op.add_column(sa.Column('plant_ids', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('api_keys', schema=None) as batch_op:
        batch_op.drop_column('plant_ids')
        batch_op.drop_column('scope')
