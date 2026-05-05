"""Display key computation for sample identification.

Computes YYMMDD-NNN display keys by ranking samples within each calendar day.

Dialect strategy
----------------
* PostgreSQL / MySQL 8+ / MSSQL: single SELECT with
  ``ROW_NUMBER() OVER (PARTITION BY date(timestamp) ORDER BY timestamp, id)``.
  ``func.date()`` is supported on all three; the window function collapses the
  entire date range into one round trip.

* SQLite: ``func.date()`` works in SQLite 3.25+ but SQLite's date() returns
  TEXT — the partition is still correct. SQLite has had window functions since
  3.25.0 (released 2018-09-15), so we use the same ROW_NUMBER path by default.
  For very old SQLite builds (<3.25) or if the window function raises, we fall
  back to fetching the ordered (timestamp, id) pairs in Python and computing
  ranks there — a single SELECT, Python-side ranking.

Either path issues exactly ONE SQL statement regardless of how many distinct
calendar days appear in the sample window.
"""

from __future__ import annotations

import structlog
from sqlalchemy import func, over, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.sample import Sample

logger = structlog.get_logger(__name__)


async def compute_display_keys(
    samples: list,
    char_id: int,
    session: AsyncSession,
) -> dict[int, str]:
    """Compute YYMMDD-NNN display keys for a list of samples.

    Issues exactly **one** SQL statement regardless of how many distinct
    calendar days appear in *samples*.

    The approach:
    1. Detect whether the bound engine supports window functions (all modern
       dialects do; SQLite >= 3.25).  If yes, push ROW_NUMBER() to the DB.
    2. Otherwise fall back to fetching ordered (id, timestamp) rows and
       computing ranks in Python — still one query.

    Args:
        samples: Sample ORM objects (must have ``.id`` and ``.timestamp``).
        char_id: Characteristic ID the samples belong to.
        session: Active async database session.

    Returns:
        Mapping of ``sample.id`` -> ``"YYMMDD-NNN"`` canonical display key.
    """
    if not samples:
        return {}

    # Collect the min/max timestamp to bound the DB query to the window only.
    min_ts = min(s.timestamp for s in samples)
    max_ts = max(s.timestamp for s in samples)

    # Build a per-sample lookup: id -> "YYMMDD" string (always done in Python
    # because strftime formatting is dialect-agnostic here).
    id_to_yymmdd: dict[int, str] = {
        s.id: s.timestamp.strftime("%y%m%d") for s in samples
    }
    target_ids: set[int] = set(id_to_yymmdd.keys())

    # ------------------------------------------------------------------
    # Detect whether the engine supports window functions.
    # All supported dialects (SQLite 3.25+, PG, MySQL 8, MSSQL) do.
    # We check the dialect name so we can route to the Python fallback
    # for rare environments without window-function support.
    # ------------------------------------------------------------------
    engine = session.get_bind()
    dialect_name: str = engine.dialect.name if engine is not None else "sqlite"

    # SQLite < 3.25 does not support window functions. We detect this by
    # inspecting the sqlite_version (available at runtime). For all server
    # dialects we always use the window-function path.
    use_window = True
    if dialect_name == "sqlite":
        try:
            # sqlite3.sqlite_version is available from the stdlib.
            import sqlite3
            major, minor, _ = (int(x) for x in sqlite3.sqlite_version.split("."))
            if (major, minor) < (3, 25):
                use_window = False
        except Exception:
            # If we can't determine the version, try the window path and
            # fall back on error.
            pass

    if use_window:
        return await _compute_via_window_function(
            session, char_id, min_ts, max_ts, id_to_yymmdd, target_ids
        )
    else:
        return await _compute_via_python_rank(
            session, char_id, min_ts, max_ts, id_to_yymmdd, target_ids
        )


async def _compute_via_window_function(
    session: AsyncSession,
    char_id: int,
    min_ts,
    max_ts,
    id_to_yymmdd: dict[int, str],
    target_ids: set[int],
) -> dict[int, str]:
    """Single SELECT with ROW_NUMBER() OVER (PARTITION BY date ORDER BY ...).

    Works on PostgreSQL, MySQL 8+, MSSQL, and SQLite >= 3.25.

    ``func.date(Sample.timestamp)`` is understood by all four dialects:
    * PostgreSQL: ``date(timestamp)`` -> DATE
    * MySQL / MSSQL / SQLite: ``date(timestamp)`` -> date string / DATE
    """
    # ROW_NUMBER() OVER (PARTITION BY date(timestamp) ORDER BY timestamp, id)
    row_num_col = over(
        func.row_number(),
        partition_by=func.date(Sample.timestamp),
        order_by=[Sample.timestamp, Sample.id],
    ).label("day_rank")

    stmt = (
        select(Sample.id, row_num_col)
        .where(
            Sample.char_id == char_id,
            Sample.timestamp >= min_ts,
            Sample.timestamp <= max_ts,
        )
    )

    result = await session.execute(stmt)
    rows = result.all()  # list of (id, day_rank)

    display_keys: dict[int, str] = {}
    for row_id, day_rank in rows:
        if row_id in target_ids:
            yymmdd = id_to_yymmdd[row_id]
            display_keys[row_id] = f"{yymmdd}-{int(day_rank):03d}"

    return display_keys


async def _compute_via_python_rank(
    session: AsyncSession,
    char_id: int,
    min_ts,
    max_ts,
    id_to_yymmdd: dict[int, str],
    target_ids: set[int],
) -> dict[int, str]:
    """Fallback for SQLite < 3.25: fetch ordered rows, rank in Python.

    Still a single SELECT. We fetch (id, timestamp) for the window, sort
    by (timestamp, id) — which the DB already does — then assign 1-based
    ranks per calendar day in Python.
    """
    stmt = (
        select(Sample.id, Sample.timestamp)
        .where(
            Sample.char_id == char_id,
            Sample.timestamp >= min_ts,
            Sample.timestamp <= max_ts,
        )
        .order_by(Sample.timestamp, Sample.id)
    )

    result = await session.execute(stmt)
    rows = result.all()  # list of (id, timestamp)

    # Rank within each calendar day.
    day_rank_counter: dict[str, int] = {}  # "YYYY-MM-DD" -> current rank
    id_to_rank: dict[int, int] = {}
    for row_id, ts in rows:
        day_key = ts.strftime("%Y-%m-%d")
        day_rank_counter[day_key] = day_rank_counter.get(day_key, 0) + 1
        id_to_rank[row_id] = day_rank_counter[day_key]

    display_keys: dict[int, str] = {}
    for sid in target_ids:
        yymmdd = id_to_yymmdd[sid]
        rank = id_to_rank.get(sid, 1)
        display_keys[sid] = f"{yymmdd}-{rank:03d}"

    return display_keys
