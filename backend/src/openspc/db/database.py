"""Database configuration and session management."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from openspc.db.models import Base


class DatabaseConfig:
    """Database configuration and session factory."""

    def __init__(
        self,
        database_url: str = "sqlite+aiosqlite:///./openspc.db",
        echo: bool = False,
    ) -> None:
        """Initialize database configuration.

        Args:
            database_url: SQLAlchemy database URL (async driver required)
            echo: Enable SQL query logging
        """
        self.database_url = database_url
        self.echo = echo
        self._engine: Optional[AsyncEngine] = None
        self._session_factory: Optional[async_sessionmaker[AsyncSession]] = None

    @property
    def engine(self) -> AsyncEngine:
        """Get or create async engine.

        Returns:
            AsyncEngine instance
        """
        if self._engine is None:
            self._engine = create_async_engine(
                self.database_url,
                echo=self.echo,
                poolclass=NullPool,  # SQLite doesn't support connection pooling well
            )

            # Configure SQLite for WAL mode and foreign keys
            if "sqlite" in self.database_url:

                @event.listens_for(self._engine.sync_engine, "connect")
                def set_sqlite_pragma(dbapi_conn, connection_record):
                    """Enable SQLite optimizations on connection."""
                    cursor = dbapi_conn.cursor()
                    cursor.execute("PRAGMA journal_mode=WAL")
                    cursor.execute("PRAGMA foreign_keys=ON")
                    cursor.execute("PRAGMA busy_timeout=5000")
                    cursor.close()

        return self._engine

    @property
    def session_factory(self) -> async_sessionmaker[AsyncSession]:
        """Get or create async session factory.

        Returns:
            async_sessionmaker instance
        """
        if self._session_factory is None:
            self._session_factory = async_sessionmaker(
                self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
        return self._session_factory

    async def create_tables(self) -> None:
        """Create all database tables.

        This should only be used for testing. In production,
        use Alembic migrations.
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def drop_tables(self) -> None:
        """Drop all database tables.

        Warning: This will delete all data!
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def dispose(self) -> None:
        """Dispose of the engine and close all connections."""
        if self._engine is not None:
            await self._engine.dispose()
            self._engine = None
            self._session_factory = None

    @asynccontextmanager
    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Async context manager for database sessions.

        Yields:
            AsyncSession instance

        Example:
            async with db_config.session() as session:
                result = await session.execute(select(Hierarchy))
                hierarchies = result.scalars().all()
        """
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


# Global database instance
_db_config: Optional[DatabaseConfig] = None


def get_database() -> DatabaseConfig:
    """Get the global database configuration instance.

    Returns:
        DatabaseConfig instance
    """
    global _db_config
    if _db_config is None:
        # Default to local SQLite database
        db_path = Path("./openspc.db")
        _db_config = DatabaseConfig(
            database_url=f"sqlite+aiosqlite:///{db_path}",
            echo=False,
        )
    return _db_config


def set_database(config: DatabaseConfig) -> None:
    """Set the global database configuration instance.

    Args:
        config: DatabaseConfig instance to use globally
    """
    global _db_config
    _db_config = config


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency function for FastAPI to get database sessions.

    Yields:
        AsyncSession instance

    Example:
        @app.get("/hierarchies")
        async def list_hierarchies(session: AsyncSession = Depends(get_session)):
            result = await session.execute(select(Hierarchy))
            return result.scalars().all()
    """
    db = get_database()
    async with db.session() as session:
        yield session
