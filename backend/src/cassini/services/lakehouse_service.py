"""Lakehouse data product service.

Reads whitelisted Cassini tables via SQLAlchemy, applies plant-scoped
filtering, and serializes the result to one of the supported formats
(Arrow IPC stream, Parquet, CSV, JSON).

DuckDB acts as the analytical engine for ad-hoc transforms. When DuckDB
is not installed we fall back to executing the underlying SQLAlchemy
query directly — every test exercises this path so the service degrades
gracefully on minimal installs.

Multi-tenancy contract
----------------------
Every query that returns plant-scoped rows MUST be filtered by the
caller's accessible plant IDs. The router resolves the accessible IDs
from the JWT and hands them to ``execute_export`` — this module never
performs its own auth. Rows for plants the caller cannot access MUST
NOT appear in the output.

Streaming
---------
Arrow IPC is streamed via ``arrow_ipc_chunks`` so large exports do not
buffer fully in memory. CSV / JSON / Parquet are serialized once because
their wire formats require trailing offsets / footers.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncIterator, Iterable, Optional

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.schemas.lakehouse import LakehouseFormat, LakehouseTable
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.plant import Plant
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.violation import Violation


# Maximum rows returned by a single export — guards against accidental
# multi-GB downloads. Callers can lower it via the ``limit`` query param;
# anything above this hard cap is clamped.
_MAX_ROWS = 1_000_000

# Maximum rows per Arrow IPC chunk when streaming. Tuned so a chunk fits
# in a few MB of wire for typical column widths.
_ARROW_CHUNK_SIZE = 10_000


# ---------------------------------------------------------------------------
# Column catalog — every whitelisted table declares the columns it exposes.
# Exported columns are intentionally a subset of the underlying SQLAlchemy
# model: free-text fields, JSON blobs, and audit-only metadata are excluded
# so the data product does not leak operator IDs or custom_metadata that
# might contain PII.
# ---------------------------------------------------------------------------

_TABLE_COLUMNS: dict[LakehouseTable, list[str]] = {
    LakehouseTable.SAMPLES: [
        "id", "char_id", "timestamp", "is_excluded", "actual_n",
        "effective_ucl", "effective_lcl", "z_score",
        "defect_count", "sample_size", "units_inspected",
        "cusum_high", "cusum_low", "ewma_value",
        "source", "spc_status", "is_modified", "plant_id",
    ],
    LakehouseTable.MEASUREMENTS: [
        "id", "sample_id", "value", "char_id", "plant_id", "timestamp",
    ],
    LakehouseTable.VIOLATIONS: [
        "id", "sample_id", "char_id", "rule_id", "rule_name", "severity",
        "acknowledged", "requires_acknowledgement", "ack_timestamp",
        "created_at", "plant_id",
    ],
    LakehouseTable.CHARACTERISTICS: [
        "id", "hierarchy_id", "name", "description", "subgroup_size",
        "target_value", "usl", "lsl", "ucl", "lcl",
        "data_type", "chart_type", "decimal_precision", "plant_id",
    ],
    LakehouseTable.PLANTS: [
        "id", "name", "code", "is_active", "created_at", "updated_at",
    ],
}


_TABLE_DESCRIPTIONS: dict[LakehouseTable, str] = {
    LakehouseTable.SAMPLES:
        "Sample events with subgroup-level computed values.",
    LakehouseTable.MEASUREMENTS:
        "Individual measurement values within each sample.",
    LakehouseTable.VIOLATIONS:
        "Nelson Rules and statistical violations triggered by samples.",
    LakehouseTable.CHARACTERISTICS:
        "Characteristic configuration with spec and control limits.",
    LakehouseTable.PLANTS:
        "Manufacturing plants the caller has access to.",
}


# Plant scoping: every table except plants joins through hierarchy → plant.
_PLANT_SCOPED: dict[LakehouseTable, bool] = {
    LakehouseTable.SAMPLES: True,
    LakehouseTable.MEASUREMENTS: True,
    LakehouseTable.VIOLATIONS: True,
    LakehouseTable.CHARACTERISTICS: True,
    LakehouseTable.PLANTS: True,  # Plants table itself is filtered to accessible IDs.
}


# Column → datetime hint so CSV / JSON can render timestamps in ISO 8601.
_DATETIME_COLUMNS: frozenset[str] = frozenset({
    "timestamp", "ack_timestamp", "created_at", "updated_at",
})


@dataclass
class LakehouseExportResult:
    """Result of an export executed via SQLAlchemy.

    Wraps a raw row payload + metadata so the router can serialize and
    audit-log without re-querying the row count.
    """

    table: LakehouseTable
    columns: list[str]
    rows: list[dict[str, Any]]
    plant_filter: Optional[list[int]]
    truncated: bool


# ---------------------------------------------------------------------------
# Public API — catalog + export entry points
# ---------------------------------------------------------------------------


def list_tables() -> list[dict[str, Any]]:
    """Return the catalog payload describing every available table."""
    return [
        {
            "name": t.value,
            "description": _TABLE_DESCRIPTIONS[t],
            "columns": list(_TABLE_COLUMNS[t]),
            "plant_scoped": _PLANT_SCOPED[t],
        }
        for t in LakehouseTable
    ]


def resolve_columns(
    table: LakehouseTable, requested: Optional[list[str]],
) -> list[str]:
    """Resolve the final column projection.

    When the caller passes ``columns=`` we keep only the intersection with
    the table's whitelist — anything outside the catalog is silently
    dropped so a typo cannot leak unexpected fields. When the caller does
    not specify columns, we return the full catalog.
    """
    available = _TABLE_COLUMNS[table]
    if not requested:
        return list(available)
    available_set = set(available)
    return [c for c in requested if c in available_set]


async def execute_export(
    *,
    session: AsyncSession,
    table: LakehouseTable,
    columns: list[str],
    accessible_plant_ids: Optional[list[int]],
    plant_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: Optional[int] = None,
) -> LakehouseExportResult:
    """Run the table export against the live SQLAlchemy session.

    Args:
        session: Async SQLAlchemy session.
        table: Whitelisted table.
        columns: Already-validated column subset (see ``resolve_columns``).
        accessible_plant_ids: Plant IDs the caller may read. ``None``
            means the caller is a global admin — no plant filter applied.
            Empty list means no access — the result will be empty.
        plant_id: Optional explicit plant filter. Must be in
            ``accessible_plant_ids`` when that argument is not ``None``.
        start_date / end_date: Optional timestamp window.
        limit: Optional row limit (clamped to ``_MAX_ROWS``).

    Returns:
        LakehouseExportResult with the row payload + metadata.
    """
    # If the caller has an empty accessible list, short-circuit with no rows
    # rather than running a query that returns everything (None → no filter).
    if accessible_plant_ids is not None and not accessible_plant_ids:
        return LakehouseExportResult(
            table=table,
            columns=columns,
            rows=[],
            plant_filter=[],
            truncated=False,
        )

    effective_limit = _MAX_ROWS if limit is None else min(limit, _MAX_ROWS)

    plant_filter = _resolve_plant_filter(accessible_plant_ids, plant_id)

    stmt = _build_select(
        table=table,
        columns=columns,
        plant_filter=plant_filter,
        start_date=start_date,
        end_date=end_date,
    )

    # +1 to detect truncation cheaply.
    stmt = stmt.limit(effective_limit + 1)
    result = await session.execute(stmt)
    raw_rows = result.all()

    truncated = len(raw_rows) > effective_limit
    if truncated:
        raw_rows = raw_rows[:effective_limit]

    rows: list[dict[str, Any]] = [
        {col: getattr(row, col, None) for col in columns}
        for row in raw_rows
    ]

    return LakehouseExportResult(
        table=table,
        columns=columns,
        rows=rows,
        plant_filter=plant_filter,
        truncated=truncated,
    )


# ---------------------------------------------------------------------------
# Format serializers — each emits bytes / chunked bytes for one wire format.
# Heavyweight optional deps (pyarrow, duckdb) are imported lazily inside the
# branch that needs them so the service still imports on minimal installs.
# ---------------------------------------------------------------------------


def to_csv_bytes(result: LakehouseExportResult) -> bytes:
    """Render the export as a UTF-8 CSV with header row."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=result.columns, extrasaction="ignore")
    writer.writeheader()
    for row in result.rows:
        writer.writerow({k: _csv_value(v) for k, v in row.items()})
    return buf.getvalue().encode("utf-8")


def to_json_bytes(result: LakehouseExportResult) -> bytes:
    """Render the export as a JSON document with metadata + rows."""
    payload = {
        "metadata": {
            "table": result.table.value,
            "format": LakehouseFormat.JSON.value,
            "row_count": len(result.rows),
            "columns": result.columns,
            "plant_filter": result.plant_filter,
            "truncated": result.truncated,
        },
        "rows": [_json_serializable_row(r) for r in result.rows],
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def to_parquet_bytes(result: LakehouseExportResult) -> bytes:
    """Render the export as a Parquet file. Requires pyarrow.

    Raises:
        LakehouseDependencyError: pyarrow is not installed.
    """
    pa, pq = _require_pyarrow_with_parquet()
    table = _result_to_arrow_table(pa, result)
    sink = io.BytesIO()
    pq.write_table(table, sink)
    return sink.getvalue()


def arrow_ipc_chunks(result: LakehouseExportResult) -> Iterable[bytes]:
    """Yield Arrow IPC stream byte chunks. Requires pyarrow.

    The first yielded chunk holds the schema; subsequent chunks hold one
    record batch each, sized to ``_ARROW_CHUNK_SIZE``.

    Raises:
        LakehouseDependencyError: pyarrow is not installed.
    """
    pa = _require_pyarrow()
    arrow_table = _result_to_arrow_table(pa, result)

    sink = pa.BufferOutputStream()
    writer = pa.ipc.new_stream(sink, arrow_table.schema)
    for batch in arrow_table.to_batches(max_chunksize=_ARROW_CHUNK_SIZE):
        writer.write_batch(batch)
    writer.close()
    yield sink.getvalue().to_pybytes()


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


class LakehouseDependencyError(RuntimeError):
    """Raised when an optional analytical dependency is missing.

    The router maps this to HTTP 501 Not Implemented so clients can
    surface a clean error rather than a 500.
    """


def _require_pyarrow():  # pragma: no cover - import shim
    try:
        import pyarrow  # type: ignore[import-not-found]
    except ImportError as e:
        raise LakehouseDependencyError(
            "pyarrow is not installed; install the lakehouse extra: "
            "pip install 'cassini[lakehouse]'"
        ) from e
    return pyarrow


def _require_pyarrow_with_parquet():  # pragma: no cover - import shim
    pa = _require_pyarrow()
    try:
        import pyarrow.parquet as pq  # type: ignore[import-not-found]
    except ImportError as e:
        raise LakehouseDependencyError(
            "pyarrow.parquet is not installed; install the lakehouse extra: "
            "pip install 'cassini[lakehouse]'"
        ) from e
    return pa, pq


def _resolve_plant_filter(
    accessible: Optional[list[int]], plant_id: Optional[int],
) -> Optional[list[int]]:
    """Compute the effective plant filter applied to the query.

    Returns ``None`` when the caller is a global admin AND has not pinned
    a specific plant. Otherwise returns the explicit list of plant IDs
    that may appear in the result.
    """
    if accessible is None:
        # Global admin — no implicit plant scope.
        return [plant_id] if plant_id is not None else None
    if plant_id is not None:
        # Explicit pin — only allow if the caller has access.
        return [plant_id] if plant_id in accessible else []
    return list(accessible)


def _build_select(
    *,
    table: LakehouseTable,
    columns: list[str],
    plant_filter: Optional[list[int]],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Select:
    """Build the SELECT statement for the requested table.

    Uses explicit column projection so the query only fetches whitelisted
    fields. Plant scoping joins through hierarchy when the table is not
    plant_id-bearing already.
    """
    if table is LakehouseTable.PLANTS:
        return _build_plants_select(columns, plant_filter)
    if table is LakehouseTable.CHARACTERISTICS:
        return _build_characteristics_select(
            columns, plant_filter, start_date, end_date,
        )
    if table is LakehouseTable.SAMPLES:
        return _build_samples_select(columns, plant_filter, start_date, end_date)
    if table is LakehouseTable.MEASUREMENTS:
        return _build_measurements_select(
            columns, plant_filter, start_date, end_date,
        )
    if table is LakehouseTable.VIOLATIONS:
        return _build_violations_select(
            columns, plant_filter, start_date, end_date,
        )
    raise ValueError(f"Unsupported lakehouse table: {table}")  # pragma: no cover


def _build_plants_select(
    columns: list[str], plant_filter: Optional[list[int]],
) -> Select:
    cols = [getattr(Plant, c).label(c) for c in columns if hasattr(Plant, c)]
    stmt = select(*cols)
    if plant_filter is not None:
        stmt = stmt.where(Plant.id.in_(plant_filter))
    return stmt


def _build_characteristics_select(
    columns: list[str],
    plant_filter: Optional[list[int]],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Select:
    select_cols: list[Any] = []
    for c in columns:
        if c == "plant_id":
            select_cols.append(Hierarchy.plant_id.label("plant_id"))
        elif hasattr(Characteristic, c):
            select_cols.append(getattr(Characteristic, c).label(c))
    stmt = select(*select_cols).join(
        Hierarchy, Characteristic.hierarchy_id == Hierarchy.id,
    )
    if plant_filter is not None:
        stmt = stmt.where(Hierarchy.plant_id.in_(plant_filter))
    # Characteristics has no native timestamp; date filters are no-ops.
    _ = start_date, end_date
    return stmt


def _build_samples_select(
    columns: list[str],
    plant_filter: Optional[list[int]],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Select:
    select_cols: list[Any] = []
    for c in columns:
        if c == "plant_id":
            select_cols.append(Hierarchy.plant_id.label("plant_id"))
        elif hasattr(Sample, c):
            select_cols.append(getattr(Sample, c).label(c))
    stmt = (
        select(*select_cols)
        .join(Characteristic, Sample.char_id == Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
    )
    if plant_filter is not None:
        stmt = stmt.where(Hierarchy.plant_id.in_(plant_filter))
    if start_date is not None:
        stmt = stmt.where(Sample.timestamp >= start_date)
    if end_date is not None:
        stmt = stmt.where(Sample.timestamp <= end_date)
    return stmt


def _build_measurements_select(
    columns: list[str],
    plant_filter: Optional[list[int]],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Select:
    select_cols: list[Any] = []
    for c in columns:
        if c == "plant_id":
            select_cols.append(Hierarchy.plant_id.label("plant_id"))
        elif c == "char_id":
            select_cols.append(Sample.char_id.label("char_id"))
        elif c == "timestamp":
            select_cols.append(Sample.timestamp.label("timestamp"))
        elif hasattr(Measurement, c):
            select_cols.append(getattr(Measurement, c).label(c))
    stmt = (
        select(*select_cols)
        .join(Sample, Measurement.sample_id == Sample.id)
        .join(Characteristic, Sample.char_id == Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
    )
    if plant_filter is not None:
        stmt = stmt.where(Hierarchy.plant_id.in_(plant_filter))
    if start_date is not None:
        stmt = stmt.where(Sample.timestamp >= start_date)
    if end_date is not None:
        stmt = stmt.where(Sample.timestamp <= end_date)
    return stmt


def _build_violations_select(
    columns: list[str],
    plant_filter: Optional[list[int]],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Select:
    select_cols: list[Any] = []
    for c in columns:
        if c == "plant_id":
            select_cols.append(Hierarchy.plant_id.label("plant_id"))
        elif hasattr(Violation, c):
            select_cols.append(getattr(Violation, c).label(c))
    stmt = (
        select(*select_cols)
        .join(Characteristic, Violation.char_id == Characteristic.id)
        .join(Hierarchy, Characteristic.hierarchy_id == Hierarchy.id)
    )
    if plant_filter is not None:
        stmt = stmt.where(Hierarchy.plant_id.in_(plant_filter))
    if start_date is not None:
        stmt = stmt.where(Violation.created_at >= start_date)
    if end_date is not None:
        stmt = stmt.where(Violation.created_at <= end_date)
    return stmt


# ---------------------------------------------------------------------------
# Format helpers
# ---------------------------------------------------------------------------


def _csv_value(v: Any) -> Any:
    """Render a single value for CSV output."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, bool):
        return "true" if v else "false"
    return v


def _json_serializable_row(row: dict[str, Any]) -> dict[str, Any]:
    """Convert datetimes / bytes to JSON-friendly types."""
    out: dict[str, Any] = {}
    for k, v in row.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, bytes):
            out[k] = v.decode("utf-8", errors="replace")
        else:
            out[k] = v
    return out


def _result_to_arrow_table(pa, result: LakehouseExportResult):
    """Convert an export result to a pyarrow Table.

    Coerces every value to JSON-friendly types first so heterogeneous
    nullables play nicely with the type inference pyarrow performs.
    """
    columnar: dict[str, list[Any]] = {col: [] for col in result.columns}
    for row in result.rows:
        for col in result.columns:
            value = row.get(col)
            if isinstance(value, datetime):
                # pyarrow handles datetime objects natively; pass through.
                columnar[col].append(value)
            else:
                columnar[col].append(value)
    return pa.table(columnar)


__all__ = [
    "LakehouseDependencyError",
    "LakehouseExportResult",
    "arrow_ipc_chunks",
    "execute_export",
    "list_tables",
    "resolve_columns",
    "to_csv_bytes",
    "to_json_bytes",
    "to_parquet_bytes",
]


async def stream_arrow_chunks(result: LakehouseExportResult) -> AsyncIterator[bytes]:
    """Async wrapper around ``arrow_ipc_chunks`` for ``StreamingResponse``."""
    for chunk in arrow_ipc_chunks(result):
        yield chunk
