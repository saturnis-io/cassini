"""Collection Plan models for guided measurement workflows (check sheets).

A CollectionPlan groups a sequence of characteristics to be measured in order.
CollectionPlanItem links a plan to a characteristic with sequence and instructions.
CollectionPlanExecution records the result of executing a plan.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.plant import Plant
    from cassini.db.models.user import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CollectionPlan(Base):
    """A collection plan (check sheet) defining a sequence of measurements.

    Plans are scoped to a single plant. All items must reference
    characteristics belonging to the same plant.
    """

    __tablename__ = "collection_plan"
    __table_args__ = (
        sa.Index("ix_collection_plan_plant_active", "plant_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )
    created_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    items: Mapped[list["CollectionPlanItem"]] = relationship(
        "CollectionPlanItem",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="CollectionPlanItem.sequence_order",
    )
    executions: Mapped[list["CollectionPlanExecution"]] = relationship(
        "CollectionPlanExecution",
        back_populates="plan",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return (
            f"<CollectionPlan(id={self.id}, name='{self.name}', "
            f"plant_id={self.plant_id}, is_active={self.is_active})>"
        )


class CollectionPlanItem(Base):
    """An item in a collection plan linking to a characteristic.

    The characteristic FK uses ON DELETE RESTRICT to prevent deleting
    a characteristic that is part of an active plan.
    """

    __tablename__ = "collection_plan_item"
    __table_args__ = (
        sa.Index("ix_collection_plan_item_plan_seq", "plan_id", "sequence_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("collection_plan.id", ondelete="CASCADE"), nullable=False
    )
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="RESTRICT"), nullable=False
    )
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    instructions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=sa.text("1")
    )

    # Relationships
    plan: Mapped["CollectionPlan"] = relationship(
        "CollectionPlan", back_populates="items"
    )
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<CollectionPlanItem(id={self.id}, plan_id={self.plan_id}, "
            f"char_id={self.characteristic_id}, seq={self.sequence_order})>"
        )


class CollectionPlanExecution(Base):
    """Record of a collection plan execution.

    Tracks who executed the plan, when, and the outcome (items completed/skipped).
    """

    __tablename__ = "collection_plan_execution"
    __table_args__ = (
        sa.Index("ix_collection_plan_execution_plan_status", "plan_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("collection_plan.id", ondelete="CASCADE"), nullable=False
    )
    executed_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utc_now,
        server_default=sa.func.now(),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="in_progress", server_default="in_progress"
    )
    items_completed: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )
    items_skipped: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=sa.text("0")
    )

    # Relationships
    plan: Mapped["CollectionPlan"] = relationship(
        "CollectionPlan", back_populates="executions"
    )

    def __repr__(self) -> str:
        return (
            f"<CollectionPlanExecution(id={self.id}, plan_id={self.plan_id}, "
            f"status='{self.status}')>"
        )
