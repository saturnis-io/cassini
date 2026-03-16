"""add reference_decision to msa_part

Revision ID: d1e2f3a4b5c6
Revises: c9d4e5f6a7b8
Create Date: 2026-03-15 21:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd1e2f3a4b5c6'
down_revision = 'c9d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('msa_part', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('reference_decision', sa.String(50), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table('msa_part', schema=None) as batch_op:
        batch_op.drop_column('reference_decision')
