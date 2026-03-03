"""Add enterprise LLM provider columns to ai_provider_config.

Adds base_url, azure_resource_name, azure_deployment_id, azure_api_version
columns for Azure OpenAI, Gemini, and OpenAI-compatible provider support.
Widens provider_type from String(20) to String(30) for 'openai_compatible'.

Revision ID: 050
Revises: 049
Create Date: 2026-03-02
"""

from alembic import op
import sqlalchemy as sa

revision = "050"
down_revision = "049"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ai_provider_config",
        sa.Column("base_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "ai_provider_config",
        sa.Column("azure_resource_name", sa.String(100), nullable=True),
    )
    op.add_column(
        "ai_provider_config",
        sa.Column("azure_deployment_id", sa.String(100), nullable=True),
    )
    op.add_column(
        "ai_provider_config",
        sa.Column("azure_api_version", sa.String(20), nullable=True),
    )
    # Widen provider_type to accommodate 'openai_compatible'
    with op.batch_alter_table("ai_provider_config") as batch_op:
        batch_op.alter_column(
            "provider_type",
            existing_type=sa.String(20),
            type_=sa.String(30),
            existing_nullable=False,
            existing_server_default="claude",
        )


def downgrade() -> None:
    op.drop_column("ai_provider_config", "azure_api_version")
    op.drop_column("ai_provider_config", "azure_deployment_id")
    op.drop_column("ai_provider_config", "azure_resource_name")
    op.drop_column("ai_provider_config", "base_url")
    with op.batch_alter_table("ai_provider_config") as batch_op:
        batch_op.alter_column(
            "provider_type",
            existing_type=sa.String(30),
            type_=sa.String(20),
            existing_nullable=False,
            existing_server_default="claude",
        )
