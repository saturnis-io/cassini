"""User repository for database operations."""

from typing import Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.db.models.user import User, UserPlantRole, UserRole


class UserRepository:
    """Repository for User CRUD operations and plant role management."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: int) -> Optional[User]:
        """Get a user by ID with plant roles eagerly loaded."""
        stmt = (
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> Optional[User]:
        """Get a user by username (for login lookup)."""
        stmt = (
            select(User)
            .where(User.username == username)
            .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        active_only: bool = False,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
    ) -> Sequence[User]:
        """Get all users with optional filters."""
        stmt = (
            select(User)
            .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
        )
        if active_only:
            stmt = stmt.where(User.is_active == True)  # noqa: E712
        if search:
            search_term = f"%{search}%"
            stmt = stmt.where(
                (User.username.ilike(search_term)) | (User.email.ilike(search_term))
            )
        stmt = stmt.order_by(User.username).offset(offset).limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def create(
        self,
        username: str,
        hashed_password: str,
        email: Optional[str] = None,
    ) -> User:
        """Create a new user."""
        user = User(
            username=username,
            email=email,
            hashed_password=hashed_password,
            is_active=True,
        )
        self.session.add(user)
        await self.session.flush()
        await self.session.refresh(user)
        # Reload with relationships
        return await self.get_by_id(user.id)  # type: ignore[return-value]

    async def update(self, user_id: int, **kwargs) -> Optional[User]:
        """Update a user's fields."""
        user = await self.get_by_id(user_id)
        if user is None:
            return None

        for key, value in kwargs.items():
            if hasattr(user, key) and value is not None:
                setattr(user, key, value)

        await self.session.flush()
        await self.session.refresh(user)
        return await self.get_by_id(user.id)

    async def deactivate(self, user_id: int) -> Optional[User]:
        """Soft delete a user by setting is_active=False."""
        user = await self.get_by_id(user_id)
        if user is None:
            return None

        user.is_active = False
        await self.session.flush()
        await self.session.refresh(user)
        return user

    async def hard_delete(self, user_id: int) -> bool:
        """Permanently delete a user and all their role assignments.

        Only deletes inactive users. Returns False if user not found.
        Raises ValueError if user is still active.
        """
        user = await self.get_by_id(user_id)
        if user is None:
            return False
        if user.is_active:
            raise ValueError("Cannot delete an active user")

        await self.session.delete(user)
        await self.session.flush()
        return True

    async def count(self) -> int:
        """Count total users."""
        stmt = select(func.count(User.id))
        result = await self.session.execute(stmt)
        return result.scalar_one()

    async def assign_plant_role(
        self,
        user_id: int,
        plant_id: int,
        role: UserRole,
    ) -> UserPlantRole:
        """Assign or update a user's role at a plant."""
        # Check if assignment exists
        stmt = select(UserPlantRole).where(
            UserPlantRole.user_id == user_id,
            UserPlantRole.plant_id == plant_id,
        )
        result = await self.session.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.role = role
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        else:
            assignment = UserPlantRole(
                user_id=user_id,
                plant_id=plant_id,
                role=role,
            )
            self.session.add(assignment)
            await self.session.flush()
            await self.session.refresh(assignment)
            return assignment

    async def remove_plant_role(self, user_id: int, plant_id: int) -> bool:
        """Remove a user's role assignment for a plant."""
        stmt = select(UserPlantRole).where(
            UserPlantRole.user_id == user_id,
            UserPlantRole.plant_id == plant_id,
        )
        result = await self.session.execute(stmt)
        assignment = result.scalar_one_or_none()

        if assignment is None:
            return False

        await self.session.delete(assignment)
        await self.session.flush()
        return True

    async def get_user_role_for_plant(
        self, user_id: int, plant_id: int
    ) -> Optional[UserRole]:
        """Get a user's role for a specific plant."""
        stmt = select(UserPlantRole.role).where(
            UserPlantRole.user_id == user_id,
            UserPlantRole.plant_id == plant_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_users_for_plant(self, plant_id: int) -> Sequence[User]:
        """Get all users assigned to a specific plant."""
        stmt = (
            select(User)
            .join(UserPlantRole)
            .where(UserPlantRole.plant_id == plant_id)
            .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
            .order_by(User.username)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()
