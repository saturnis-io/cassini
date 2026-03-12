"""Add anomaly detection tables.

Revision ID: 030
Revises: 029
Create Date: 2026-02-14

Creates tables for AI/ML anomaly detection:
- anomaly_detector_config: Per-characteristic detector configuration
- anomaly_event: Detected anomaly records
- anomaly_model_state: Serialized ML model persistence
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- anomaly_detector_config ---
    op.create_table(
        "anomaly_detector_config",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "char_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        # Global toggle
        sa.Column(
            "is_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        # PELT configuration
        sa.Column(
            "pelt_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "pelt_model",
            sa.String(20),
            server_default="l2",
            nullable=False,
        ),
        sa.Column(
            "pelt_penalty",
            sa.String(20),
            server_default="auto",
            nullable=False,
        ),
        sa.Column(
            "pelt_min_segment",
            sa.Integer(),
            server_default=sa.text("5"),
            nullable=False,
        ),
        # Isolation Forest configuration
        sa.Column(
            "iforest_enabled",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "iforest_contamination",
            sa.Float(),
            server_default=sa.text("0.05"),
            nullable=False,
        ),
        sa.Column(
            "iforest_n_estimators",
            sa.Integer(),
            server_default=sa.text("100"),
            nullable=False,
        ),
        sa.Column(
            "iforest_min_training",
            sa.Integer(),
            server_default=sa.text("50"),
            nullable=False,
        ),
        sa.Column(
            "iforest_retrain_interval",
            sa.Integer(),
            server_default=sa.text("100"),
            nullable=False,
        ),
        # K-S distribution shift configuration
        sa.Column(
            "ks_enabled",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "ks_reference_window",
            sa.Integer(),
            server_default=sa.text("200"),
            nullable=False,
        ),
        sa.Column(
            "ks_test_window",
            sa.Integer(),
            server_default=sa.text("50"),
            nullable=False,
        ),
        sa.Column(
            "ks_alpha",
            sa.Float(),
            server_default=sa.text("0.05"),
            nullable=False,
        ),
        # Notification integration
        sa.Column(
            "notify_on_changepoint",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "notify_on_anomaly_score",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "notify_on_distribution_shift",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "anomaly_score_threshold",
            sa.Float(),
            server_default=sa.text("-0.5"),
            nullable=False,
        ),
        # Timestamps
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
    )

    # --- anomaly_event ---
    op.create_table(
        "anomaly_event",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "char_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Detection metadata
        sa.Column("detector_type", sa.String(30), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        # Detection details (JSON)
        sa.Column("details", sa.JSON(), nullable=False),
        # Linkage to SPC data
        sa.Column(
            "sample_id",
            sa.Integer(),
            sa.ForeignKey("sample.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "window_start_id",
            sa.Integer(),
            sa.ForeignKey("sample.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "window_end_id",
            sa.Integer(),
            sa.ForeignKey("sample.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Human review
        sa.Column(
            "is_acknowledged",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("acknowledged_by", sa.String(100), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_dismissed",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("dismissed_by", sa.String(100), nullable=True),
        sa.Column("dismissed_reason", sa.String(500), nullable=True),
        # Summary
        sa.Column("summary", sa.String(500), nullable=True),
        # Timestamp
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Indexes on anomaly_event
    op.create_index(
        "ix_anomaly_event_char_detected",
        "anomaly_event",
        ["char_id", "detected_at"],
    )
    op.create_index(
        "ix_anomaly_event_detector_type",
        "anomaly_event",
        ["detector_type"],
    )
    op.create_index(
        "ix_anomaly_event_severity",
        "anomaly_event",
        ["severity"],
    )

    # --- anomaly_model_state ---
    op.create_table(
        "anomaly_model_state",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "char_id",
            sa.Integer(),
            sa.ForeignKey("characteristic.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("detector_type", sa.String(30), nullable=False),
        sa.Column("model_blob", sa.Text(), nullable=False),
        sa.Column("training_samples", sa.Integer(), nullable=False),
        sa.Column(
            "training_started_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "training_completed_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column("feature_names", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("char_id", "detector_type", name="uq_anomaly_model_char_detector"),
    )


def downgrade() -> None:
    op.drop_table("anomaly_model_state")
    op.drop_index("ix_anomaly_event_severity", table_name="anomaly_event")
    op.drop_index("ix_anomaly_event_detector_type", table_name="anomaly_event")
    op.drop_index("ix_anomaly_event_char_detected", table_name="anomaly_event")
    op.drop_table("anomaly_event")
    op.drop_table("anomaly_detector_config")
