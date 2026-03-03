"""Multi-characteristic aligned data extraction for multivariate SPC.

Loads sample data across multiple characteristics and aligns by timestamp
so that each row in the resulting matrix represents a near-simultaneous
observation of all selected characteristics.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Sequence

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from cassini.db.models.characteristic import Characteristic
from cassini.db.models.sample import Measurement, Sample


async def load_aligned_data(
    session: AsyncSession,
    char_ids: list[int],
    limit: int = 500,
    tolerance_hours: float = 1.0,
) -> tuple[np.ndarray, list[datetime], list[str]]:
    """Load aligned sample data across multiple characteristics.

    For each characteristic, loads the last *limit* non-excluded samples.
    Then aligns by timestamp: for each time-point in the first (reference)
    characteristic, finds the closest sample from every other characteristic
    within *tolerance_hours*.

    Rows where any characteristic lacks a matching sample are dropped
    (complete-case analysis).

    Args:
        session: Async SQLAlchemy session.
        char_ids: Ordered list of characteristic IDs to include.
        limit: Maximum number of recent samples per characteristic.
        tolerance_hours: Maximum time gap (hours) for a sample to be
            considered aligned with the reference timestamp.

    Returns:
        X: ``(n_aligned, n_chars)`` numpy array of mean values.
        timestamps: Aligned reference timestamps.
        char_names: Characteristic names in column order.

    Raises:
        ValueError: If fewer than 2 characteristic IDs are given, or if
            any characteristic ID is not found.
    """
    if len(char_ids) < 2:
        raise ValueError("Multivariate analysis requires at least 2 characteristics")

    tolerance = timedelta(hours=tolerance_hours)

    # ------------------------------------------------------------------
    # 1. Load characteristic names
    # ------------------------------------------------------------------
    char_names: list[str] = []
    for cid in char_ids:
        result = await session.execute(
            select(Characteristic.name).where(Characteristic.id == cid)
        )
        name = result.scalar_one_or_none()
        if name is None:
            raise ValueError(f"Characteristic {cid} not found")
        char_names.append(name)

    # ------------------------------------------------------------------
    # 2. Load recent samples for each characteristic
    # ------------------------------------------------------------------
    # char_data[i] = list of (timestamp, mean_value) sorted ascending
    char_data: list[list[tuple[datetime, float]]] = []

    for cid in char_ids:
        stmt = (
            select(Sample)
            .where(Sample.char_id == cid, Sample.is_excluded.is_(False))
            .order_by(Sample.timestamp.desc())
            .limit(limit)
            .options(selectinload(Sample.measurements))
        )
        result = await session.execute(stmt)
        samples: Sequence[Sample] = result.scalars().all()

        pairs: list[tuple[datetime, float]] = []
        for s in samples:
            mean_val = _sample_mean(s)
            if mean_val is not None:
                ts = s.timestamp
                # Normalise to offset-aware UTC so naive and aware
                # timestamps from different sources can be compared.
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                pairs.append((ts, mean_val))

        # Reverse to ascending order for alignment
        pairs.sort(key=lambda p: p[0])
        char_data.append(pairs)

    # ------------------------------------------------------------------
    # 3. Align on reference characteristic (first in list)
    # ------------------------------------------------------------------
    ref = char_data[0]
    if not ref:
        return np.empty((0, len(char_ids))), [], char_names

    aligned_rows: list[list[float]] = []
    aligned_ts: list[datetime] = []

    # Pre-build index cursors for each secondary characteristic
    cursors = [0] * len(char_ids)

    for ref_ts, ref_val in ref:
        row: list[float | None] = [ref_val]
        complete = True

        for j in range(1, len(char_ids)):
            match = _find_closest(char_data[j], ref_ts, tolerance, cursors, j)
            if match is None:
                complete = False
                break
            row.append(match)

        if complete:
            aligned_rows.append(row)  # type: ignore[arg-type]
            aligned_ts.append(ref_ts)

    if not aligned_rows:
        return np.empty((0, len(char_ids))), [], char_names

    X = np.array(aligned_rows, dtype=np.float64)
    return X, aligned_ts, char_names


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _sample_mean(sample: Sample) -> float | None:
    """Extract mean value from a sample.

    Uses measurements if available; falls back to the first measurement
    value for subgroup_size == 1.
    """
    measurements = sample.measurements
    if not measurements:
        return None
    values = [m.value for m in measurements]
    return float(np.mean(values))


def _find_closest(
    pairs: list[tuple[datetime, float]],
    target: datetime,
    tolerance: timedelta,
    cursors: list[int],
    idx: int,
) -> float | None:
    """Find the sample closest to *target* within *tolerance*.

    Uses a sliding cursor to avoid O(n^2) scanning.
    """
    n = len(pairs)
    if n == 0:
        return None

    # Advance cursor past timestamps well before the target
    while cursors[idx] < n - 1 and pairs[cursors[idx]][0] < target - tolerance:
        cursors[idx] += 1

    best_val: float | None = None
    best_gap: timedelta | None = None

    i = cursors[idx]
    while i < n:
        ts, val = pairs[i]
        gap = abs(ts - target)
        if gap <= tolerance:
            if best_gap is None or gap < best_gap:
                best_val = val
                best_gap = gap
            i += 1
        elif ts > target + tolerance:
            break
        else:
            i += 1

    return best_val
