"""Database configuration and session management."""

import threading
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Optional

import structlog
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from openspc.db.dialects import (
    DatabaseDialect,
    build_database_url,
    detect_dialect,
    get_encryption_key,
    load_db_config,
)
from openspc.db.models import Base

logger = structlog.get_logger(__name__)


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
        self.dialect = detect_dialect(database_url)
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
            engine_kwargs: dict = {
                "echo": self.echo,
            }

            if self.dialect == DatabaseDialect.SQLITE:
                # NullPool is needed for SQLite (doesn't support connection pooling well)
                engine_kwargs["poolclass"] = NullPool
            else:
                # Server databases benefit from connection pooling
                engine_kwargs["pool_size"] = 10
                engine_kwargs["max_overflow"] = 20
                engine_kwargs["pool_recycle"] = 3600
                engine_kwargs["pool_pre_ping"] = True

            self._engine = create_async_engine(
                self.database_url,
                **engine_kwargs,
            )

            # Configure SQLite for WAL mode and foreign keys
            if self.dialect == DatabaseDialect.SQLITE:

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


def _resolve_database_url() -> str:
    """Resolve the database URL using the priority order:

    1. db_config.json (encrypted credentials) — preferred for enterprise
    2. OPENSPC_DATABASE_URL environment variable — logs warning
    3. SQLite default — sqlite+aiosqlite:///./openspc.db

    Returns:
        Resolved SQLAlchemy async database URL.
    """
    # 1. Check for db_config.json
    config = load_db_config()
    if config is not None:
        try:
            key = get_encryption_key()
            url = build_database_url(config, key)
            logger.info(
                "database_url_resolved",
                source="db_config.json",
                dialect=config.dialect.value,
            )
            return url
        except Exception as e:
            logger.error("db_config_url_build_failed", error=str(e))
            # Fall through to other methods

    # 2. Check environment variable
    from openspc.core.config import get_settings

    settings = get_settings()
    default_url = "sqlite+aiosqlite:///./openspc.db"

    if settings.database_url != default_url:
        logger.warning(
            "database_url_from_env",
            msg="Using unencrypted connection string from environment variable",
        )
        return settings.database_url

    # 3. SQLite default
    logger.info("database_url_resolved", source="default", dialect="sqlite")
    return default_url


# Global database instance
_db_config: Optional[DatabaseConfig] = None
_db_lock = threading.Lock()


def get_database() -> DatabaseConfig:
    """Get the global database configuration instance.

    Returns:
        DatabaseConfig instance
    """
    global _db_config
    if _db_config is None:
        with _db_lock:
            # Double-checked locking
            if _db_config is None:
                _db_config = DatabaseConfig(
                    database_url=_resolve_database_url(),
                    echo=False,
                )
    return _db_config


def set_database(config: DatabaseConfig) -> None:
    """Set the global database configuration instance.

    Args:
        config: DatabaseConfig instance to use globally
    """
    global _db_config
    with _db_lock:
        _db_config = config


def reset_singleton() -> None:
    """Clear the global database singleton so the next get_database() call
    creates a fresh connection pool. Used by devtools reset-and-seed."""
    global _db_config
    with _db_lock:
        _db_config = None


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
