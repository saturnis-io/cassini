"""Base repository with generic CRUD operations."""

from typing import Any, Generic, Sequence, TypeVar

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import QueryableAttribute

from openspc.db.models.hierarchy import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    """Generic base repository providing standard CRUD operations.

    This repository implements common database operations that can be
    inherited by all model-specific repositories.

    Type Parameters:
        ModelT: The SQLAlchemy model type this repository manages
    """

    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        """Initialize the repository.

        Args:
            session: SQLAlchemy async session for database operations
            model: The SQLAlchemy model class this repository manages
        """
        self.session = session
        self.model = model

    async def get_by_id(
        self, id: int, options: Sequence[Any] | None = None
    ) -> ModelT | None:
        """Retrieve a single record by primary key.

        Args:
            id: Primary key of the record to retrieve
            options: Optional loader options (e.g. selectinload) for eager loading

        Returns:
            The model instance if found, None otherwise
        """
        if options:
            stmt = select(self.model).where(self.model.id == id).options(*options)
            result = await self.session.execute(stmt)
            return result.scalar_one_or_none()
        return await self.session.get(self.model, id)

    async def get_all(self, offset: int = 0, limit: int = 100) -> list[ModelT]:
        """Retrieve all records with pagination.

        Args:
            offset: Number of records to skip (default: 0)
            limit: Maximum number of records to return (default: 100)

        Returns:
            List of model instances
        """
        stmt = select(self.model).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs: Any) -> ModelT:
        """Create a new record.

        Args:
            **kwargs: Field values for the new record

        Returns:
            The created model instance

        Raises:
            SQLAlchemyError: If database constraints are violated
        """
        instance = self.model(**kwargs)
        self.session.add(instance)
        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def update(self, id: int, **kwargs: Any) -> ModelT | None:
        """Update an existing record.

        Args:
            id: Primary key of the record to update
            **kwargs: Field values to update

        Returns:
            The updated model instance if found, None otherwise
        """
        instance = await self.get_by_id(id)
        if instance is None:
            return None

        for key, value in kwargs.items():
            if hasattr(instance, key):
                setattr(instance, key, value)

        await self.session.flush()
        await self.session.refresh(instance)
        return instance

    async def delete(self, id: int) -> bool:
        """Delete a record by primary key.

        Args:
            id: Primary key of the record to delete

        Returns:
            True if the record was deleted, False if not found
        """
        instance = await self.get_by_id(id)
        if instance is None:
            return False

        await self.session.delete(instance)
        await self.session.flush()
        return True

    async def count(self) -> int:
        """Count total number of records.

        Returns:
            Total number of records in the table
        """
        stmt = select(func.count()).select_from(self.model)
        result = await self.session.execute(stmt)
        return result.scalar_one()
