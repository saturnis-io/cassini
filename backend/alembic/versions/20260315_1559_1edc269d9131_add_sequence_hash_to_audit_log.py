"""add sequence_hash to audit_log

Revision ID: 1edc269d9131
Revises: cd2e2bdca7b9
Create Date: 2026-03-15 15:59:38.695168+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1edc269d9131'
down_revision = 'cd2e2bdca7b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.add_column(sa.Column('sequence_hash', sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('audit_log', schema=None) as batch_op:
        batch_op.drop_column('sequence_hash')
