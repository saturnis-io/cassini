"""Data entry API schemas for external system integration.

Schemas for programmatic sample submission via REST API with API key authentication.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DataEntryRequest(BaseModel):
    """Request schema for submitting a single sample via API.

    Attributes:
        characteristic_id: ID of the characteristic to submit data for.
        measurements: List of measurement values for the sample.
        timestamp: Optional sample timestamp (defaults to server time).
        batch_number: Optional batch/lot identifier.
        operator_id: Optional operator identifier.
        metadata: Optional additional metadata as key-value pairs.
    """

    characteristic_id: int = Field(..., description="ID of the characteristic")
    measurements: list[float] = Field(
        ...,
        min_length=1,
        max_length=25,
        description="List of measurement values",
    )
    timestamp: Optional[datetime] = Field(
        None, description="Sample timestamp (defaults to now)"
    )
    batch_number: Optional[str] = Field(None, description="Batch identifier")
    operator_id: Optional[str] = Field(None, description="Operator identifier")
    metadata: Optional[dict] = Field(None, description="Additional metadata")


class DataEntryResponse(BaseModel):
    """Response schema for successful sample submission.

    Attributes:
        sample_id: Database ID of the created sample.
        characteristic_id: ID of the characteristic the sample belongs to.
        timestamp: When the sample was recorded.
        mean: Calculated mean of the measurements (X-bar).
        range_value: Calculated range (max - min) for subgroups, None for n=1.
        zone: Zone classification (e.g., "zone_c_upper").
        in_control: True if no violations were triggered.
        violations: List of triggered violations with rule details.
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime
    mean: float
    range_value: Optional[float]
    zone: str
    in_control: bool
    violations: list[dict] = Field(default_factory=list)


class BatchEntryRequest(BaseModel):
    """Request schema for submitting multiple samples in a single request.

    Attributes:
        samples: List of individual sample requests to process.
    """

    samples: list[DataEntryRequest] = Field(..., max_length=1000)


class BatchEntryResponse(BaseModel):
    """Response schema for batch sample submission.

    Attributes:
        total: Total number of samples in the request.
        successful: Number of samples successfully processed.
        failed: Number of samples that failed processing.
        results: List of successful sample responses.
        errors: List of error messages for failed samples.
    """

    total: int
    successful: int
    failed: int
    results: list[DataEntryResponse]
    errors: list[str]


class AttributeDataEntryRequest(BaseModel):
    """Request schema for submitting an attribute sample.

    Attributes:
        characteristic_id: ID of the attribute characteristic.
        defect_count: Number of defects or defectives found.
        sample_size: Number of items inspected (required for p/np charts).
        units_inspected: Number of inspection units (required for u charts).
        batch_number: Optional batch/lot identifier.
        operator_id: Optional operator identifier.
    """

    characteristic_id: int = Field(..., description="ID of the attribute characteristic")
    defect_count: int = Field(..., ge=0, description="Number of defects or defectives")
    sample_size: Optional[int] = Field(None, ge=1, description="Items inspected (p/np charts)")
    units_inspected: Optional[int] = Field(None, ge=1, description="Inspection units (u chart)")
    batch_number: Optional[str] = Field(None, description="Batch identifier")
    operator_id: Optional[str] = Field(None, description="Operator identifier")


class AttributeDataEntryResponse(BaseModel):
    """Response schema for successful attribute sample submission.

    Attributes:
        sample_id: Database ID of the created sample.
        characteristic_id: ID of the characteristic.
        timestamp: When the sample was recorded.
        plotted_value: Computed statistic plotted on the chart.
        defect_count: Raw defect count from input.
        sample_size: Sample size used.
        in_control: True if no violations were triggered.
        center_line: Process center line.
        ucl: Upper control limit for this point.
        lcl: Lower control limit for this point.
        violations: List of triggered violations.
    """

    sample_id: int
    characteristic_id: int
    timestamp: datetime
    plotted_value: float
    defect_count: int
    sample_size: Optional[int]
    in_control: bool
    center_line: float
    ucl: float
    lcl: float
    violations: list[dict] = Field(default_factory=list)


class SchemaResponse(BaseModel):
    """Response schema for API documentation endpoint.

    Provides the expected request/response schemas for integrators.

    Attributes:
        single_sample: Schema info for single sample endpoint.
        batch_sample: Schema info for batch endpoint.
        authentication: Authentication requirements.
    """

    single_sample: dict
    batch_sample: dict
    authentication: dict
