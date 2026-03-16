"""add n_runs and model_order to doe_study

Revision ID: d7c41149d5b1
Revises: 67ab89b939b3
Create Date: 2026-03-16 01:53:56.150142+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd7c41149d5b1'
down_revision = '67ab89b939b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('doe_study', schema=None) as batch_op:
        batch_op.add_column(sa.Column('n_runs', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('model_order', sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('doe_study', schema=None) as batch_op:
        batch_op.drop_column('model_order')
        batch_op.drop_column('n_runs')
