"""add_covariance_method_to_multivariate_group

Revision ID: 3460984785b1
Revises: 783a169959a5
Create Date: 2026-03-14 23:53:03.099121+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3460984785b1'
down_revision = '783a169959a5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('multivariate_group', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                'covariance_method',
                sa.String(20),
                server_default='classical',
                nullable=False,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table('multivariate_group', schema=None) as batch_op:
        batch_op.drop_column('covariance_method')
