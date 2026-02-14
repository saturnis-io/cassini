"""Add electronic signature tables for 21 CFR Part 11 compliance.

Revision ID: 031
Revises: 030
Create Date: 2026-02-14

Creates 6 tables for electronic signatures and workflow management:
- electronic_signature: Immutable signature records with SHA-256 hashes
- signature_meaning: Plant-scoped vocabulary (approved, reviewed, etc.)
- signature_workflow: Defines what actions require signatures
- signature_workflow_step: Individual steps within workflows
- signature_workflow_instance: Running workflow state
- password_policy: Per-plant password policy (11.300)

Also adds 6 columns to user table for Part 11 support.
Seeds default signature meanings per existing plant.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- signature_meaning ----
    op.create_table(
        "signature_meaning",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "requires_comment",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("plant_id", "code", name="uq_signature_meaning_plant_code"),
    )

    # ---- signature_workflow ----
    op.create_table(
        "signature_workflow",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "is_required",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
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
        sa.UniqueConstraint(
            "plant_id", "resource_type", name="uq_signature_workflow_plant_resource"
        ),
    )

    # ---- signature_workflow_step ----
    op.create_table(
        "signature_workflow_step",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "workflow_id",
            sa.Integer(),
            sa.ForeignKey("signature_workflow.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("min_role", sa.String(20), nullable=False),
        sa.Column("meaning_code", sa.String(50), nullable=False),
        sa.Column(
            "is_required",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "allow_self_sign",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("timeout_hours", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workflow_id", "step_order", name="uq_workflow_step_order"
        ),
    )

    # ---- signature_workflow_instance ----
    op.create_table(
        "signature_workflow_instance",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "workflow_id",
            sa.Integer(),
            sa.ForeignKey("signature_workflow.id"),
            nullable=False,
        ),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(20),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("current_step", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "initiated_by",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=True,
        ),
        sa.Column(
            "initiated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_swi_resource",
        "signature_workflow_instance",
        ["resource_type", "resource_id"],
    )
    op.create_index(
        "ix_swi_status",
        "signature_workflow_instance",
        ["status"],
    )
    op.create_index(
        "ix_swi_initiated_by",
        "signature_workflow_instance",
        ["initiated_by"],
    )

    # ---- electronic_signature ----
    op.create_table(
        "electronic_signature",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("user.id"),
            nullable=False,
        ),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("meaning_code", sa.String(50), nullable=False),
        sa.Column("meaning_display", sa.String(255), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("resource_hash", sa.String(128), nullable=False),
        sa.Column("signature_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column(
            "workflow_step_id",
            sa.Integer(),
            sa.ForeignKey("signature_workflow_step.id"),
            nullable=True,
        ),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column(
            "is_valid",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invalidated_reason", sa.String(500), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_esig_resource",
        "electronic_signature",
        ["resource_type", "resource_id"],
    )
    op.create_index(
        "ix_esig_user_timestamp",
        "electronic_signature",
        ["user_id", sa.text("timestamp DESC")],
    )
    op.create_index(
        "ix_esig_workflow_step",
        "electronic_signature",
        ["workflow_step_id"],
    )

    # ---- password_policy ----
    op.create_table(
        "password_policy",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "plant_id",
            sa.Integer(),
            sa.ForeignKey("plant.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "password_expiry_days",
            sa.Integer(),
            server_default="90",
            nullable=False,
        ),
        sa.Column(
            "max_failed_attempts",
            sa.Integer(),
            server_default="5",
            nullable=False,
        ),
        sa.Column(
            "lockout_duration_minutes",
            sa.Integer(),
            server_default="30",
            nullable=False,
        ),
        sa.Column(
            "min_password_length",
            sa.Integer(),
            server_default="8",
            nullable=False,
        ),
        sa.Column(
            "require_uppercase",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "require_lowercase",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "require_digit",
            sa.Boolean(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "require_special",
            sa.Boolean(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "password_history_count",
            sa.Integer(),
            server_default="5",
            nullable=False,
        ),
        sa.Column(
            "session_timeout_minutes",
            sa.Integer(),
            server_default="30",
            nullable=False,
        ),
        sa.Column(
            "signature_timeout_minutes",
            sa.Integer(),
            server_default="5",
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ---- Add columns to user table ----
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
    }
    with op.batch_alter_table(
        "user", naming_convention=naming_convention
    ) as batch_op:
        batch_op.add_column(
            sa.Column("full_name", sa.String(255), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "password_changed_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "failed_login_count",
                sa.Integer(),
                server_default="0",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column(
                "locked_until",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column("password_history", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "last_signature_auth_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )

    # ---- Seed default signature meanings per plant ----
    conn = op.get_bind()
    plants = conn.execute(sa.text("SELECT id FROM plant")).fetchall()

    default_meanings = [
        ("approved", "Approved", "Approval of data or action", 0, 0),
        ("reviewed", "Reviewed", "Review completed", 0, 1),
        ("verified", "Verified", "Data verification", 0, 2),
        ("rejected", "Rejected", "Rejection with mandatory comment", 1, 3),
        ("released", "Released for Production", "Release authorization", 0, 4),
    ]

    for plant_row in plants:
        plant_id = plant_row[0]
        for code, display, desc, req_comment, sort in default_meanings:
            conn.execute(
                sa.text(
                    "INSERT INTO signature_meaning "
                    "(plant_id, code, display_name, description, requires_comment, sort_order) "
                    "VALUES (:plant_id, :code, :display_name, :description, :requires_comment, :sort_order)"
                ),
                {
                    "plant_id": plant_id,
                    "code": code,
                    "display_name": display,
                    "description": desc,
                    "requires_comment": req_comment,
                    "sort_order": sort,
                },
            )


def downgrade() -> None:
    # Drop tables in reverse dependency order
    op.drop_index("ix_esig_workflow_step", table_name="electronic_signature")
    op.drop_index("ix_esig_user_timestamp", table_name="electronic_signature")
    op.drop_index("ix_esig_resource", table_name="electronic_signature")
    op.drop_table("electronic_signature")

    op.drop_index("ix_swi_initiated_by", table_name="signature_workflow_instance")
    op.drop_index("ix_swi_status", table_name="signature_workflow_instance")
    op.drop_index("ix_swi_resource", table_name="signature_workflow_instance")
    op.drop_table("signature_workflow_instance")

    op.drop_table("signature_workflow_step")
    op.drop_table("signature_workflow")
    op.drop_table("signature_meaning")
    op.drop_table("password_policy")

    # Remove columns from user table
    naming_convention = {
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
    }
    with op.batch_alter_table(
        "user", naming_convention=naming_convention
    ) as batch_op:
        batch_op.drop_column("last_signature_auth_at")
        batch_op.drop_column("password_history")
        batch_op.drop_column("locked_until")
        batch_op.drop_column("failed_login_count")
        batch_op.drop_column("password_changed_at")
        batch_op.drop_column("full_name")
