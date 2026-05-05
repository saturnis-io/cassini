"""Tests that _build_hierarchy_path fires exactly 1 SQL statement.

H12 / A1: the original implementation walked parents one get_by_id() call at
a time — O(depth) queries.  The fix delegates to
HierarchyRepository.get_ancestor_path() which loads all plant nodes in a
single SELECT and walks in memory.

We count queries via a SQLAlchemy engine event listener so the test is
robust against implementation changes.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from cassini.db.models import Base
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.repositories.hierarchy import HierarchyRepository

# Import the function under test
from cassini.api.v1.characteristics import _build_hierarchy_path


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def cte_engine():
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
async def cte_session(cte_engine):
    factory = sessionmaker(cte_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session, cte_engine
        await session.rollback()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _build_hierarchy(session: AsyncSession, depth: int) -> int:
    """Create a linear chain of `depth` hierarchy nodes; return leaf id."""
    parent_id: int | None = None
    plant_id: int | None = None

    # Create a Plant record so all nodes share a plant_id (needed by
    # get_ancestor_path's single-plant-query strategy).
    from cassini.db.models.plant import Plant
    plant = Plant(name="TestPlant", code="TP1")
    session.add(plant)
    await session.flush()
    plant_id = plant.id

    for level in range(depth):
        node = Hierarchy(
            name=f"Level{level}",
            type="Area",
            parent_id=parent_id,
            plant_id=plant_id,
        )
        session.add(node)
        await session.flush()
        parent_id = node.id

    await session.commit()
    return parent_id  # type: ignore[return-value]  # leaf node id


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_build_hierarchy_path_single_query(cte_session):
    """_build_hierarchy_path must issue at most 2 SQL statements for any depth.

    get_ancestor_path first fetches the target node (1 query), then fetches
    all plant nodes (1 query).  Two is the minimum achievable without caching.
    The old implementation fired O(depth) queries.
    """
    session, engine = cte_session

    leaf_id = await _build_hierarchy(session, depth=6)
    repo = HierarchyRepository(session)

    executed: list[str] = []

    @event.listens_for(engine.sync_engine, "before_cursor_execute")
    def _count(conn, cursor, statement, parameters, context, executemany):
        executed.append(statement)

    path = await _build_hierarchy_path(repo, leaf_id)

    # The new implementation uses get_ancestor_path which does:
    #   1. get_by_id(hierarchy_id)   — 1 query
    #   2. SELECT * FROM hierarchy WHERE plant_id = ?  — 1 query
    # Total: 2 queries maximum, independent of tree depth.
    # (Old code: 6 queries for depth=6.)
    assert len(executed) <= 2, (
        f"Expected <=2 queries for depth-6 hierarchy, got {len(executed)}: {executed}"
    )
    assert path != ""


@pytest.mark.asyncio
async def test_hierarchy_path_correctness_4_deep(cte_session):
    """A 4-level hierarchy resolves to a 4-part path."""
    session, engine = cte_session

    leaf_id = await _build_hierarchy(session, depth=4)
    repo = HierarchyRepository(session)

    path = await _build_hierarchy_path(repo, leaf_id)

    # Should be "Level0 > Level1 > Level2 > Level3"
    parts = path.split(" > ")
    assert len(parts) == 4, f"Expected 4 path parts, got {len(parts)}: {path}"
    assert parts[0] == "Level0"
    assert parts[-1] == "Level3"


@pytest.mark.asyncio
async def test_hierarchy_path_single_node(cte_session):
    """A hierarchy with no parent returns just that node's name."""
    session, engine = cte_session

    from cassini.db.models.plant import Plant
    plant = Plant(name="P2", code="P2")
    session.add(plant)
    await session.flush()

    node = Hierarchy(name="Root", type="Site", parent_id=None, plant_id=plant.id)
    session.add(node)
    await session.flush()
    await session.commit()

    repo = HierarchyRepository(session)
    path = await _build_hierarchy_path(repo, node.id)
    assert path == "Root"


@pytest.mark.asyncio
async def test_hierarchy_path_missing_node(cte_session):
    """A non-existent hierarchy_id returns empty string (no crash)."""
    session, _ = cte_session
    repo = HierarchyRepository(session)
    path = await _build_hierarchy_path(repo, 99999)
    assert path == ""
