"""Add capability_history table for process capability tracking.

Revision ID: 025
Revises: 024
Create Date: 2026-02-12

Adds capability_history table for storing Cp/Cpk/Pp/Ppk snapshots
with normality testing results.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "capability_history",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "characteristic_id",
            sa.Integer,
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("cp", sa.Float, nullable=True),
        sa.Column("cpk", sa.Float, nullable=True),
        sa.Column("pp", sa.Float, nullable=True),
        sa.Column("ppk", sa.Float, nullable=True),
        sa.Column("cpm", sa.Float, nullable=True),
        sa.Column("sample_count", sa.Integer, nullable=False),
        sa.Column("normality_p_value", sa.Float, nullable=True),
        sa.Column("normality_test", sa.String(50), nullable=True),
        sa.Column("calculated_at", sa.DateTime, nullable=False),
        sa.Column("calculated_by", sa.String(255), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("capability_history")
