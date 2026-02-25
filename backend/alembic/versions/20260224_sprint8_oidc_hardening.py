"""Sprint 8: OIDC hardening — state table, account linking, claim mapping.

Adds oidc_state (CSRF token storage), oidc_account_link (user-to-provider
binding), and new columns on oidc_config for claim mapping and RP-initiated
logout.  Includes a data migration to transform role_mapping from flat
{"group": "role"} to plant-scoped {"group": {"*": "role"}} format.

Revision ID: 036
Revises: 035
Create Date: 2026-02-24
"""
import json

from alembic import op
import sqlalchemy as sa

revision = "036"
down_revision = "035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. oidc_state — CSRF state tokens for OIDC authorization flow
    # ------------------------------------------------------------------
    op.create_table(
        "oidc_state",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("state", sa.String(64), nullable=False),
        sa.Column("nonce", sa.String(64), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("redirect_uri", sa.String(500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["oidc_config.id"],
            name="fk_oidc_state_provider_id_oidc_config",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("state", name="uq_oidc_state_state"),
    )
    op.create_index("ix_oidc_state_expires_at", "oidc_state", ["expires_at"])

    # ------------------------------------------------------------------
    # 2. oidc_account_link — maps OIDC subjects to local users
    # ------------------------------------------------------------------
    op.create_table(
        "oidc_account_link",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("provider_id", sa.Integer(), nullable=False),
        sa.Column("oidc_subject", sa.String(255), nullable=False),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name="fk_oidc_account_link_user_id_user",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["oidc_config.id"],
            name="fk_oidc_account_link_provider_id_oidc_config",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "provider_id", "oidc_subject",
            name="uq_oidc_account_link_provider_subject",
        ),
    )

    # ------------------------------------------------------------------
    # 3. New columns on oidc_config (batch_alter_table for SQLite)
    # ------------------------------------------------------------------
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
    }
    with op.batch_alter_table(
        "oidc_config", naming_convention=naming_convention
    ) as batch_op:
        batch_op.add_column(
            sa.Column(
                "claim_mapping",
                sa.Text(),
                nullable=False,
                server_default="{}",
            )
        )
        batch_op.add_column(
            sa.Column(
                "end_session_endpoint",
                sa.String(500),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "post_logout_redirect_uri",
                sa.String(500),
                nullable=True,
            )
        )

    # ------------------------------------------------------------------
    # 4. Data migration: role_mapping flat → plant-scoped format
    #    {"group": "role"} → {"group": {"*": "role"}}
    # ------------------------------------------------------------------
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, role_mapping FROM oidc_config")
    ).fetchall()

    for row in rows:
        row_id = row[0]
        raw = row[1]
        try:
            mapping = json.loads(raw) if raw else {}
        except (json.JSONDecodeError, TypeError):
            continue

        if not mapping:
            continue

        # Only transform if the values are plain strings (old flat format)
        needs_transform = False
        for value in mapping.values():
            if isinstance(value, str):
                needs_transform = True
                break

        if needs_transform:
            new_mapping = {}
            for group, role in mapping.items():
                if isinstance(role, str):
                    new_mapping[group] = {"*": role}
                else:
                    # Already in new format, keep as-is
                    new_mapping[group] = role
            conn.execute(
                sa.text(
                    "UPDATE oidc_config SET role_mapping = :rm WHERE id = :id"
                ),
                {"rm": json.dumps(new_mapping), "id": row_id},
            )


def downgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Reverse data migration: plant-scoped → flat format
    # ------------------------------------------------------------------
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, role_mapping FROM oidc_config")
    ).fetchall()

    for row in rows:
        row_id = row[0]
        raw = row[1]
        try:
            mapping = json.loads(raw) if raw else {}
        except (json.JSONDecodeError, TypeError):
            continue

        if not mapping:
            continue

        new_mapping = {}
        for group, role_config in mapping.items():
            if isinstance(role_config, dict) and "*" in role_config:
                new_mapping[group] = role_config["*"]
            elif isinstance(role_config, str):
                new_mapping[group] = role_config
            else:
                # Complex plant-scoped mapping — take first value
                for _plant, role in role_config.items():
                    new_mapping[group] = role
                    break

        conn.execute(
            sa.text(
                "UPDATE oidc_config SET role_mapping = :rm WHERE id = :id"
            ),
            {"rm": json.dumps(new_mapping), "id": row_id},
        )

    # ------------------------------------------------------------------
    # 2. Remove columns from oidc_config
    # ------------------------------------------------------------------
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
    }
    with op.batch_alter_table(
        "oidc_config", naming_convention=naming_convention
    ) as batch_op:
        batch_op.drop_column("post_logout_redirect_uri")
        batch_op.drop_column("end_session_endpoint")
        batch_op.drop_column("claim_mapping")

    # ------------------------------------------------------------------
    # 3. Drop oidc_account_link
    # ------------------------------------------------------------------
    op.drop_table("oidc_account_link")

    # ------------------------------------------------------------------
    # 4. Drop oidc_state
    # ------------------------------------------------------------------
    op.drop_index("ix_oidc_state_expires_at", table_name="oidc_state")
    op.drop_table("oidc_state")
