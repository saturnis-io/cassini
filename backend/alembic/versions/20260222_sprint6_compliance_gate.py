"""Sprint 6: Automotive/aerospace compliance gate schema.

Adds MSA (Gage R&R) tables, FAI (AS9102) tables, and short_run_mode
column on characteristic for short-run SPC charts.

Revision ID: 033
Revises: 032
Create Date: 2026-02-22
"""
from alembic import op
import sqlalchemy as sa

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. MSA Study table
    # -----------------------------------------------------------------------
    op.create_table(
        "msa_study",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("study_type", sa.String(30), nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=True),
        sa.Column("num_operators", sa.Integer(), nullable=False),
        sa.Column("num_parts", sa.Integer(), nullable=False),
        sa.Column("num_replicates", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("tolerance", sa.Float(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="setup"),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("results_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_msa_study_plant_id_plant", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"], ["characteristic.id"],
            name="fk_msa_study_characteristic_id_characteristic", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"],
            name="fk_msa_study_created_by_user",
        ),
    )

    # -----------------------------------------------------------------------
    # 2. MSA Operator table
    # -----------------------------------------------------------------------
    op.create_table(
        "msa_operator",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["study_id"], ["msa_study.id"],
            name="fk_msa_operator_study_id_msa_study", ondelete="CASCADE",
        ),
    )

    # -----------------------------------------------------------------------
    # 3. MSA Part table
    # -----------------------------------------------------------------------
    op.create_table(
        "msa_part",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("reference_value", sa.Float(), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["study_id"], ["msa_study.id"],
            name="fk_msa_part_study_id_msa_study", ondelete="CASCADE",
        ),
    )

    # -----------------------------------------------------------------------
    # 4. MSA Measurement table
    # -----------------------------------------------------------------------
    op.create_table(
        "msa_measurement",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("operator_id", sa.Integer(), nullable=False),
        sa.Column("part_id", sa.Integer(), nullable=False),
        sa.Column("replicate_num", sa.Integer(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("attribute_value", sa.String(50), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["study_id"], ["msa_study.id"],
            name="fk_msa_measurement_study_id_msa_study", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["operator_id"], ["msa_operator.id"],
            name="fk_msa_measurement_operator_id_msa_operator", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["part_id"], ["msa_part.id"],
            name="fk_msa_measurement_part_id_msa_part", ondelete="CASCADE",
        ),
    )
    op.create_index("ix_msa_measurement_study", "msa_measurement", ["study_id"])

    # -----------------------------------------------------------------------
    # 5. FAI Report table
    # -----------------------------------------------------------------------
    op.create_table(
        "fai_report",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        # Form 1: Part Number Accountability
        sa.Column("part_number", sa.String(100), nullable=False),
        sa.Column("part_name", sa.String(255), nullable=True),
        sa.Column("revision", sa.String(50), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("lot_number", sa.String(100), nullable=True),
        sa.Column("drawing_number", sa.String(100), nullable=True),
        sa.Column("organization_name", sa.String(255), nullable=True),
        sa.Column("supplier", sa.String(255), nullable=True),
        sa.Column("purchase_order", sa.String(100), nullable=True),
        sa.Column("reason_for_inspection", sa.String(50), nullable=True),
        # Form 2: Product Accountability
        sa.Column("material_supplier", sa.String(255), nullable=True),
        sa.Column("material_spec", sa.String(255), nullable=True),
        sa.Column("special_processes", sa.Text(), nullable=True),
        sa.Column("functional_test_results", sa.Text(), nullable=True),
        # Status tracking
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("submitted_by", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"], ["plant.id"],
            name="fk_fai_report_plant_id_plant", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user.id"],
            name="fk_fai_report_created_by_user",
        ),
        sa.ForeignKeyConstraint(
            ["submitted_by"], ["user.id"],
            name="fk_fai_report_submitted_by_user",
        ),
        sa.ForeignKeyConstraint(
            ["approved_by"], ["user.id"],
            name="fk_fai_report_approved_by_user",
        ),
    )
    op.create_index("ix_fai_report_plant", "fai_report", ["plant_id"])

    # -----------------------------------------------------------------------
    # 6. FAI Item table
    # -----------------------------------------------------------------------
    op.create_table(
        "fai_item",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("report_id", sa.Integer(), nullable=False),
        sa.Column("balloon_number", sa.Integer(), nullable=False),
        sa.Column("characteristic_name", sa.String(255), nullable=False),
        sa.Column("nominal", sa.Float(), nullable=True),
        sa.Column("usl", sa.Float(), nullable=True),
        sa.Column("lsl", sa.Float(), nullable=True),
        sa.Column("actual_value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=False, server_default="mm"),
        sa.Column("tools_used", sa.String(255), nullable=True),
        sa.Column("designed_char", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("result", sa.String(20), nullable=False, server_default="pass"),
        sa.Column("deviation_reason", sa.Text(), nullable=True),
        sa.Column("characteristic_id", sa.Integer(), nullable=True),
        sa.Column("sequence_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["report_id"], ["fai_report.id"],
            name="fk_fai_item_report_id_fai_report", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"], ["characteristic.id"],
            name="fk_fai_item_characteristic_id_characteristic", ondelete="SET NULL",
        ),
    )
    op.create_index("ix_fai_item_report", "fai_item", ["report_id"])

    # -----------------------------------------------------------------------
    # 7. Add short_run_mode column to characteristic
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.add_column(
            sa.Column("short_run_mode", sa.String(20), nullable=True)
        )


def downgrade() -> None:
    # -----------------------------------------------------------------------
    # 1. Remove short_run_mode from characteristic
    # -----------------------------------------------------------------------
    with op.batch_alter_table("characteristic") as batch_op:
        batch_op.drop_column("short_run_mode")

    # -----------------------------------------------------------------------
    # 2. Drop FAI tables
    # -----------------------------------------------------------------------
    op.drop_index("ix_fai_item_report", table_name="fai_item")
    op.drop_table("fai_item")
    op.drop_index("ix_fai_report_plant", table_name="fai_report")
    op.drop_table("fai_report")

    # -----------------------------------------------------------------------
    # 3. Drop MSA tables (reverse order of creation)
    # -----------------------------------------------------------------------
    op.drop_index("ix_msa_measurement_study", table_name="msa_measurement")
    op.drop_table("msa_measurement")
    op.drop_table("msa_part")
    op.drop_table("msa_operator")
    op.drop_table("msa_study")
