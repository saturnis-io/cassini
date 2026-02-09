"""User and UserPlantRole models for authentication and authorization.

Users represent authenticated individuals. Each user can have different roles
at different plants via the UserPlantRole join table.
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING, Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from openspc.db.models.hierarchy import Base

if TYPE_CHECKING:
    from openspc.db.models.plant import Plant


class UserRole(str, enum.Enum):
    """User role levels matching frontend roles.ts hierarchy."""

    operator = "operator"
    supervisor = "supervisor"
    engineer = "engineer"
    admin = "admin"


class User(Base):
    """User model for authentication.

    Stores user credentials and profile information.
    Roles are assigned per-plant via UserPlantRole.
    """

    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa.False_(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant_roles: Mapped[list["UserPlantRole"]] = relationship(
        "UserPlantRole", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username='{self.username}', active={self.is_active})>"


class UserPlantRole(Base):
    """Many-to-many relationship between Users and Plants with per-plant roles.

    A user can have a different role at each plant they are assigned to.
    """

    __tablename__ = "user_plant_role"
    __table_args__ = (
        UniqueConstraint("user_id", "plant_id", name="uq_user_plant"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False
    )
    plant_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), nullable=False, default=UserRole.operator
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="plant_roles")
    plant: Mapped["Plant"] = relationship("Plant")

    def __repr__(self) -> str:
        return (
            f"<UserPlantRole(user_id={self.user_id}, plant_id={self.plant_id}, "
            f"role='{self.role.value}')>"
        )
