"""add sso_only column to oidc_config

Revision ID: f8e2a1b3c4d5
Revises: a3f7d2e91c45
Create Date: 2026-03-15 19:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f8e2a1b3c4d5'
down_revision = 'a3f7d2e91c45'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('oidc_config', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sso_only', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('oidc_config', schema=None) as batch_op:
        batch_op.drop_column('sso_only')
