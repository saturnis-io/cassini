"""add resource_display to audit_log

Revision ID: cd2e2bdca7b9
Revises: 4a8c2d1e7f90
Create Date: 2026-03-15 00:01:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cd2e2bdca7b9'
down_revision = '4a8c2d1e7f90'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column('resource_display', sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.drop_column('resource_display')
