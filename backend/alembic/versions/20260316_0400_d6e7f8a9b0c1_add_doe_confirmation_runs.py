"""add doe confirmation runs columns

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-03-16 04:00:00.000000+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd6e7f8a9b0c1'
down_revision = 'c5d6e7f8a9b0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # DOEStudy: add is_confirmation and parent_study_id
    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_confirmation",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            )
        )
        batch_op.add_column(
            sa.Column("parent_study_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_doe_study_parent_study_id",
            "doe_study",
            ["parent_study_id"],
            ["id"],
            ondelete="SET NULL",
        )

    # DOEAnalysis: add regression_xtx_inv for storing (X'X)^-1
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.add_column(
            sa.Column("regression_xtx_inv", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("doe_analysis") as batch_op:
        batch_op.drop_column("regression_xtx_inv")

    with op.batch_alter_table("doe_study") as batch_op:
        batch_op.drop_constraint(
            "fk_doe_study_parent_study_id", type_="foreignkey"
        )
        batch_op.drop_column("parent_study_id")
        batch_op.drop_column("is_confirmation")
