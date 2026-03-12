"""Add oidc_config table for SSO/OIDC provider management.

Revision ID: 027
Revises: 026
Create Date: 2026-02-13

Creates the oidc_config table for storing OIDC identity provider
configurations used for SSO authentication.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "027"
down_revision = "026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oidc_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("issuer_url", sa.String(500), nullable=False),
        sa.Column("client_id", sa.String(255), nullable=False),
        sa.Column("client_secret_encrypted", sa.String(500), nullable=False),
        sa.Column(
            "scopes",
            sa.Text(),
            server_default='["openid", "profile", "email"]',
            nullable=False,
        ),
        sa.Column(
            "role_mapping",
            sa.Text(),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "auto_provision",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "default_role",
            sa.String(20),
            server_default="operator",
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
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
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Index for quick lookups on active providers
    op.create_index("ix_oidc_config_is_active", "oidc_config", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_oidc_config_is_active", table_name="oidc_config")
    op.drop_table("oidc_config")
