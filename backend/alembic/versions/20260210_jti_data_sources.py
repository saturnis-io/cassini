"""JTI data source tables and MQTT column migration.

Revision ID: 017
Revises: 016
Create Date: 2026-02-10

Creates polymorphic data source tables using Joined Table Inheritance:
- data_source (base table with type discriminator)
- mqtt_data_source (MQTT-specific fields)
- opcua_data_source (OPC-UA-specific fields, empty for Phase 2)

Migrates existing Characteristic MQTT columns (provider_type, mqtt_topic,
trigger_tag, metric_name) into data_source + mqtt_data_source rows,
then drops the old columns from the characteristic table.

Migration uses dialect-safe approach: inserts all parent rows first,
SELECTs back IDs by characteristic_id (unique), then inserts child rows.
No lastrowid usage.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Create data_source base table
    op.create_table(
        "data_source",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column(
            "characteristic_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "trigger_strategy",
            sa.String(50),
            nullable=False,
            server_default="on_change",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
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
            nullable=False,
        ),
    )

    # Step 2: Create mqtt_data_source sub-table
    op.create_table(
        "mqtt_data_source",
        sa.Column(
            "id",
            sa.Integer(),
            sa.ForeignKey("data_source.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "broker_id",
            sa.Integer(),
            sa.ForeignKey("mqtt_broker.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("topic", sa.String(500), nullable=False),
        sa.Column("metric_name", sa.String(255), nullable=True),
        sa.Column("trigger_tag", sa.String(500), nullable=True),
    )
    op.create_index(
        "ix_mqtt_data_source_broker_id",
        "mqtt_data_source",
        ["broker_id"],
    )

    # Step 3: Create opcua_data_source sub-table (empty, for Phase 2)
    op.create_table(
        "opcua_data_source",
        sa.Column(
            "id",
            sa.Integer(),
            sa.ForeignKey("data_source.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("server_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(500), nullable=False),
    )

    # Step 4: Migrate existing MQTT data from characteristic columns
    conn = op.get_bind()

    # Select all TAG characteristics that have mqtt_topic set
    rows = conn.execute(
        sa.text(
            "SELECT id, mqtt_topic, trigger_tag, metric_name "
            "FROM characteristic "
            "WHERE provider_type = 'TAG' AND mqtt_topic IS NOT NULL"
        )
    ).fetchall()

    if rows:
        # Insert all data_source parent rows at once
        for row in rows:
            char_id = row[0]
            trigger_tag_val = row[2]
            trigger_strategy = "on_trigger" if trigger_tag_val else "on_change"

            conn.execute(
                sa.text(
                    "INSERT INTO data_source "
                    "(type, characteristic_id, trigger_strategy, is_active) "
                    "VALUES ('mqtt', :char_id, :strategy, 1)"
                ),
                {"char_id": char_id, "strategy": trigger_strategy},
            )

        # SELECT back all inserted data_source IDs by characteristic_id (unique)
        ds_rows = conn.execute(
            sa.text(
                "SELECT id, characteristic_id "
                "FROM data_source "
                "WHERE type = 'mqtt'"
            )
        ).fetchall()

        # Build lookup: characteristic_id -> data_source.id
        ds_id_by_char = {r[1]: r[0] for r in ds_rows}

        # Insert mqtt_data_source child rows
        for row in rows:
            char_id = row[0]
            mqtt_topic = row[1]
            trigger_tag_val = row[2]
            metric_name = row[3]
            ds_id = ds_id_by_char[char_id]

            conn.execute(
                sa.text(
                    "INSERT INTO mqtt_data_source "
                    "(id, broker_id, topic, metric_name, trigger_tag) "
                    "VALUES (:ds_id, NULL, :topic, :metric, :trigger)"
                ),
                {
                    "ds_id": ds_id,
                    "topic": mqtt_topic,
                    "metric": metric_name,
                    "trigger": trigger_tag_val,
                },
            )

    # Step 5: Drop old MQTT columns from characteristic
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.drop_column("mqtt_topic")
        batch_op.drop_column("trigger_tag")
        batch_op.drop_column("metric_name")
        batch_op.drop_column("provider_type")


def downgrade() -> None:
    # Re-add columns to characteristic
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.add_column(
            sa.Column(
                "provider_type",
                sa.String(50),
                nullable=False,
                server_default="MANUAL",
            )
        )
        batch_op.add_column(
            sa.Column("mqtt_topic", sa.String(500), nullable=True)
        )
        batch_op.add_column(
            sa.Column("trigger_tag", sa.String(500), nullable=True)
        )
        batch_op.add_column(
            sa.Column("metric_name", sa.String(255), nullable=True)
        )

    # Migrate data back: data_source + mqtt_data_source -> characteristic
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT ds.characteristic_id, mds.topic, mds.trigger_tag, mds.metric_name "
            "FROM data_source ds "
            "JOIN mqtt_data_source mds ON ds.id = mds.id "
            "WHERE ds.type = 'mqtt'"
        )
    ).fetchall()

    for row in rows:
        char_id = row[0]
        topic = row[1]
        trigger_tag_val = row[2]
        metric_name = row[3]
        conn.execute(
            sa.text(
                "UPDATE characteristic "
                "SET provider_type = 'TAG', mqtt_topic = :topic, "
                "trigger_tag = :trigger, metric_name = :metric "
                "WHERE id = :char_id"
            ),
            {
                "char_id": char_id,
                "topic": topic,
                "trigger": trigger_tag_val,
                "metric": metric_name,
            },
        )

    # Drop new tables (reverse order)
    op.drop_table("opcua_data_source")
    op.drop_index("ix_mqtt_data_source_broker_id", table_name="mqtt_data_source")
    op.drop_table("mqtt_data_source")
    op.drop_table("data_source")
