"""Display key computation for sample identification.

Computes YYMMDD-NNN display keys by ranking samples within each calendar day.
Uses a date-range comparison (``timestamp >= day AND timestamp < day+1``) which
is portable across SQLite, PostgreSQL, MySQL, and MSSQL without relying on
``func.date()`` (unavailable on MSSQL) or ``cast(timestamp, Date)`` (no-op on
SQLite, causing all keys to collapse to ``-001``).
"""

from collections import defaultdict
from datetime import date as date_type, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.db.models.sample import Sample


async def compute_display_keys(
    samples: list,
    char_id: int,
    session: AsyncSession,
) -> dict[int, str]:
    """Compute YYMMDD-NNN display keys for a list of samples.

    For each unique calendar day represented in *samples*, runs a single query
    to fetch ALL sample IDs for that characteristic on that day, ordered by
    ``(timestamp, id)``.  The 1-based rank within the day becomes the ``-NNN``
    suffix.

    Args:
        samples: Sample ORM objects (must have ``.id`` and ``.timestamp``).
        char_id: Characteristic ID the samples belong to.
        session: Active async database session.

    Returns:
        Mapping of ``sample.id`` → ``"YYMMDD-NNN"`` canonical display key.
    """
    if not samples:
        return {}

    # Group sample IDs by calendar date (Python-side, always correct)
    day_buckets: dict[str, list[int]] = defaultdict(list)
    day_str_map: dict[int, str] = {}  # sample_id -> 'YYMMDD'
    for sample in samples:
        day_date = sample.timestamp.strftime('%Y-%m-%d')  # '2026-03-02'
        day_buckets[day_date].append(sample.id)
        day_str_map[sample.id] = sample.timestamp.strftime('%y%m%d')

    display_keys: dict[int, str] = {}

    for day_date, sample_ids_in_window in day_buckets.items():
        # Single query: get ALL sample IDs for this char on this day,
        # ordered by timestamp then id (so the rank is globally stable).
        # Uses range comparison instead of date extraction — portable across
        # all dialects (SQLite, PG, MySQL, MSSQL).
        day_start = date_type.fromisoformat(day_date)
        day_end = day_start + timedelta(days=1)
        stmt = (
            select(Sample.id)
            .where(
                Sample.char_id == char_id,
                Sample.timestamp >= day_start,
                Sample.timestamp < day_end,
            )
            .order_by(Sample.timestamp, Sample.id)
        )
        result = await session.execute(stmt)
        all_day_ids = [row[0] for row in result]

        # Build rank map (1-based)
        id_to_rank = {sid: idx + 1 for idx, sid in enumerate(all_day_ids)}

        for sid in sample_ids_in_window:
            rank = id_to_rank.get(sid, 1)
            display_keys[sid] = f"{day_str_map[sid]}-{rank:03d}"

    return display_keys
