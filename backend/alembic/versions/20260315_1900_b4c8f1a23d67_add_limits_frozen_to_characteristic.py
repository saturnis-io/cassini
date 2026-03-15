"""add limits_frozen, limits_frozen_at, limits_frozen_by to characteristic

Revision ID: b4c8f1a23d67
Revises: a3f7d2e91c45
Create Date: 2026-03-15 19:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b4c8f1a23d67'
down_revision = 'a3f7d2e91c45'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('characteristic', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('limits_frozen', sa.Boolean(), nullable=False, server_default=sa.text('0'))
        )
        batch_op.add_column(
            sa.Column('limits_frozen_at', sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column('limits_frozen_by', sa.String(255), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table('characteristic', schema=None) as batch_op:
        batch_op.drop_column('limits_frozen_by')
        batch_op.drop_column('limits_frozen_at')
        batch_op.drop_column('limits_frozen')
