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

# Naming convention for SQLite batch mode FK identification.
_naming = {
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def _drop_and_recreate_fk(
    table: str,
    column: str,
    ref_table: str,
    ref_cols: list[str],
    new_name: str,
    ondelete: str | None,
) -> None:
    """Drop existing FK and recreate. Dialect-aware for SQLite vs PostgreSQL."""
    conn = op.get_bind()

    if conn.dialect.name == "sqlite":
        with op.batch_alter_table(table, naming_convention=_naming) as batch_op:
            conv_name = f"fk_{table}_{column}_{ref_table}"
            batch_op.drop_constraint(conv_name, type_="foreignkey")
            batch_op.create_foreign_key(
                new_name, ref_table, [column], ref_cols, ondelete=ondelete
            )
    else:
        # Introspect actual FK name (PG auto-names differ from convention)
        insp = sa.inspect(conn)
        for fk in insp.get_foreign_keys(table):
            if column in fk["constrained_columns"]:
                op.drop_constraint(fk["name"], table, type_="foreignkey")
                break
        op.create_foreign_key(
            new_name, table, ref_table, [column], ref_cols, ondelete=ondelete
        )


def upgrade() -> None:
    # --- electronic_signature.user_id ---
    # Change from NOT NULL, no ondelete -> nullable, SET NULL
    with op.batch_alter_table("electronic_signature") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=True)
    _drop_and_recreate_fk(
        "electronic_signature", "user_id", "user", ["id"],
        "fk_electronic_signature_user_id_user", "SET NULL",
    )

    # --- signature_workflow_instance.initiated_by ---
    # Already nullable, just add ondelete SET NULL
    _drop_and_recreate_fk(
        "signature_workflow_instance", "initiated_by", "user", ["id"],
        "fk_signature_workflow_instance_initiated_by_user", "SET NULL",
    )

    # --- fai_report.created_by ---
    with op.batch_alter_table("fai_report") as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=True)
    _drop_and_recreate_fk(
        "fai_report", "created_by", "user", ["id"],
        "fk_fai_report_created_by_user", "SET NULL",
    )

    # --- fai_report.submitted_by ---
    _drop_and_recreate_fk(
        "fai_report", "submitted_by", "user", ["id"],
        "fk_fai_report_submitted_by_user", "SET NULL",
    )

    # --- fai_report.approved_by ---
    _drop_and_recreate_fk(
        "fai_report", "approved_by", "user", ["id"],
        "fk_fai_report_approved_by_user", "SET NULL",
    )

    # --- msa_study.created_by ---
    with op.batch_alter_table("msa_study") as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=True)
    _drop_and_recreate_fk(
        "msa_study", "created_by", "user", ["id"],
        "fk_msa_study_created_by_user", "SET NULL",
    )

    # --- gage_bridge.registered_by ---
    with op.batch_alter_table("gage_bridge") as batch_op:
        batch_op.alter_column(
            "registered_by", existing_type=sa.Integer(), nullable=True
        )
    _drop_and_recreate_fk(
        "gage_bridge", "registered_by", "user", ["id"],
        "fk_gage_bridge_registered_by_user", "SET NULL",
    )


def downgrade() -> None:
    # Reverse: remove ondelete, restore NOT NULL where applicable.
    # After upgrade, all FKs have explicit names — safe to drop by name.

    _drop_and_recreate_fk(
        "gage_bridge", "registered_by", "user", ["id"],
        "fk_gage_bridge_registered_by_user", None,
    )
    with op.batch_alter_table("gage_bridge") as batch_op:
        batch_op.alter_column(
            "registered_by", existing_type=sa.Integer(), nullable=False
        )

    _drop_and_recreate_fk(
        "msa_study", "created_by", "user", ["id"],
        "fk_msa_study_created_by_user", None,
    )
    with op.batch_alter_table("msa_study") as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=False)

    _drop_and_recreate_fk(
        "fai_report", "approved_by", "user", ["id"],
        "fk_fai_report_approved_by_user", None,
    )

    _drop_and_recreate_fk(
        "fai_report", "submitted_by", "user", ["id"],
        "fk_fai_report_submitted_by_user", None,
    )

    _drop_and_recreate_fk(
        "fai_report", "created_by", "user", ["id"],
        "fk_fai_report_created_by_user", None,
    )
    with op.batch_alter_table("fai_report") as batch_op:
        batch_op.alter_column("created_by", existing_type=sa.Integer(), nullable=False)

    _drop_and_recreate_fk(
        "signature_workflow_instance", "initiated_by", "user", ["id"],
        "fk_signature_workflow_instance_initiated_by_user", None,
    )

    _drop_and_recreate_fk(
        "electronic_signature", "user_id", "user", ["id"],
        "fk_electronic_signature_user_id_user", None,
    )
    with op.batch_alter_table("electronic_signature") as batch_op:
        batch_op.alter_column("user_id", existing_type=sa.Integer(), nullable=False)
