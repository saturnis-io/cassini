"""Pydantic schemas for the Lakehouse data product API.

The lakehouse exposes whitelisted Cassini tables (samples, measurements,
violations, characteristics, plants) as read-only Arrow / Parquet / CSV /
JSON exports for downstream analytical workloads.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class LakehouseFormat(str, Enum):
    """Supported export formats."""

    ARROW = "arrow"
    PARQUET = "parquet"
    CSV = "csv"
    JSON = "json"


class LakehouseTable(str, Enum):
    """Whitelisted lakehouse tables.

    Anything not in this enum returns 404 from the endpoint.
    """

    SAMPLES = "samples"
    MEASUREMENTS = "measurements"
    VIOLATIONS = "violations"
    CHARACTERISTICS = "characteristics"
    PLANTS = "plants"


class LakehouseTableInfo(BaseModel):
    """Per-table metadata returned by the catalog endpoint."""

    name: str
    description: str
    columns: list[str]
    plant_scoped: bool = Field(
        ...,
        description="True when rows are restricted to the caller's accessible plants.",
    )


class LakehouseCatalog(BaseModel):
    """Catalog response listing every available table."""

    tables: list[LakehouseTableInfo]
    formats: list[str]
    rate_limit: str


class LakehouseExportMetadata(BaseModel):
    """Lightweight metadata returned with JSON exports for client-side sanity checks."""

    table: str
    format: str
    row_count: int
    columns: list[str]
    plant_filter: Optional[list[int]] = None
    truncated: bool = False
