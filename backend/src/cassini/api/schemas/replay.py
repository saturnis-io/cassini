"""Pydantic schemas for the time-travel SPC replay endpoint.

The replay snapshot is a read-only reconstruction of the historical state of
a control chart at a specific moment in time. Values are derived by walking
the hash-chained audit log and applying create/update/delete events up to
the target timestamp.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReplayCharacteristicConfig(BaseModel):
    """Subset of Characteristic fields relevant to a control chart replay.

    Only fields that affect chart rendering or rule evaluation are captured.
    Audit detail fields (e.g. limits_calc_params, distribution_params) are
    omitted because the engine that consumed them has already computed the
    stored UCL/LCL/center_line snapshot we return.
    """

    id: int
    name: str
    description: Optional[str] = None
    chart_type: Optional[str] = None
    subgroup_size: int
    subgroup_mode: str
    target_value: Optional[float] = None
    usl: Optional[float] = None
    lsl: Optional[float] = None
    ucl: Optional[float] = None
    lcl: Optional[float] = None
    stored_sigma: Optional[float] = None
    stored_center_line: Optional[float] = None
    decimal_precision: int
    data_type: str
    attribute_chart_type: Optional[str] = None
    use_laney_correction: bool
    short_run_mode: Optional[str] = None
    sigma_method: Optional[str] = None
    limits_frozen: bool
    limits_frozen_at: Optional[datetime] = None


class ReplayRule(BaseModel):
    """A Nelson rule configuration as it stood at the replay timestamp."""

    rule_id: int
    is_enabled: bool
    require_acknowledgement: bool
    parameters: Optional[str] = None


class ReplaySample(BaseModel):
    """A sample row, filtered to before the replay timestamp."""

    id: int
    timestamp: datetime
    batch_number: Optional[str] = None
    operator_id: Optional[str] = None
    is_excluded: bool
    actual_n: int


class ReplaySignatureState(BaseModel):
    """Snapshot of an electronic signature as visible at the replay timestamp.

    Fields mirror :class:`ElectronicSignature` minus mutable state that may
    have changed between the signature's timestamp and the requested replay
    timestamp.  ``is_valid_at_replay`` reports whether the signature was
    valid at the replay moment (signed before, not yet invalidated).
    """

    id: int
    timestamp: datetime
    username: str
    full_name: Optional[str] = None
    meaning_code: str
    meaning_display: str
    resource_hash: str
    is_valid_at_replay: bool
    invalidated_at: Optional[datetime] = None
    invalidated_reason: Optional[str] = None


class ReplaySnapshot(BaseModel):
    """Read-only reconstruction of a resource's state at a historical moment.

    The snapshot is built by applying audit log events up to the requested
    timestamp.  Per 21 CFR Part 11 the replay itself is not stored as a new
    artifact — only the action of viewing it is audit-logged.
    """

    resource_type: str = Field(..., description="Resource type, e.g. 'characteristic'")
    resource_id: int
    requested_at: datetime = Field(
        ..., description="The historical timestamp the caller asked to replay"
    )
    generated_at: datetime = Field(
        ..., description="When this snapshot was reconstructed (server clock)"
    )
    plant_id: int = Field(..., description="Plant the resource belongs to")
    characteristic: ReplayCharacteristicConfig
    rules: list[ReplayRule]
    samples: list[ReplaySample]
    signatures: list[ReplaySignatureState]
    audit_event_count: int = Field(
        ..., description="How many audit events were replayed to build this snapshot"
    )
    earliest_known_state_at: Optional[datetime] = Field(
        None,
        description=(
            "Timestamp of the earliest audit event we walked. NULL when no "
            "audit history pre-dates the requested timestamp — caller should "
            "treat the snapshot as 'best-known' rather than authoritative."
        ),
    )
