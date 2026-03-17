"""Pytest configuration and shared fixtures."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(autouse=True)
def _clear_spc_rule_cache():
    """Clear the module-level shared rule cache between tests.

    SPCEngine uses a per-worker singleton cache (OrderedDict) that persists
    across test functions. Without clearing, a test that processes char_id=1
    with one rule config poisons the cache for subsequent tests using the
    same char_id with different rules.
    """
    import cassini.core.engine.spc_engine as spc_mod

    spc_mod._shared_rule_cache = None
    yield
    spc_mod._shared_rule_cache = None

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

from cassini.db.models import Base


@pytest_asyncio.fixture
async def async_engine() -> AsyncGenerator[AsyncEngine, None]:
    """Create async engine with in-memory SQLite for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def async_session(async_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create async session for testing."""
    async_session_factory = sessionmaker(
        async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_factory() as session:
        yield session
        await session.rollback()
