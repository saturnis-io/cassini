"""Add cusum_reset_after_sample_id to characteristic, capability thresholds to plant.

Adds:
- characteristic.cusum_reset_after_sample_id (nullable FK to sample.id)
- plant.capability_green_threshold (Float, default 1.33)
- plant.capability_yellow_threshold (Float, default 1.0)

Revision ID: 039
Revises: 038
Create Date: 2026-02-28
"""
from alembic import op
import sqlalchemy as sa

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None

naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table("characteristic", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(
            sa.Column("cusum_reset_after_sample_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_characteristic_cusum_reset_after_sample_id_sample",
            "sample",
            ["cusum_reset_after_sample_id"],
            ["id"],
            ondelete="SET NULL",
        )

    with op.batch_alter_table("plant", naming_convention=naming_convention) as batch_op:
        batch_op.add_column(
            sa.Column(
                "capability_green_threshold",
                sa.Float(),
                nullable=True,
                server_default=sa.text("1.33"),
            )
        )
        batch_op.add_column(
            sa.Column(
                "capability_yellow_threshold",
                sa.Float(),
                nullable=True,
                server_default=sa.text("1.0"),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("plant", naming_convention=naming_convention) as batch_op:
        batch_op.drop_column("capability_yellow_threshold")
        batch_op.drop_column("capability_green_threshold")

    with op.batch_alter_table("characteristic", naming_convention=naming_convention) as batch_op:
        batch_op.drop_constraint(
            "fk_characteristic_cusum_reset_after_sample_id_sample",
            type_="foreignkey",
        )
        batch_op.drop_column("cusum_reset_after_sample_id")
