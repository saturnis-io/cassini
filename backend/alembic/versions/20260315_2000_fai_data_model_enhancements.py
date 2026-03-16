"""FAI data model enhancements: child tables, fai_type, drawing_zone, value_type, measurements

Revision ID: c7d8e9f0a1b2
Revises: f8e2a1b3c4d5, b4c8f1a23d67, b4c8f2a71d30
Create Date: 2026-03-15 20:00:00.000000+00:00

"""
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c7d8e9f0a1b2"
down_revision = ("f8e2a1b3c4d5", "b4c8f1a23d67", "b4c8f2a71d30")
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- New child tables for Form 2 ---

    op.create_table(
        "fai_material",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("material_part_number", sa.String(255), nullable=True),
        sa.Column("material_spec", sa.String(255), nullable=True),
        sa.Column("cert_number", sa.String(255), nullable=True),
        sa.Column("supplier", sa.String(255), nullable=True),
        sa.Column("result", sa.String(20), nullable=False, server_default="pass"),
        sa.ForeignKeyConstraint(["report_id"], ["fai_report.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fai_material_report", "fai_material", ["report_id"])

    op.create_table(
        "fai_special_process",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("process_name", sa.String(255), nullable=True),
        sa.Column("process_spec", sa.String(255), nullable=True),
        sa.Column("cert_number", sa.String(255), nullable=True),
        sa.Column("approved_supplier", sa.String(255), nullable=True),
        sa.Column("result", sa.String(20), nullable=False, server_default="pass"),
        sa.ForeignKeyConstraint(["report_id"], ["fai_report.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fai_special_process_report", "fai_special_process", ["report_id"])

    op.create_table(
        "fai_functional_test",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("test_description", sa.String(500), nullable=True),
        sa.Column("procedure_number", sa.String(255), nullable=True),
        sa.Column("actual_results", sa.Text(), nullable=True),
        sa.Column("result", sa.String(20), nullable=False, server_default="pass"),
        sa.ForeignKeyConstraint(["report_id"], ["fai_report.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fai_functional_test_report", "fai_functional_test", ["report_id"])

    # --- Add fai_type to fai_report ---
    with op.batch_alter_table("fai_report", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("fai_type", sa.String(20), nullable=False, server_default=sa.text("'full'"))
        )

    # --- Add new columns to fai_item ---
    with op.batch_alter_table("fai_item", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("drawing_zone", sa.String(50), nullable=True)
        )
        batch_op.add_column(
            sa.Column("value_type", sa.String(20), nullable=False, server_default=sa.text("'numeric'"))
        )
        batch_op.add_column(
            sa.Column("actual_value_text", sa.String(500), nullable=True)
        )
        batch_op.add_column(
            sa.Column("measurements", sa.Text(), nullable=True)
        )

    # --- Data migration: parse legacy text fields into child rows ---
    conn = op.get_bind()

    # Migrate material_supplier / material_spec into fai_material rows
    reports = conn.execute(
        sa.text(
            "SELECT id, material_supplier, material_spec "
            "FROM fai_report "
            "WHERE material_supplier IS NOT NULL OR material_spec IS NOT NULL"
        )
    ).fetchall()
    for row in reports:
        report_id, supplier, spec = row[0], row[1], row[2]
        if supplier or spec:
            conn.execute(
                sa.text(
                    "INSERT INTO fai_material (report_id, supplier, material_spec, result) "
                    "VALUES (:rid, :supplier, :spec, 'pass')"
                ),
                {"rid": report_id, "supplier": supplier, "spec": spec},
            )

    # Migrate special_processes JSON into fai_special_process rows
    sp_reports = conn.execute(
        sa.text(
            "SELECT id, special_processes FROM fai_report "
            "WHERE special_processes IS NOT NULL AND special_processes != ''"
        )
    ).fetchall()
    for row in sp_reports:
        report_id, sp_text = row[0], row[1]
        try:
            processes = json.loads(sp_text)
            if isinstance(processes, list):
                for proc in processes:
                    if isinstance(proc, dict):
                        conn.execute(
                            sa.text(
                                "INSERT INTO fai_special_process "
                                "(report_id, process_name, process_spec, approved_supplier, result) "
                                "VALUES (:rid, :name, :spec, :supplier, 'pass')"
                            ),
                            {
                                "rid": report_id,
                                "name": proc.get("name", proc.get("process_name", "")),
                                "spec": proc.get("spec", proc.get("process_spec", "")),
                                "supplier": proc.get("supplier", proc.get("approved_supplier", "")),
                            },
                        )
                    elif isinstance(proc, str):
                        conn.execute(
                            sa.text(
                                "INSERT INTO fai_special_process "
                                "(report_id, process_name, result) VALUES (:rid, :name, 'pass')"
                            ),
                            {"rid": report_id, "name": proc},
                        )
        except (json.JSONDecodeError, TypeError):
            # Plain text: insert as single process_name
            conn.execute(
                sa.text(
                    "INSERT INTO fai_special_process "
                    "(report_id, process_name, result) VALUES (:rid, :name, 'pass')"
                ),
                {"rid": report_id, "name": sp_text},
            )

    # Migrate functional_test_results JSON into fai_functional_test rows
    ft_reports = conn.execute(
        sa.text(
            "SELECT id, functional_test_results FROM fai_report "
            "WHERE functional_test_results IS NOT NULL AND functional_test_results != ''"
        )
    ).fetchall()
    for row in ft_reports:
        report_id, ft_text = row[0], row[1]
        try:
            tests = json.loads(ft_text)
            if isinstance(tests, list):
                for test in tests:
                    if isinstance(test, dict):
                        conn.execute(
                            sa.text(
                                "INSERT INTO fai_functional_test "
                                "(report_id, test_description, procedure_number, actual_results, result) "
                                "VALUES (:rid, :desc, :proc, :results, 'pass')"
                            ),
                            {
                                "rid": report_id,
                                "desc": test.get("description", test.get("test_description", "")),
                                "proc": test.get("procedure", test.get("procedure_number", "")),
                                "results": test.get("results", test.get("actual_results", "")),
                            },
                        )
                    elif isinstance(test, str):
                        conn.execute(
                            sa.text(
                                "INSERT INTO fai_functional_test "
                                "(report_id, test_description, result) VALUES (:rid, :desc, 'pass')"
                            ),
                            {"rid": report_id, "desc": test},
                        )
        except (json.JSONDecodeError, TypeError):
            # Plain text: insert as single test description
            conn.execute(
                sa.text(
                    "INSERT INTO fai_functional_test "
                    "(report_id, test_description, result) VALUES (:rid, :desc, 'pass')"
                ),
                {"rid": report_id, "desc": ft_text},
            )


def downgrade() -> None:
    with op.batch_alter_table("fai_item", schema=None) as batch_op:
        batch_op.drop_column("measurements")
        batch_op.drop_column("actual_value_text")
        batch_op.drop_column("value_type")
        batch_op.drop_column("drawing_zone")

    with op.batch_alter_table("fai_report", schema=None) as batch_op:
        batch_op.drop_column("fai_type")

    op.drop_index("ix_fai_functional_test_report", table_name="fai_functional_test")
    op.drop_table("fai_functional_test")
    op.drop_index("ix_fai_special_process_report", table_name="fai_special_process")
    op.drop_table("fai_special_process")
    op.drop_index("ix_fai_material_report", table_name="fai_material")
    op.drop_table("fai_material")
