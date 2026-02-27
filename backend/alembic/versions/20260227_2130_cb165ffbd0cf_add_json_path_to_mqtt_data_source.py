"""add json_path to mqtt_data_source

Revision ID: cb165ffbd0cf
Revises: b24419b54417
Create Date: 2026-02-27 21:30:31.847999+00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cb165ffbd0cf'
down_revision = 'b24419b54417'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('mqtt_data_source', sa.Column('json_path', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('mqtt_data_source', 'json_path')
