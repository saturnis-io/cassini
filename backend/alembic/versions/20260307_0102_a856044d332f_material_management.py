"""material management

Create material_class, material, material_limit_override tables.
Add sample.material_id, drop sample.product_code.
Drop product_limit table.

Revision ID: a856044d332f
Revises: 051
Create Date: 2026-03-07 01:02:59.428046+00:00
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a856044d332f"
down_revision = "051"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    # --- Create material_class table ---
    op.create_table(
        "material_class",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("material_class.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("path", sa.String(1000), nullable=False, server_default="/"),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.UniqueConstraint("plant_id", "code", name="uq_material_class_plant_code"),
    )
    op.create_index(
        "ix_material_class_plant_parent",
        "material_class",
        ["plant_id", "parent_id"],
    )

    # --- Create material table ---
    op.create_table(
        "material",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("material_class.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("properties", sa.JSON(), nullable=True),
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
        sa.UniqueConstraint("plant_id", "code", name="uq_material_plant_code"),
    )
    op.create_index(
        "ix_material_plant_class",
        "material",
        ["plant_id", "class_id"],
    )

    # --- Create material_limit_override table ---
    op.create_table(
        "material_limit_override",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "characteristic_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "material_id",
            sa.Integer(),
            sa.ForeignKey("material.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "class_id",
            sa.Integer(),
            sa.ForeignKey("material_class.id", ondelete="CASCADE"),
            nullable=True,
        ),
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
        sa.CheckConstraint(
            "(material_id IS NOT NULL AND class_id IS NULL) OR "
            "(material_id IS NULL AND class_id IS NOT NULL)",
            name="ck_material_limit_override_exactly_one",
        ),
        sa.UniqueConstraint(
            "characteristic_id", "material_id", name="uq_mlo_char_material"
        ),
        sa.UniqueConstraint(
            "characteristic_id", "class_id", name="uq_mlo_char_class"
        ),
    )
    op.create_index(
        "ix_material_limit_override_char",
        "material_limit_override",
        ["characteristic_id"],
    )

    # --- Alter sample table: add material_id, drop product_code ---
    with op.batch_alter_table("sample", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(sa.Column("material_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_sample_material_id_material",
            "material",
            ["material_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_index("ix_sample_char_product")
        batch_op.drop_index("ix_sample_product_code")
        batch_op.drop_column("product_code")

    # --- Drop product_limit table ---
    op.drop_index("ix_product_limit_char", table_name="product_limit")
    op.drop_table("product_limit")


def downgrade() -> None:
    # --- Re-create product_limit table ---
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
        sa.UniqueConstraint(
            "characteristic_id", "product_code", name="uq_product_limit_char_code"
        ),
    )
    op.create_index("ix_product_limit_char", "product_limit", ["characteristic_id"])

    # --- Restore sample table: re-add product_code, drop material_id ---
    with op.batch_alter_table("sample", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(
            sa.Column("product_code", sa.String(100), nullable=True)
        )
        batch_op.create_index("ix_sample_product_code", ["product_code"])
        batch_op.create_index("ix_sample_char_product", ["char_id", "product_code"])
        batch_op.drop_constraint(
            "fk_sample_material_id_material", type_="foreignkey"
        )
        batch_op.drop_column("material_id")

    # --- Drop material_limit_override table ---
    op.drop_index(
        "ix_material_limit_override_char", table_name="material_limit_override"
    )
    op.drop_table("material_limit_override")

    # --- Drop material table ---
    op.drop_index("ix_material_plant_class", table_name="material")
    op.drop_table("material")

    # --- Drop material_class table ---
    op.drop_index("ix_material_class_plant_parent", table_name="material_class")
    op.drop_table("material_class")
