"""Electronic signature models for 21 CFR Part 11 compliance.

Provides immutable signature records, configurable meanings, multi-step
approval workflows, and per-plant password policies.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.plant import Plant
    from cassini.db.models.user import User


class ElectronicSignature(Base):
    """Immutable electronic signature record linked to a resource via content hash.

    Each signature captures the signer identity, timestamp, meaning, and a
    SHA-256 hash of the signed resource for tamper detection (11.70).
    """

    __tablename__ = "electronic_signature"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="RESTRICT"), nullable=True
    )
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    meaning_code: Mapped[str] = mapped_column(String(50), nullable=False)
    meaning_display: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    resource_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    signature_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    workflow_step_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("signature_workflow_step.id"), nullable=True
    )
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_valid: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    invalidated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invalidated_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    workflow_step: Mapped[Optional["SignatureWorkflowStep"]] = relationship(
        "SignatureWorkflowStep", foreign_keys=[workflow_step_id]
    )

    def __repr__(self) -> str:
        return (
            f"<ElectronicSignature(id={self.id}, user='{self.username}', "
            f"meaning='{self.meaning_code}', resource={self.resource_type}:{self.resource_id})>"
        )


class SignatureMeaning(Base):
    """Plant-scoped vocabulary of signature meanings (11.50).

    Each plant can configure its own set of signature meanings such as
    'approved', 'reviewed', 'verified', 'rejected', 'released'.
    """

    __tablename__ = "signature_meaning"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_signature_meaning_plant_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requires_comment: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.False_(), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", foreign_keys=[plant_id])

    def __repr__(self) -> str:
        return f"<SignatureMeaning(id={self.id}, code='{self.code}', plant_id={self.plant_id})>"


class SignatureWorkflow(Base):
    """Defines what actions require signatures with multi-level approval chains.

    Each workflow is scoped to a plant and a resource type (e.g., 'sample_approval',
    'limit_change'). Steps define the required signing order.
    """

    __tablename__ = "signature_workflow"
    __table_args__ = (
        UniqueConstraint(
            "plant_id", "resource_type", name="uq_signature_workflow_plant_resource"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    is_required: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.False_(), nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", foreign_keys=[plant_id])
    steps: Mapped[list["SignatureWorkflowStep"]] = relationship(
        "SignatureWorkflowStep",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="SignatureWorkflowStep.step_order",
    )
    instances: Mapped[list["SignatureWorkflowInstance"]] = relationship(
        "SignatureWorkflowInstance",
        back_populates="workflow",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<SignatureWorkflow(id={self.id}, name='{self.name}', "
            f"resource_type='{self.resource_type}')>"
        )


class SignatureWorkflowStep(Base):
    """Individual step within a signature workflow.

    Steps execute in order by step_order. Each step defines the minimum
    role required and which signature meaning to apply.
    """

    __tablename__ = "signature_workflow_step"
    __table_args__ = (
        UniqueConstraint("workflow_id", "step_order", name="uq_workflow_step_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("signature_workflow.id", ondelete="CASCADE"), nullable=False
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    min_role: Mapped[str] = mapped_column(String(20), nullable=False)
    meaning_code: Mapped[str] = mapped_column(String(50), nullable=False)
    is_required: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    allow_self_sign: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.False_(), nullable=False
    )
    timeout_hours: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    workflow: Mapped["SignatureWorkflow"] = relationship(
        "SignatureWorkflow", back_populates="steps"
    )
    signatures: Mapped[list["ElectronicSignature"]] = relationship(
        "ElectronicSignature",
        foreign_keys=[ElectronicSignature.workflow_step_id],
        overlaps="workflow_step",
    )

    def __repr__(self) -> str:
        return (
            f"<SignatureWorkflowStep(id={self.id}, order={self.step_order}, "
            f"name='{self.name}')>"
        )


class SignatureWorkflowInstance(Base):
    """Running instance of a workflow for a specific resource.

    Tracks the current state of a multi-step approval process.
    """

    __tablename__ = "signature_workflow_instance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("signature_workflow.id"), nullable=False
    )
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), server_default="pending", nullable=False
    )
    current_step: Mapped[int] = mapped_column(Integer, server_default="1", nullable=False)
    initiated_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    initiated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    workflow: Mapped["SignatureWorkflow"] = relationship(
        "SignatureWorkflow", back_populates="instances"
    )
    initiator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[initiated_by])

    def __repr__(self) -> str:
        return (
            f"<SignatureWorkflowInstance(id={self.id}, status='{self.status}', "
            f"resource={self.resource_type}:{self.resource_id})>"
        )


class PasswordPolicy(Base):
    """Per-plant password policy configuration for 11.300 compliance.

    Controls password expiry, lockout, complexity requirements, and
    signature re-authentication windows.
    """

    __tablename__ = "password_policy"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("plant.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    password_expiry_days: Mapped[int] = mapped_column(
        Integer, server_default="90", nullable=False
    )
    max_failed_attempts: Mapped[int] = mapped_column(
        Integer, server_default="5", nullable=False
    )
    lockout_duration_minutes: Mapped[int] = mapped_column(
        Integer, server_default="30", nullable=False
    )
    min_password_length: Mapped[int] = mapped_column(
        Integer, server_default="8", nullable=False
    )
    require_uppercase: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    require_lowercase: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    require_digit: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.True_(), nullable=False
    )
    require_special: Mapped[bool] = mapped_column(
        Boolean, server_default=sa.False_(), nullable=False
    )
    password_history_count: Mapped[int] = mapped_column(
        Integer, server_default="5", nullable=False
    )
    session_timeout_minutes: Mapped[int] = mapped_column(
        Integer, server_default="30", nullable=False
    )
    signature_timeout_minutes: Mapped[int] = mapped_column(
        Integer, server_default="5", nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant", foreign_keys=[plant_id])

    def __repr__(self) -> str:
        return f"<PasswordPolicy(id={self.id}, plant_id={self.plant_id})>"
