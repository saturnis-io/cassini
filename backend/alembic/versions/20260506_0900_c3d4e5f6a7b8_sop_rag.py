"""SOP-grounded RAG tables (sop_doc, sop_chunk, sop_rag_budget)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-05 13:00:00.000000+00:00

Adds three tables for the SOP-grounded RAG with citation lock feature
(Enterprise tier):

* ``sop_doc`` — uploaded SOP / work-instruction / control-plan documents.
  Plant-scoped. The raw bytes live on disk under
  ``<data_dir>/sop_docs/<plant_id>/<doc_id>.<ext>``; only metadata sits
  in the DB.
* ``sop_chunk`` — text chunks (default 512 tokens, 64 overlap) extracted
  by the indexer. Carries the embedding bytes (numpy float32 vectors).
* ``sop_rag_budget`` — per-plant monthly cost ledger so the API can
  enforce a configurable monthly cap.

All three are CASCADE-deleted with the parent plant.
"""
from alembic import op
from sqlalchemy import inspect
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


_NAMING = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "ix": "ix_%(table_name)s_%(column_0_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    # Idempotent guard: initial_schema runs Base.metadata.create_all() which
    # picks up SopDoc/SopChunk/SopRagBudget on fresh installs and creates
    # the tables ahead of this migration. Skip in that case so a fresh
    # `alembic upgrade head` succeeds.
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "sop_doc" in existing_tables:
        return

    op.create_table(
        "sop_doc",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=80), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column(
            "char_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "chunk_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("embedding_model", sa.String(length=120), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("status_message", sa.Text(), nullable=True),
        sa.Column(
            "pii_warning",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("pii_match_summary", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_sop_doc_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["user.id"],
            name="fk_sop_doc_uploaded_by_user",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sop_doc"),
    )
    op.create_index("ix_sop_doc_plant_id", "sop_doc", ["plant_id"])

    op.create_table(
        "sop_chunk",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doc_id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("token_count", sa.Integer(), nullable=False),
        sa.Column("paragraph_label", sa.String(length=120), nullable=True),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
        sa.Column("embedding_dim", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["doc_id"], ["sop_doc.id"],
            name="fk_sop_chunk_doc_id_sop_doc",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_sop_chunk_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sop_chunk"),
    )
    op.create_index(
        "ix_sop_chunk_doc_id_chunk_index",
        "sop_chunk",
        ["doc_id", "chunk_index"],
    )
    op.create_index("ix_sop_chunk_plant_id", "sop_chunk", ["plant_id"])

    op.create_table(
        "sop_rag_budget",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column(
            "monthly_cap_usd",
            sa.Float(),
            nullable=False,
            server_default=sa.text("50.0"),
        ),
        sa.Column(
            "cost_usd",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0"),
        ),
        sa.Column(
            "query_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_sop_rag_budget_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sop_rag_budget"),
        sa.UniqueConstraint(
            "plant_id", "year_month", name="uq_sop_rag_budget_plant_month"
        ),
    )


def downgrade() -> None:
    op.drop_table("sop_rag_budget")
    op.drop_index("ix_sop_chunk_plant_id", table_name="sop_chunk")
    op.drop_index("ix_sop_chunk_doc_id_chunk_index", table_name="sop_chunk")
    op.drop_table("sop_chunk")
    op.drop_index("ix_sop_doc_plant_id", table_name="sop_doc")
    op.drop_table("sop_doc")
