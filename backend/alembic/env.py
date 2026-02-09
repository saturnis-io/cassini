"""Alembic environment configuration with async support."""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import models to ensure they are registered with metadata
from openspc.db.models import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata


def _get_database_url() -> str:
    """Resolve the database URL for Alembic migrations.

    Resolution order (same as database.py):
    1. db_config.json (encrypted credentials)
    2. OPENSPC_DATABASE_URL environment variable
    3. alembic.ini sqlalchemy.url
    4. SQLite default

    Ensures async driver is injected for SQLite URLs.
    """
    # 1. Try db_config.json
    try:
        from openspc.db.dialects import build_database_url, get_encryption_key, load_db_config

        db_config = load_db_config()
        if db_config is not None:
            key = get_encryption_key()
            return build_database_url(db_config, key)
    except Exception:
        pass  # Fall through to other methods

    # 2. Environment variable
    url = os.environ.get("OPENSPC_DATABASE_URL")

    # 3. alembic.ini fallback
    if not url:
        url = config.get_main_option("sqlalchemy.url")

    # 4. SQLite default
    if not url:
        url = "sqlite:///./openspc.db"

    # Ensure async driver for SQLite using make_url for proper URL parsing
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite" and "aiosqlite" not in (parsed.get_driver_name() or ""):
        url = url.replace("sqlite:", "sqlite+aiosqlite:", 1)

    return url


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = _get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # Required for SQLite ALTER TABLE support
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run migrations with the given connection."""
    # Use batch mode for SQLite compatibility (harmless on other dialects)
    is_sqlite = connection.dialect.name == "sqlite"
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=is_sqlite,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations in async mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.
    """
    url = _get_database_url()

    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = url

    # Use NullPool for SQLite; for server databases, NullPool is also fine for migrations
    # since they are short-lived operations that don't benefit from connection pooling
    parsed = make_url(url)
    pool_class = pool.NullPool

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool_class,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
