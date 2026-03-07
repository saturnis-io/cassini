"""MaterialClass model for hierarchical material grouping."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.material import Material
    from cassini.db.models.plant import Plant


class MaterialClass(Base):
    """Hierarchical material class with materialized path.

    Supports arbitrary nesting (e.g., Raw Materials > Metals > Aluminum > 6000 Series).
    Path stores ancestor chain from root: "/1/5/12/" for efficient ancestor lookups.
    """

    __tablename__ = "material_class"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_material_class_plant_code"),
        Index("ix_material_class_plant_parent", "plant_id", "parent_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False, default="/")
    depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    parent: Mapped[Optional["MaterialClass"]] = relationship(
        "MaterialClass", remote_side="MaterialClass.id", back_populates="children"
    )
    children: Mapped[list["MaterialClass"]] = relationship(
        "MaterialClass", back_populates="parent", cascade="all, delete-orphan"
    )
    materials: Mapped[list["Material"]] = relationship(
        "Material", back_populates="material_class", cascade="all, delete-orphan"
    )

    def ancestor_ids(self) -> list[int]:
        """Parse path into ancestor IDs, deepest first (self included)."""
        parts = [int(p) for p in self.path.strip("/").split("/") if p]
        parts.reverse()
        return parts

    def __repr__(self) -> str:
        return f"<MaterialClass(id={self.id}, code='{self.code}', depth={self.depth})>"
