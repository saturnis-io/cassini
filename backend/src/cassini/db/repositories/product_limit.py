"""Repository for ProductLimit model."""

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.product_limit import ProductLimit


class ProductLimitRepository:
    """Repository for per-product-code control limit overrides."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_by_char_and_code(
        self, char_id: int, product_code: str
    ) -> ProductLimit | None:
        """Look up a single product limit by characteristic and code."""
        stmt = select(ProductLimit).where(
            ProductLimit.characteristic_id == char_id,
            ProductLimit.product_code == product_code.strip().upper(),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_characteristic(self, char_id: int) -> list[ProductLimit]:
        """List all product limits for a characteristic."""
        stmt = (
            select(ProductLimit)
            .where(ProductLimit.characteristic_id == char_id)
            .order_by(ProductLimit.product_code)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def upsert(
        self,
        char_id: int,
        product_code: str,
        data: dict,
    ) -> ProductLimit:
        """Create or update a product limit for a characteristic + product code.

        Args:
            char_id: Characteristic ID.
            product_code: Product code (will be normalized to uppercase).
            data: Dict of limit fields to set.

        Returns:
            The created or updated ProductLimit.
        """
        normalized_code = product_code.strip().upper()
        existing = await self.get_by_char_and_code(char_id, normalized_code)

        if existing:
            for key, value in data.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing

        limit = ProductLimit(
            characteristic_id=char_id,
            product_code=normalized_code,
            **data,
        )
        self.session.add(limit)
        try:
            await self.session.flush()
        except IntegrityError:
            # Race condition: another request created the same row.
            # Roll back the failed INSERT and retry as UPDATE.
            await self.session.rollback()
            existing = await self.get_by_char_and_code(char_id, normalized_code)
            if existing:
                for key, value in data.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
                await self.session.flush()
                await self.session.refresh(existing)
                return existing
            raise  # Should not happen — re-raise if still missing
        await self.session.refresh(limit)
        return limit

    async def delete_by_char_and_code(self, char_id: int, product_code: str) -> bool:
        """Delete a product limit by characteristic and code.

        Returns:
            True if a row was deleted, False if not found.
        """
        normalized_code = product_code.strip().upper()
        stmt = delete(ProductLimit).where(
            ProductLimit.characteristic_id == char_id,
            ProductLimit.product_code == normalized_code,
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount > 0
