"""Add plant table and plant_id foreign keys.

Revision ID: 008
Revises: 007
Create Date: 2026-02-07

Adds:
- plant table with id, name, code, is_active, settings, timestamps
- plant_id foreign key to hierarchy table
- plant_id foreign key to mqtt_broker table
- Default plant for existing data
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create plant table
    op.create_table(
        "plant",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("settings", sa.JSON(), nullable=True),
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
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("code"),
    )

    # Create Default plant first
    op.execute("""
        INSERT INTO plant (name, code, is_active, settings)
        VALUES ('Default Plant', 'DEFAULT', 1, '{}')
    """)

    # Add plant_id to hierarchy using batch mode for SQLite
    with op.batch_alter_table("hierarchy") as batch_op:
        batch_op.add_column(sa.Column("plant_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_hierarchy_plant", "plant", ["plant_id"], ["id"], ondelete="CASCADE"
        )

    # Assign all existing hierarchies to Default plant
    op.execute("""
        UPDATE hierarchy SET plant_id = (SELECT id FROM plant WHERE code = 'DEFAULT')
    """)

    # Add plant_id to mqtt_broker using batch mode for SQLite
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.add_column(sa.Column("plant_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_mqtt_broker_plant", "plant", ["plant_id"], ["id"], ondelete="CASCADE"
        )

    # Assign all existing brokers to Default plant
    op.execute("""
        UPDATE mqtt_broker SET plant_id = (SELECT id FROM plant WHERE code = 'DEFAULT')
    """)


def downgrade() -> None:
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.drop_constraint("fk_mqtt_broker_plant", type_="foreignkey")
        batch_op.drop_column("plant_id")

    with op.batch_alter_table("hierarchy") as batch_op:
        batch_op.drop_constraint("fk_hierarchy_plant", type_="foreignkey")
        batch_op.drop_column("plant_id")

    op.drop_table("plant")
