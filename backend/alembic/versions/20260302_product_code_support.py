"""Add product_code support to samples and create product_limit table.

Adds:
- sample.product_code (VARCHAR(100), nullable, indexed)
- product_limit table (per-product-code control limit overrides)
- Indexes for efficient querying

Revision ID: 047
Revises: 046
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa

revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    # Add product_code to sample table
    with op.batch_alter_table("sample", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("product_code", sa.String(100), nullable=True))
        batch_op.create_index("ix_sample_product_code", ["product_code"])
        batch_op.create_index("ix_sample_char_product", ["char_id", "product_code"])

    # Create product_limit table
    op.create_table(
        "product_limit",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "characteristic_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("product_code", sa.String(100), nullable=False),
        sa.Column("ucl", sa.Float(), nullable=True),
        sa.Column("lcl", sa.Float(), nullable=True),
        sa.Column("stored_sigma", sa.Float(), nullable=True),
        sa.Column("stored_center_line", sa.Float(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("usl", sa.Float(), nullable=True),
        sa.Column("lsl", sa.Float(), nullable=True),
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
        sa.UniqueConstraint("characteristic_id", "product_code", name="uq_product_limit_char_code"),
    )
    op.create_index("ix_product_limit_char", "product_limit", ["characteristic_id"])


def downgrade() -> None:
    op.drop_index("ix_product_limit_char", table_name="product_limit")
    op.drop_table("product_limit")

    with op.batch_alter_table("sample", naming_convention=naming_convention) as batch_op:
        batch_op.drop_index("ix_sample_char_product")
        batch_op.drop_index("ix_sample_product_code")
        batch_op.drop_column("product_code")
