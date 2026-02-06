"""Add user and user_plant_role tables.

Revision ID: 009
Revises: 008
Create Date: 2026-02-08

Adds:
- user table with id, username, email, hashed_password, is_active, timestamps
- user_plant_role join table with user_id, plant_id, role
- Indexes on user_plant_role(user_id) and user_plant_role(plant_id)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user table
    op.create_table(
        "user",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
        sa.UniqueConstraint("email"),
    )

    # Create user_plant_role join table
    op.create_table(
        "user_plant_role",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="operator"),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plant_id"], ["plant.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "plant_id", name="uq_user_plant"),
    )

    # Create indexes for efficient lookups
    op.create_index("ix_user_plant_role_user_id", "user_plant_role", ["user_id"])
    op.create_index("ix_user_plant_role_plant_id", "user_plant_role", ["plant_id"])


def downgrade() -> None:
    op.drop_index("ix_user_plant_role_plant_id", table_name="user_plant_role")
    op.drop_index("ix_user_plant_role_user_id", table_name="user_plant_role")
    op.drop_table("user_plant_role")
    op.drop_table("user")
