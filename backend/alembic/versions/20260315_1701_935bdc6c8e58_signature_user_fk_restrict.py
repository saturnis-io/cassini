"""change electronic_signature user_id FK from SET NULL to RESTRICT

Revision ID: 935bdc6c8e58
Revises: 42dd1ec340bf
Create Date: 2026-03-15 17:01:00.000000+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "935bdc6c8e58"
down_revision = "42dd1ec340bf"
branch_labels = None
depends_on = None

# Naming convention for SQLite batch mode FK recreation
naming_convention = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    with op.batch_alter_table(
        "electronic_signature",
        schema=None,
        naming_convention=naming_convention,
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_electronic_signature_user_id_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_electronic_signature_user_id_user",
            "user",
            ["user_id"],
            ["id"],
            ondelete="RESTRICT",
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "electronic_signature",
        schema=None,
        naming_convention=naming_convention,
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_electronic_signature_user_id_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_electronic_signature_user_id_user",
            "user",
            ["user_id"],
            ["id"],
            ondelete="SET NULL",
        )
