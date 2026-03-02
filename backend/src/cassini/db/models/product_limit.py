"""ProductLimit model for per-product-code control limit overrides."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cassini.db.models.hierarchy import Base

if TYPE_CHECKING:
    from cassini.db.models.characteristic import Characteristic


class ProductLimit(Base):
    """Per-product-code control limit overrides.

    Allows different products running on the same characteristic
    to have independent control limits, spec limits, and process parameters.
    Non-null fields override the characteristic defaults; null fields
    fall back to the characteristic's values (inheritance pattern).
    """

    __tablename__ = "product_limit"
    __table_args__ = (
        UniqueConstraint("characteristic_id", "product_code", name="uq_product_limit_char_code"),
        Index("ix_product_limit_char", "characteristic_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    characteristic_id: Mapped[int] = mapped_column(
        ForeignKey("characteristic.id", ondelete="CASCADE"), nullable=False
    )
    product_code: Mapped[str] = mapped_column(String(100), nullable=False)

    # Control limits (override characteristic defaults when non-null)
    ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    target_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Spec limits (override characteristic defaults when non-null)
    usl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lsl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Relationships
    characteristic: Mapped["Characteristic"] = relationship("Characteristic")

    def __repr__(self) -> str:
        return (
            f"<ProductLimit(id={self.id}, char_id={self.characteristic_id}, "
            f"product_code='{self.product_code}')>"
        )
