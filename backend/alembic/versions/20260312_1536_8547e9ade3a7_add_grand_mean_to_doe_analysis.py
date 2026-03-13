"""add grand_mean to doe_analysis

Revision ID: 8547e9ade3a7
Revises: b06425200559
Create Date: 2026-03-12 15:36:21.338736+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '8547e9ade3a7'
down_revision = 'b06425200559'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.add_column(sa.Column('grand_mean', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.drop_column('grand_mean')
