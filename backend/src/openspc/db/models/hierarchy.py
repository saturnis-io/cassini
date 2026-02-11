"""Hierarchy model for ISA-95 equipment hierarchy."""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from openspc.db.models.characteristic import Characteristic
    from openspc.db.models.plant import Plant


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""

    pass


class HierarchyType(str, Enum):
    """UNS-compatible hierarchy types.

    Generic types that work with Unified Namespace structures.
    Users can use any string type; these are common defaults.
    """

    FOLDER = "Folder"       # Organizational grouping (no physical asset)
    ENTERPRISE = "Enterprise"
    SITE = "Site"
    AREA = "Area"
    LINE = "Line"
    CELL = "Cell"
    EQUIPMENT = "Equipment"
    TAG = "Tag"


class Hierarchy(Base):
    """ISA-95 Equipment Hierarchy model.

    Represents the physical or logical structure of a manufacturing
    facility using ISA-95 standard hierarchy levels.
    """

    __tablename__ = "hierarchy"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("hierarchy.id", ondelete="CASCADE"), nullable=True, index=True)
    plant_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("plant.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)

    # Self-referential relationship for parent-child hierarchy
    parent: Mapped[Optional["Hierarchy"]] = relationship(
        "Hierarchy", remote_side=[id], back_populates="children"
    )
    children: Mapped[list["Hierarchy"]] = relationship(
        "Hierarchy", back_populates="parent", cascade="all, delete-orphan"
    )

    # Plant relationship
    plant: Mapped[Optional["Plant"]] = relationship("Plant", back_populates="hierarchies")

    # Relationship to characteristics
    characteristics: Mapped[list["Characteristic"]] = relationship(
        "Characteristic", back_populates="hierarchy", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Hierarchy(id={self.id}, name='{self.name}', type='{self.type}')>"
