"""Add allowed_redirect_uris column to oidc_config.

Column was defined in the model but never added in migration 036.

Revision ID: 051
Revises: 050
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa

revision = "051"
down_revision = "050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table(
        "oidc_config",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
        },
    ) as batch_op:
        batch_op.add_column(
            sa.Column(
                "allowed_redirect_uris",
                sa.Text(),
                nullable=False,
                server_default="[]",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table(
        "oidc_config",
        naming_convention={
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
        },
    ) as batch_op:
        batch_op.drop_column("allowed_redirect_uris")
