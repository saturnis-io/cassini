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
