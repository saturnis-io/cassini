"""add taguchi sn_type and anom columns

Revision ID: a1b2c3d4e5f6
Revises: 67ab89b939b3
Create Date: 2026-03-16 02:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'd7c41149d5b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add sn_type to doe_study for Taguchi S/N ratio selection
    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.add_column(
            sa.Column("sn_type", sa.String(30), nullable=True)
        )

    # Add taguchi_anom_json to doe_analysis for ANOM results
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.add_column(
            sa.Column("taguchi_anom_json", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.drop_column("taguchi_anom_json")

    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.drop_column("sn_type")
