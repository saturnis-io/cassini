"""Output formatters for Cassini CLI."""
from __future__ import annotations

import csv
import io
import json
import sys


def is_tty() -> bool:
    """Check if stdout is a terminal (TTY)."""
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()


def format_output(
    data: object, fmt: str | None = None, columns: list[str] | None = None
) -> str:
    """Format data for output.

    Auto-detects format based on TTY when ``fmt`` is None:
    - TTY (interactive terminal) -> human-readable table
    - Pipe / redirect -> JSON

    Args:
        data: The data to format (dict for single item, list of dicts for table).
        fmt: Force output format: "json", "csv", or "table".
        columns: Column names for table/CSV output.

    Returns:
        Formatted string ready for printing.
    """
    if fmt is None:
        fmt = "table" if is_tty() else "json"

    if fmt == "json":
        return json.dumps(data, indent=2, default=str)
    elif fmt == "csv":
        return _format_csv(data, columns)
    else:
        return _format_table(data, columns)


def _format_table(data: object, columns: list[str] | None = None) -> str:
    """Format data as a human-readable aligned table."""
    if isinstance(data, dict):
        # Single item -- format as key-value pairs
        lines = []
        for k, v in data.items():
            lines.append(f"  {k}: {v}")
        return "\n".join(lines)

    if not data:
        return "(no results)"

    if isinstance(data, list) and data:
        if columns is None:
            columns = list(data[0].keys()) if isinstance(data[0], dict) else []
        if not columns:
            return json.dumps(data, indent=2, default=str)

        # Calculate column widths
        widths = {col: len(col) for col in columns}
        for row in data:
            for col in columns:
                val = str(row.get(col, ""))
                widths[col] = max(widths[col], len(val))

        # Format header
        header = "  ".join(col.ljust(widths[col]) for col in columns)
        separator = "  ".join("-" * widths[col] for col in columns)
        rows = []
        for row in data:
            r = "  ".join(str(row.get(col, "")).ljust(widths[col]) for col in columns)
            rows.append(r)

        return "\n".join([header, separator] + rows)

    return str(data)


def _format_csv(data: object, columns: list[str] | None = None) -> str:
    """Format data as CSV."""
    if isinstance(data, dict):
        data = [data]
    if not data:
        return ""
    if not isinstance(data, list):
        return str(data)
    if columns is None and isinstance(data[0], dict):
        columns = list(data[0].keys())

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=columns or [])
    writer.writeheader()
    for row in data:
        writer.writerow({k: row.get(k, "") for k in (columns or [])})
    return output.getvalue()
