"""add limits_calc_params to characteristic

Revision ID: 1dcf6aaa092f
Revises: 075fb3c0dee1
Create Date: 2026-02-27 00:52:19.046317+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1dcf6aaa092f'
down_revision = '075fb3c0dee1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('characteristic', schema=None) as batch_op:
        batch_op.add_column(sa.Column('limits_calc_params', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('characteristic', schema=None) as batch_op:
        batch_op.drop_column('limits_calc_params')
