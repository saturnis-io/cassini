"""add spc_status column to sample

Adds spc_status column for async batch SPC processing. Values:
  - 'complete'    (default) — SPC evaluation finished
  - 'pending_spc' — queued for deferred batch processing
  - 'spc_failed'  — SPC evaluation failed

Includes a partial index on PostgreSQL (WHERE spc_status != 'complete')
and a regular index on SQLite, so lookups for pending/failed samples
are fast without penalising the 99.9% happy path.

Revision ID: b06425200559
Revises: 20260309_ondelete
Create Date: 2026-03-11 00:54:44.353955+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b06425200559"
down_revision = "20260309_ondelete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sample",
        sa.Column("spc_status", sa.String(20), server_default="complete", nullable=False),
    )

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX ix_sample_spc_status_pending ON sample (spc_status) "
            "WHERE spc_status != 'complete'"
        )
    else:
        op.create_index("ix_sample_spc_status_pending", "sample", ["spc_status"])


def downgrade() -> None:
    op.drop_index("ix_sample_spc_status_pending", table_name="sample")
    op.drop_column("sample", "spc_status")
