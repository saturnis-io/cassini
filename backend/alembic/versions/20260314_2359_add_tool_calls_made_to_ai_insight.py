"""add_tool_calls_made_to_ai_insight

Revision ID: 4a8c2d1e7f90
Revises: 3460984785b1
Create Date: 2026-03-14 23:59:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4a8c2d1e7f90'
down_revision = '3460984785b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('ai_insight', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'tool_calls_made',
                sa.Integer(),
                server_default=sa.text('0'),
                nullable=False,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('ai_insight', schema=None) as batch_op:
        batch_op.drop_column('tool_calls_made')
