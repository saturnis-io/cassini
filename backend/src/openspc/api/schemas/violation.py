"""Pydantic schemas for Violation operations.

Schemas for Nelson Rules violation tracking and acknowledgment.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ViolationResponse(BaseModel):
    """Schema for violation response.

    Attributes:
        id: Unique identifier
        sample_id: ID of the sample that triggered the violation
        rule_id: Nelson Rule ID (1-8)
        rule_name: Human-readable rule name
        severity: Violation severity (WARNING or CRITICAL)
        acknowledged: Whether the violation has been acknowledged
        ack_user: User who acknowledged the violation
        ack_reason: Reason provided for acknowledgment
        ack_timestamp: When the violation was acknowledged
        created_at: When the violation was created
        characteristic_id: ID of the characteristic
        characteristic_name: Name of the characteristic
        hierarchy_path: Path in hierarchy (e.g., "Plant > Line > Machine")
    """

    id: int
    sample_id: int
    rule_id: int
    rule_name: str
    severity: str
    acknowledged: bool
    ack_user: str | None
    ack_reason: str | None
    ack_timestamp: datetime | None
    created_at: datetime | None = None
    characteristic_id: int | None = None
    characteristic_name: str | None = None
    hierarchy_path: str | None = None

    model_config = ConfigDict(from_attributes=True)


class ViolationAcknowledge(BaseModel):
    """Schema for acknowledging a violation.

    Attributes:
        user: User acknowledging the violation
        reason: Explanation for the violation or corrective action taken
        exclude_sample: Whether to also exclude the sample from control calculations
    """

    user: str = Field(..., min_length=1, description="User acknowledging the violation")
    reason: str = Field(..., min_length=1, description="Reason or corrective action")
    exclude_sample: bool = Field(
        default=False,
        description="Also exclude the sample from control limit calculations",
    )


class ViolationStats(BaseModel):
    """Schema for violation statistics.

    Aggregated violation counts for dashboards and reporting.

    Attributes:
        total: Total number of violations
        unacknowledged: Number of unacknowledged violations
        by_rule: Count of violations per Nelson Rule ID
        by_severity: Count of violations per severity level
    """

    total: int
    unacknowledged: int
    by_rule: dict[int, int] = Field(
        default_factory=dict,
        description="Violations grouped by rule ID",
    )
    by_severity: dict[str, int] = Field(
        default_factory=dict,
        description="Violations grouped by severity",
    )


class AcknowledgeResultItem(BaseModel):
    """Schema for individual acknowledgment result in batch operations.

    Attributes:
        violation_id: ID of the violation
        success: Whether the acknowledgment succeeded
        error: Error message if acknowledgment failed
    """

    violation_id: int
    success: bool
    error: str | None = None


class BatchAcknowledgeRequest(BaseModel):
    """Schema for batch acknowledgment request.

    Attributes:
        violation_ids: List of violation IDs to acknowledge
        user: User acknowledging the violations
        reason: Reason for acknowledgment
        exclude_sample: Whether to exclude associated samples
    """

    violation_ids: list[int] = Field(..., min_length=1)
    user: str = Field(..., min_length=1)
    reason: str = Field(..., min_length=1)
    exclude_sample: bool = Field(default=False)


class BatchAcknowledgeResult(BaseModel):
    """Schema for batch acknowledgment operation results.

    Provides summary and detailed results for batch acknowledgment.

    Attributes:
        total: Total number of violations in the batch
        successful: Number of successfully acknowledged violations
        failed: Number of failed acknowledgments
        results: Detailed results for each violation
    """

    total: int
    successful: int
    failed: int
    results: list[AcknowledgeResultItem]
