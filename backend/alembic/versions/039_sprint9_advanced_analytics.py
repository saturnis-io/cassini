"""Sprint 9: Advanced analytics tables.

Adds 13 tables for advanced analytics:
- Multivariate SPC: multivariate_group, multivariate_group_member,
  multivariate_sample, correlation_result
- Predictive analytics: prediction_config, prediction_model, forecast
- AI analysis: ai_provider_config, ai_insight
- Design of Experiments: doe_study, doe_factor, doe_run, doe_analysis

Revision ID: 039
Revises: 038
Create Date: 2026-02-24
"""
from alembic import op
import sqlalchemy as sa

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. multivariate_group — plant-scoped multivariate chart groups
    # ------------------------------------------------------------------
    op.create_table(
        "multivariate_group",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "chart_type",
            sa.String(20),
            nullable=False,
            server_default="t_squared",
        ),
        sa.Column(
            "lambda_param",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.1"),
        ),
        sa.Column(
            "alpha",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0.0027"),
        ),
        sa.Column(
            "phase",
            sa.String(10),
            nullable=False,
            server_default="phase_ii",
        ),
        sa.Column("reference_mean", sa.Text(), nullable=True),
        sa.Column("reference_covariance", sa.Text(), nullable=True),
        sa.Column(
            "min_samples",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("100"),
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plant.id"],
            name="fk_multivariate_group_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "plant_id", "name", name="uq_multivariate_group_plant_name"
        ),
    )
    op.create_index(
        "ix_multivariate_group_plant_id", "multivariate_group", ["plant_id"]
    )

    # ------------------------------------------------------------------
    # 2. multivariate_group_member — characteristics in a group
    # ------------------------------------------------------------------
    op.create_table(
        "multivariate_group_member",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["multivariate_group.id"],
            name="fk_mv_group_member_group_id_multivariate_group",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            name="fk_mv_group_member_characteristic_id_characteristic",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "group_id",
            "characteristic_id",
            name="uq_mv_group_member_group_char",
        ),
    )

    # ------------------------------------------------------------------
    # 3. multivariate_sample — T-squared chart data points
    # ------------------------------------------------------------------
    op.create_table(
        "multivariate_sample",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("t_squared", sa.Float(), nullable=False),
        sa.Column("ucl", sa.Float(), nullable=False),
        sa.Column("in_control", sa.Boolean(), nullable=False),
        sa.Column("decomposition", sa.Text(), nullable=True),
        sa.Column("raw_values", sa.Text(), nullable=True),
        sa.Column(
            "sample_timestamp",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["multivariate_group.id"],
            name="fk_multivariate_sample_group_id_multivariate_group",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_multivariate_sample_group_ts",
        "multivariate_sample",
        ["group_id", "sample_timestamp"],
    )

    # ------------------------------------------------------------------
    # 4. correlation_result — pairwise correlation matrices
    # ------------------------------------------------------------------
    op.create_table(
        "correlation_result",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("characteristic_ids", sa.Text(), nullable=False),
        sa.Column(
            "method",
            sa.String(20),
            nullable=False,
            server_default="pearson",
        ),
        sa.Column("matrix", sa.Text(), nullable=False),
        sa.Column("p_values", sa.Text(), nullable=False),
        sa.Column("sample_count", sa.Integer(), nullable=False),
        sa.Column("pca_eigenvalues", sa.Text(), nullable=True),
        sa.Column("pca_loadings", sa.Text(), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plant.id"],
            name="fk_correlation_result_plant_id_plant",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_correlation_result_plant_computed",
        "correlation_result",
        ["plant_id", "computed_at"],
    )

    # ------------------------------------------------------------------
    # 5. prediction_config — per-characteristic prediction settings
    # ------------------------------------------------------------------
    op.create_table(
        "prediction_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "model_type",
            sa.String(30),
            nullable=False,
            server_default="auto",
        ),
        sa.Column(
            "forecast_horizon",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("20"),
        ),
        sa.Column(
            "refit_interval",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("50"),
        ),
        sa.Column(
            "confidence_levels",
            sa.Text(),
            nullable=False,
            server_default="[0.8, 0.95]",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            name="fk_prediction_config_characteristic_id_characteristic",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "characteristic_id",
            name="uq_prediction_config_characteristic_id",
        ),
    )

    # ------------------------------------------------------------------
    # 6. prediction_model — fitted model snapshots
    # ------------------------------------------------------------------
    op.create_table(
        "prediction_model",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column("model_type", sa.String(30), nullable=False),
        sa.Column("model_params", sa.Text(), nullable=True),
        sa.Column("aic", sa.Float(), nullable=True),
        sa.Column("training_samples", sa.Integer(), nullable=True),
        sa.Column(
            "fitted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "is_current",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            name="fk_prediction_model_characteristic_id_characteristic",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_prediction_model_char_current",
        "prediction_model",
        ["characteristic_id", "is_current"],
    )

    # ------------------------------------------------------------------
    # 7. forecast — individual forecast data points
    # ------------------------------------------------------------------
    op.create_table(
        "forecast",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column("step", sa.Integer(), nullable=False),
        sa.Column("predicted_value", sa.Float(), nullable=False),
        sa.Column("lower_80", sa.Float(), nullable=True),
        sa.Column("upper_80", sa.Float(), nullable=True),
        sa.Column("lower_95", sa.Float(), nullable=True),
        sa.Column("upper_95", sa.Float(), nullable=True),
        sa.Column(
            "predicted_ooc",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["model_id"],
            ["prediction_model.id"],
            name="fk_forecast_model_id_prediction_model",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            name="fk_forecast_characteristic_id_characteristic",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_forecast_char_generated",
        "forecast",
        ["characteristic_id", "generated_at"],
    )

    # ------------------------------------------------------------------
    # 8. ai_provider_config — per-plant AI provider settings
    # ------------------------------------------------------------------
    op.create_table(
        "ai_provider_config",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column(
            "provider_type",
            sa.String(20),
            nullable=False,
            server_default="claude",
        ),
        sa.Column("api_key", sa.Text(), nullable=True),
        sa.Column(
            "model_name",
            sa.String(100),
            nullable=False,
            server_default="claude-sonnet-4-20250514",
        ),
        sa.Column(
            "max_tokens",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1024"),
        ),
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plant.id"],
            name="fk_ai_provider_config_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "plant_id", name="uq_ai_provider_config_plant_id"
        ),
    )

    # ------------------------------------------------------------------
    # 9. ai_insight — cached AI analysis results
    # ------------------------------------------------------------------
    op.create_table(
        "ai_insight",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("characteristic_id", sa.Integer(), nullable=False),
        sa.Column("provider_type", sa.String(20), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("context_hash", sa.String(64), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("patterns", sa.Text(), nullable=True),
        sa.Column("risks", sa.Text(), nullable=True),
        sa.Column("recommendations", sa.Text(), nullable=True),
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_id"],
            ["characteristic.id"],
            name="fk_ai_insight_characteristic_id_characteristic",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_ai_insight_char_generated",
        "ai_insight",
        ["characteristic_id", "generated_at"],
    )

    # ------------------------------------------------------------------
    # 10. doe_study — Design of Experiments study
    # ------------------------------------------------------------------
    op.create_table(
        "doe_study",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("design_type", sa.String(30), nullable=False),
        sa.Column("resolution", sa.Integer(), nullable=True),
        sa.Column(
            "status",
            sa.String(20),
            nullable=False,
            server_default="design",
        ),
        sa.Column(
            "response_name",
            sa.String(255),
            nullable=False,
            server_default="Response",
        ),
        sa.Column("response_unit", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["plant_id"],
            ["plant.id"],
            name="fk_doe_study_plant_id_plant",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["user.id"],
            name="fk_doe_study_created_by_user",
            ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_doe_study_plant_status",
        "doe_study",
        ["plant_id", "status"],
    )

    # ------------------------------------------------------------------
    # 11. doe_factor — factors in a DOE study
    # ------------------------------------------------------------------
    op.create_table(
        "doe_factor",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("low_level", sa.Float(), nullable=False),
        sa.Column("high_level", sa.Float(), nullable=False),
        sa.Column("center_point", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(50), nullable=True),
        sa.Column(
            "display_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.ForeignKeyConstraint(
            ["study_id"],
            ["doe_study.id"],
            name="fk_doe_factor_study_id_doe_study",
            ondelete="CASCADE",
        ),
    )

    # ------------------------------------------------------------------
    # 12. doe_run — experimental runs
    # ------------------------------------------------------------------
    op.create_table(
        "doe_run",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("run_order", sa.Integer(), nullable=False),
        sa.Column("standard_order", sa.Integer(), nullable=False),
        sa.Column("factor_values", sa.Text(), nullable=False),
        sa.Column("factor_actuals", sa.Text(), nullable=False),
        sa.Column("response_value", sa.Float(), nullable=True),
        sa.Column(
            "is_center_point",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "replicate",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["study_id"],
            ["doe_study.id"],
            name="fk_doe_run_study_id_doe_study",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_doe_run_study_order",
        "doe_run",
        ["study_id", "run_order"],
    )

    # ------------------------------------------------------------------
    # 13. doe_analysis — ANOVA and regression results
    # ------------------------------------------------------------------
    op.create_table(
        "doe_analysis",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("study_id", sa.Integer(), nullable=False),
        sa.Column("anova_table", sa.Text(), nullable=False),
        sa.Column("effects", sa.Text(), nullable=False),
        sa.Column("interactions", sa.Text(), nullable=True),
        sa.Column("r_squared", sa.Float(), nullable=True),
        sa.Column("adj_r_squared", sa.Float(), nullable=True),
        sa.Column("regression_model", sa.Text(), nullable=True),
        sa.Column("optimal_settings", sa.Text(), nullable=True),
        sa.Column(
            "computed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["study_id"],
            ["doe_study.id"],
            name="fk_doe_analysis_study_id_doe_study",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    # Drop in reverse order of creation
    op.drop_table("doe_analysis")

    op.drop_index("ix_doe_run_study_order", table_name="doe_run")
    op.drop_table("doe_run")

    op.drop_table("doe_factor")

    op.drop_index("ix_doe_study_plant_status", table_name="doe_study")
    op.drop_table("doe_study")

    op.drop_index("ix_ai_insight_char_generated", table_name="ai_insight")
    op.drop_table("ai_insight")

    op.drop_table("ai_provider_config")

    op.drop_index("ix_forecast_char_generated", table_name="forecast")
    op.drop_table("forecast")

    op.drop_index(
        "ix_prediction_model_char_current", table_name="prediction_model"
    )
    op.drop_table("prediction_model")

    op.drop_table("prediction_config")

    op.drop_index(
        "ix_correlation_result_plant_computed", table_name="correlation_result"
    )
    op.drop_table("correlation_result")

    op.drop_index(
        "ix_multivariate_sample_group_ts", table_name="multivariate_sample"
    )
    op.drop_table("multivariate_sample")

    op.drop_table("multivariate_group_member")

    op.drop_index(
        "ix_multivariate_group_plant_id", table_name="multivariate_group"
    )
    op.drop_table("multivariate_group")
