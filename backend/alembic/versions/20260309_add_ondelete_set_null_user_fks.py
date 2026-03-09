"""add ondelete SET NULL to user FKs on signature/FAI/MSA/gage tables

Adds ON DELETE SET NULL to user foreign keys so that deleting a user
preserves the audit trail (signature records, FAI reports, MSA studies,
gage bridge registrations).  Also makes the formerly NOT NULL user FK
columns nullable where needed.

Revision ID: 20260309_ondelete
Revises: a856044d332f
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260309_ondelete"
down_revision = "a856044d332f"
branch_labels = None
depends_on = None

# Naming convention for constraint discovery on SQLite
_naming = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    # --- electronic_signature.user_id ---
    # Change from NOT NULL, no ondelete -> nullable, SET NULL
    with op.batch_alter_table(
        "electronic_signature", naming_convention=_naming
    ) as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=True)
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

    # --- signature_workflow_instance.initiated_by ---
    # Already nullable, just add ondelete SET NULL
    with op.batch_alter_table(
        "signature_workflow_instance", naming_convention=_naming
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_signature_workflow_instance_initiated_by_user",
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            "fk_signature_workflow_instance_initiated_by_user",
            "user",
            ["initiated_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- fai_report.created_by ---
    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=True)
        batch_op.drop_constraint(
            "fk_fai_report_created_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_created_by_user",
            "user",
            ["created_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- fai_report.submitted_by ---
    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_fai_report_submitted_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_submitted_by_user",
            "user",
            ["submitted_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- fai_report.approved_by ---
    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_fai_report_approved_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_approved_by_user",
            "user",
            ["approved_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- msa_study.created_by ---
    with op.batch_alter_table("msa_study", naming_convention=_naming) as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=True)
        batch_op.drop_constraint(
            "fk_msa_study_created_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_msa_study_created_by_user",
            "user",
            ["created_by"],
            ["id"],
            ondelete="SET NULL",
        )

    # --- gage_bridge.registered_by ---
    with op.batch_alter_table("gage_bridge", naming_convention=_naming) as batch_op:
        batch_op.alter_column(
            "registered_by", existing_type=sa.Integer(), nullable=True
        )
        batch_op.drop_constraint(
            "fk_gage_bridge_registered_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_gage_bridge_registered_by_user",
            "user",
            ["registered_by"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    # Reverse: remove ondelete, restore NOT NULL where applicable

    with op.batch_alter_table("gage_bridge", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_gage_bridge_registered_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_gage_bridge_registered_by_user",
            "user",
            ["registered_by"],
            ["id"],
        )
        batch_op.alter_column(
            "registered_by", existing_type=sa.Integer(), nullable=False
        )

    with op.batch_alter_table("msa_study", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_msa_study_created_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_msa_study_created_by_user",
            "user",
            ["created_by"],
            ["id"],
        )
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_fai_report_approved_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_approved_by_user",
            "user",
            ["approved_by"],
            ["id"],
        )

    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_fai_report_submitted_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_submitted_by_user",
            "user",
            ["submitted_by"],
            ["id"],
        )

    with op.batch_alter_table("fai_report", naming_convention=_naming) as batch_op:
        batch_op.drop_constraint(
            "fk_fai_report_created_by_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_fai_report_created_by_user",
            "user",
            ["created_by"],
            ["id"],
        )
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=False)

    with op.batch_alter_table(
        "signature_workflow_instance", naming_convention=_naming
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_signature_workflow_instance_initiated_by_user",
            type_="foreignkey",
        )
        batch_op.create_foreign_key(
            "fk_signature_workflow_instance_initiated_by_user",
            "user",
            ["initiated_by"],
            ["id"],
        )

    with op.batch_alter_table(
        "electronic_signature", naming_convention=_naming
    ) as batch_op:
        batch_op.drop_constraint(
            "fk_electronic_signature_user_id_user", type_="foreignkey"
        )
        batch_op.create_foreign_key(
            "fk_electronic_signature_user_id_user",
            "user",
            ["user_id"],
            ["id"],
        )
        batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
