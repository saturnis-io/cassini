"""add doe blocking and multi-response desirability columns

Revision ID: c5d6e7f8a9b0
Revises: a1b2c3d4e5f6
Create Date: 2026-03-16 03:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5d6e7f8a9b0'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # DOEStudy: add n_blocks and response_columns
    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.add_column(
            sa.Column("n_blocks", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("response_columns", sa.Text(), nullable=True)
        )

    # DOERun: add block and response_values
    with op.batch_alter_table("doe_run") as batch_op:
        batch_op.add_column(
            sa.Column("block", sa.Integer(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("response_values", sa.Text(), nullable=True)
        )

    # DOEAnalysis: add desirability_json
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.add_column(
            sa.Column("desirability_json", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.drop_column("desirability_json")

    with op.batch_alter_table("doe_run") as batch_op:
        batch_op.drop_column("response_values")
        batch_op.drop_column("block")

    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.drop_column("response_columns")
        batch_op.drop_column("n_blocks")
