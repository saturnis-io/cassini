"""Add start_time and end_time to annotation table.

Revision ID: 014
Revises: 013
Create Date: 2026-02-13

Adds:
- start_time DateTime nullable for time-based period annotations
- end_time DateTime nullable for time-based period annotations
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "annotation",
        sa.Column("start_time", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "annotation",
        sa.Column("end_time", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("annotation", "end_time")
    op.drop_column("annotation", "start_time")
