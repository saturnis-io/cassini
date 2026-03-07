"""Material model for individual materials/products."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.material_class import MaterialClass
    from cassini.db.models.plant import Plant


class Material(Base):
    """Individual material/product entity.

    Belongs to an optional MaterialClass for hierarchical grouping.
    Referenced by samples and material limit overrides.
    """

    __tablename__ = "material"
    __table_args__ = (
        UniqueConstraint("plant_id", "code", name="uq_material_plant_code"),
        Index("ix_material_plant_class", "plant_id", "class_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    plant_id: Mapped[int] = mapped_column(
        ForeignKey("plant.id", ondelete="CASCADE"), nullable=False
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    properties: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    plant: Mapped["Plant"] = relationship("Plant")
    material_class: Mapped[Optional["MaterialClass"]] = relationship(
        "MaterialClass", back_populates="materials"
    )

    def __repr__(self) -> str:
        return f"<Material(id={self.id}, code='{self.code}')>"
