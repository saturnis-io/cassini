"""MaterialLimitOverride model for per-characteristic limit overrides."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.material import Material
    from cassini.db.models.material_class import MaterialClass


class MaterialLimitOverride(Base):
    """Per-characteristic limit overrides for a material or material class.

    Exactly one of material_id or class_id must be set (polymorphic key).
    Non-null limit fields override the characteristic defaults; null fields
    inherit from the next level up in the cascade chain.
    """

    __tablename__ = "material_limit_override"
    __table_args__ = (
        CheckConstraint(
            "(material_id IS NOT NULL AND class_id IS NULL) OR "
            "(material_id IS NULL AND class_id IS NOT NULL)",
            name="ck_material_limit_override_exactly_one",
        ),
        UniqueConstraint("characteristic_id", "material_id", name="uq_mlo_char_material"),
        UniqueConstraint("characteristic_id", "class_id", name="uq_mlo_char_class"),
        Index("ix_material_limit_override_char", "characteristic_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=True
    )
    class_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("material_class.id", ondelete="CASCADE"), nullable=True
    )

    ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    characteristic: Mapped["Characteristic"] = relationship("Characteristic")
    material: Mapped[Optional["Material"]] = relationship("Material")
    material_class: Mapped[Optional["MaterialClass"]] = relationship("MaterialClass")

    @property
    def is_material_override(self) -> bool:
        return self.material_id is not None

    @property
    def is_class_override(self) -> bool:
        return self.class_id is not None

    def __repr__(self) -> str:
        target = f"material_id={self.material_id}" if self.is_material_override else f"class_id={self.class_id}"
        return f"<MaterialLimitOverride(id={self.id}, char_id={self.characteristic_id}, {target})>"
