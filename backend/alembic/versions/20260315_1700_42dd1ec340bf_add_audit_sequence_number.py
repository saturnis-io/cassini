"""add audit sequence number

Revision ID: 42dd1ec340bf
Revises: 1edc269d9131
Create Date: 2026-03-15 17:00:00.000000+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "42dd1ec340bf"
down_revision = "1edc269d9131"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("sequence_number", sa.Integer(), nullable=True)
        )
        batch_op.create_unique_constraint(
            "uq_audit_log_sequence_number", ["sequence_number"]
        )


def downgrade() -> None:
    with op.batch_alter_table("audit_log", schema=None) as batch_op:
        batch_op.drop_constraint("uq_audit_log_sequence_number", type_="unique")
        batch_op.drop_column("sequence_number")
