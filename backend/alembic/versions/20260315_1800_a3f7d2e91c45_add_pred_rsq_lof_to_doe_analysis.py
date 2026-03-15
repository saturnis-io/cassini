"""add pred_r_squared, lack_of_fit_f, lack_of_fit_p to doe_analysis

Revision ID: a3f7d2e91c45
Revises: 935bdc6c8e58
Create Date: 2026-03-15 18:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7d2e91c45'
down_revision = '935bdc6c8e58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.add_column(sa.Column('pred_r_squared', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('lack_of_fit_f', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('lack_of_fit_p', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.drop_column('lack_of_fit_p')
        batch_op.drop_column('lack_of_fit_f')
        batch_op.drop_column('pred_r_squared')
