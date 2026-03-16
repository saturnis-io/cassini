"""Add delta FAI fields: parent_report_id on fai_report, carried_forward on fai_item

Revision ID: d9e0f1a2b3c4
Revises: c7d8e9f0a1b2
Create Date: 2026-03-15 22:00:00.000000+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "d9e0f1a2b3c4"
down_revision = "c7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("fai_report", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("parent_report_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_fai_report_parent",
            "fai_report",
            ["parent_report_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("fai_item", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("carried_forward", sa.Boolean(), nullable=False, server_default=sa.text("0"))
        )


def downgrade() -> None:
    with op.batch_alter_table("fai_item", schema=None) as batch_op:
        batch_op.drop_column("carried_forward")

    with op.batch_alter_table("fai_report", schema=None) as batch_op:
        batch_op.drop_constraint("fk_fai_report_parent", type_="foreignkey")
        batch_op.drop_column("parent_report_id")
