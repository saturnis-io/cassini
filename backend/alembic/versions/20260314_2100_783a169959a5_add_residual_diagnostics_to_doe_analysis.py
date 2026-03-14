"""add residual diagnostics to doe_analysis

Revision ID: 783a169959a5
Revises: 0b6b3b1fc440
Create Date: 2026-03-14 21:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '783a169959a5'
down_revision = '0b6b3b1fc440'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.add_column(sa.Column('residuals_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('fitted_values_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('normality_test_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('outlier_indices_json', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('residual_stats_json', sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('doe_analysis', schema=None) as batch_op:
        batch_op.drop_column('residual_stats_json')
        batch_op.drop_column('outlier_indices_json')
        batch_op.drop_column('normality_test_json')
        batch_op.drop_column('fitted_values_json')
        batch_op.drop_column('residuals_json')
