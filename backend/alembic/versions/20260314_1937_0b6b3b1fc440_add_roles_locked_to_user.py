"""add roles_locked to user

Revision ID: 0b6b3b1fc440
Revises: 8547e9ade3a7
Create Date: 2026-03-14 19:37:21.278918+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0b6b3b1fc440'
down_revision = '8547e9ade3a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('roles_locked', sa.Boolean(), server_default=sa.text('0'), nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('roles_locked')
