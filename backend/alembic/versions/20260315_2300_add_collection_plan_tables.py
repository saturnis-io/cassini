"""Add collection_plan, collection_plan_item, collection_plan_execution tables

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-03-15 23:00:00.000000+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e0f1a2b3c4d5"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "collection_plan",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"], ondelete="SET NULL"
        ),
    )
    op.create_index(
        "ix_collection_plan_plant_active",
        "collection_plan",
        ["plant_id", "is_active"],
    )

    op.create_table(
        "collection_plan_item",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
        sa.Column(
            "required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["collection_plan.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            ondelete="RESTRICT",
        ),
    )
    op.create_index(
        "ix_collection_plan_item_plan_seq",
        "collection_plan_item",
        ["plan_id", "sequence_order"],
    )

    op.create_table(
        "collection_plan_execution",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("executed_by", sa.Integer(), nullable=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="in_progress",
        ),
        sa.Column(
            "items_completed",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "items_skipped",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["collection_plan.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["executed_by"], ["user.id"], ondelete="SET NULL"
        ),
    )
    op.create_index(
        "ix_collection_plan_execution_plan_status",
        "collection_plan_execution",
        ["plan_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_collection_plan_execution_plan_status")
    op.drop_table("collection_plan_execution")
    op.drop_index("ix_collection_plan_item_plan_seq")
    op.drop_table("collection_plan_item")
    op.drop_index("ix_collection_plan_plant_active")
    op.drop_table("collection_plan")
