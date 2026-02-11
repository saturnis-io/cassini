"""Schema hardening: CASCADE FKs, timezone-aware datetimes, encrypted broker passwords,
composite indexes, violation.char_id denormalization, annotation CHECK constraint.

Revision ID: 020
Revises: 019
Create Date: 2026-02-11

Cascade Chain (documented):
  Plant -> Hierarchy -> Characteristic -> Sample -> Measurement (CASCADE)
                                                 -> Violation (CASCADE)
                                                 -> SampleEditHistory (CASCADE)
                                       -> CharacteristicRule (CASCADE)
                                       -> CharacteristicConfig (CASCADE)
                                       -> DataSource (already CASCADE)
                                       -> Annotation (CASCADE)
  Annotation -> sample refs (SET NULL -- annotation survives sample deletion)
  Hierarchy -> children (CASCADE -- deleting parent deletes subtree)
"""

import logging

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None

# Naming convention so Alembic can identify unnamed SQLite FKs for drop_constraint.
# The generated name must match the column->referred_table pattern that Alembic
# reflects from the SQLite schema.
NAMING_CONVENTION = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
}


def upgrade() -> None:
    """Apply schema hardening changes."""

    # -----------------------------------------------------------------------
    # 1. hierarchy: CASCADE on parent_id, index on parent_id
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "hierarchy", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_hierarchy_parent_id_hierarchy", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_hierarchy_parent_id_cascade",
            "hierarchy",
            ["parent_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_hierarchy_parent_id", ["parent_id"])

    # -----------------------------------------------------------------------
    # 2. characteristic: CASCADE on hierarchy_id FK
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "characteristic", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_characteristic_hierarchy_id_hierarchy", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_characteristic_hierarchy_id_cascade",
            "hierarchy",
            ["hierarchy_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # -----------------------------------------------------------------------
    # 3. characteristic_rules: CASCADE on char_id FK
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "characteristic_rules", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_characteristic_rules_char_id_characteristic", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_charrules_char_id_cascade",
            "characteristic",
            ["char_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # -----------------------------------------------------------------------
    # 4. characteristic_config: timezone-aware datetimes
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic_config") as batch_op:
        batch_op.alter_column(
            "created_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "updated_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )

    # -----------------------------------------------------------------------
    # 5. sample: CASCADE FK, timezone timestamp, composite index
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "sample", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_sample_char_id_characteristic", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_sample_char_id_cascade",
            "characteristic",
            ["char_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.alter_column(
            "timestamp",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.create_index(
            "ix_sample_char_id_timestamp", ["char_id", "timestamp"]
        )

    # -----------------------------------------------------------------------
    # 6. measurement: CASCADE FK
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "measurement", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_measurement_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_measurement_sample_id_cascade",
            "sample",
            ["sample_id"],
            ["id"],
            ondelete="CASCADE",
        )

    # -----------------------------------------------------------------------
    # 7. sample_edit_history: CASCADE FK, timezone datetime, JSON columns
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "sample_edit_history", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_sample_edit_history_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_seh_sample_id_cascade",
            "sample",
            ["sample_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.alter_column(
            "edited_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "previous_values",
            type_=sa.JSON(),
            existing_type=sa.Text(),
            existing_nullable=False,
            postgresql_using="previous_values::json",
        )
        batch_op.alter_column(
            "new_values",
            type_=sa.JSON(),
            existing_type=sa.Text(),
            existing_nullable=False,
            postgresql_using="new_values::json",
        )

    # -----------------------------------------------------------------------
    # 8. violation: CASCADE FK, add char_id + created_at, timezone ack_timestamp
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "violation", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_violation_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_violation_sample_id_cascade",
            "sample",
            ["sample_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.add_column(
            sa.Column("char_id", sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_violation_char_id_cascade",
            "characteristic",
            ["char_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_violation_char_id", ["char_id"])
        batch_op.add_column(
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            )
        )
        batch_op.alter_column(
            "ack_timestamp",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )

    # Backfill char_id from sample.char_id
    op.execute(
        sa.text(
            "UPDATE violation SET char_id = ("
            "  SELECT sample.char_id FROM sample"
            "  WHERE sample.id = violation.sample_id"
            ")"
        )
    )

    # -----------------------------------------------------------------------
    # 9. annotation: CASCADE/SET NULL FKs, timezone datetimes, CHECK constraint
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "annotation", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_annotation_characteristic_id_characteristic", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_ann_char_id_cascade",
            "characteristic",
            ["characteristic_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.drop_constraint(
            "fk_annotation_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_ann_sample_id_setnull",
            "sample",
            ["sample_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_constraint(
            "fk_annotation_start_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_ann_start_sample_id_setnull",
            "sample",
            ["start_sample_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.drop_constraint(
            "fk_annotation_end_sample_id_sample", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_ann_end_sample_id_setnull",
            "sample",
            ["end_sample_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.alter_column(
            "start_time",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "end_time",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "created_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "updated_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.create_check_constraint(
            "ck_annotation_type",
            "annotation_type IN ('point', 'period')",
        )

    # -----------------------------------------------------------------------
    # 10. annotation_history: timezone datetime
    # -----------------------------------------------------------------------
    with op.batch_alter_table("annotation_history") as batch_op:
        batch_op.alter_column(
            "changed_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )

    # -----------------------------------------------------------------------
    # 11. mqtt_broker: larger password, plant-scoped unique name, encrypt passwords
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "mqtt_broker", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        batch_op.alter_column(
            "password",
            type_=sa.String(500),
            existing_type=sa.String(255),
            existing_nullable=True,
        )
        # Drop the global unique on name (reflected as "uq" by convention or inline)
        try:
            batch_op.drop_constraint(
                "uq_mqtt_broker_name", type_="unique"
            )
        except (ValueError, KeyError):
            # SQLite: constraint may be anonymous — batch mode handles it
            pass
        batch_op.create_unique_constraint(
            "uq_broker_plant_name", ["plant_id", "name"]
        )

    # Encrypt existing plaintext broker passwords
    _encrypt_broker_passwords()

    # -----------------------------------------------------------------------
    # 12. opcua_server: plant-scoped unique name
    # -----------------------------------------------------------------------
    with op.batch_alter_table(
        "opcua_server", naming_convention=NAMING_CONVENTION
    ) as batch_op:
        try:
            batch_op.drop_constraint(
                "uq_opcua_server_name", type_="unique"
            )
        except (ValueError, KeyError):
            pass
        batch_op.create_unique_constraint(
            "uq_opcua_server_plant_name", ["plant_id", "name"]
        )

    # -----------------------------------------------------------------------
    # 13. user_plant_role: add created_at
    # -----------------------------------------------------------------------
    with op.batch_alter_table("user_plant_role") as batch_op:
        batch_op.add_column(
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            )
        )

    # -----------------------------------------------------------------------
    # 14. api_keys: timezone-aware datetimes
    # -----------------------------------------------------------------------
    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.alter_column(
            "created_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "expires_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "last_used_at",
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )


def _encrypt_broker_passwords() -> None:
    """Encrypt existing plaintext broker passwords in-place.

    Skips passwords that are already Fernet-encrypted (base64 prefix 'gAAAAA').
    """
    try:
        from openspc.db.dialects import encrypt_password, get_encryption_key

        key = get_encryption_key()
    except Exception as e:
        logger.warning(
            "Could not load encryption key for broker password migration: %s. "
            "Skipping password encryption -- passwords will be encrypted on next update.",
            e,
        )
        return

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, password, username FROM mqtt_broker"
            " WHERE password IS NOT NULL OR username IS NOT NULL"
        )
    ).fetchall()

    encrypted_count = 0
    for row in rows:
        broker_id, password, username = row[0], row[1], row[2]
        updates = {}

        # Skip if already Fernet-encrypted (gAAAAA prefix)
        if password and not password.startswith("gAAAAA"):
            updates["password"] = encrypt_password(password, key)
        if username and not username.startswith("gAAAAA"):
            updates["username"] = encrypt_password(username, key)

        if updates:
            set_clauses = ", ".join(f"{k} = :val_{k}" for k in updates)
            params = {f"val_{k}": v for k, v in updates.items()}
            params["bid"] = broker_id
            conn.execute(
                sa.text(f"UPDATE mqtt_broker SET {set_clauses} WHERE id = :bid"),
                params,
            )
            encrypted_count += 1

    if encrypted_count:
        logger.info("Encrypted %d broker credential(s)", encrypted_count)


def downgrade() -> None:
    """Reverse schema hardening changes."""

    # 14. api_keys: revert timezone
    with op.batch_alter_table("api_keys") as batch_op:
        batch_op.alter_column(
            "created_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "expires_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "last_used_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 13. user_plant_role: drop created_at
    with op.batch_alter_table("user_plant_role") as batch_op:
        batch_op.drop_column("created_at")

    # 12. opcua_server: restore global unique
    with op.batch_alter_table("opcua_server") as batch_op:
        batch_op.drop_constraint("uq_opcua_server_plant_name", type_="unique")
        batch_op.create_unique_constraint("uq_opcua_server_name", ["name"])

    # 11. mqtt_broker: restore global unique, revert password size
    with op.batch_alter_table("mqtt_broker") as batch_op:
        batch_op.drop_constraint("uq_broker_plant_name", type_="unique")
        batch_op.create_unique_constraint("uq_mqtt_broker_name", ["name"])
        batch_op.alter_column(
            "password", type_=sa.String(255), existing_type=sa.String(500)
        )

    # 10. annotation_history: revert timezone
    with op.batch_alter_table("annotation_history") as batch_op:
        batch_op.alter_column(
            "changed_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 9. annotation: revert FKs, datetimes, drop check constraint
    with op.batch_alter_table("annotation") as batch_op:
        batch_op.drop_constraint("ck_annotation_type", type_="check")
        batch_op.alter_column(
            "updated_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "created_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "end_time", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "start_time", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 8. violation: drop char_id, created_at, revert ack_timestamp
    with op.batch_alter_table("violation") as batch_op:
        batch_op.alter_column(
            "ack_timestamp", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.drop_index("ix_violation_char_id")
        batch_op.drop_constraint("fk_violation_char_id_cascade", type_="foreignkey")
        batch_op.drop_column("created_at")
        batch_op.drop_column("char_id")

    # 7. sample_edit_history: revert JSON to Text, revert timezone
    with op.batch_alter_table("sample_edit_history") as batch_op:
        batch_op.alter_column(
            "new_values", type_=sa.Text(), existing_type=sa.JSON()
        )
        batch_op.alter_column(
            "previous_values", type_=sa.Text(), existing_type=sa.JSON()
        )
        batch_op.alter_column(
            "edited_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 5. sample: drop composite index, revert timezone
    with op.batch_alter_table("sample") as batch_op:
        batch_op.drop_index("ix_sample_char_id_timestamp")
        batch_op.alter_column(
            "timestamp", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 4. characteristic_config: revert timezone
    with op.batch_alter_table("characteristic_config") as batch_op:
        batch_op.alter_column(
            "updated_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )
        batch_op.alter_column(
            "created_at", type_=sa.DateTime(), existing_type=sa.DateTime(timezone=True)
        )

    # 1. hierarchy: drop parent_id index
    with op.batch_alter_table("hierarchy") as batch_op:
        batch_op.drop_index("ix_hierarchy_parent_id")
