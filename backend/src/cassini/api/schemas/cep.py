"""Pydantic schemas for the CEP (Complex Event Processing) rule DSL.

The DSL combines per-characteristic Nelson-style conditions across a
sliding time window. Each rule fires a violation when EVERY condition
has been satisfied at least once within ``window`` seconds.

Example YAML::

    name: shaft-bore-mismatch
    description: Both shaft OD and bore ID drift in opposite directions in 30s
    window: 30s
    conditions:
      - characteristic: shaft.OD
        rule: above_mean_consecutive
        count: 5
      - characteristic: bore.ID
        rule: below_mean_consecutive
        count: 5
    action:
      violation: ASSEMBLY_DRIFT_RISK
      severity: high

Rule kinds are deliberately small (mirroring Nelson semantics): we want
operators to think in well-known terms rather than learning a query
language. New rule kinds get added here AND in
``cassini.core.cep.conditions``.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# --------------------------------------------------------------------------
# Enumerations
# --------------------------------------------------------------------------


class CepConditionKind(str, Enum):
    """Available per-characteristic condition kinds.

    Each kind mirrors a Nelson rule shape so SPC engineers can reason
    about CEP rules with the same vocabulary they already use.
    """

    above_mean_consecutive = "above_mean_consecutive"
    below_mean_consecutive = "below_mean_consecutive"
    above_value = "above_value"
    below_value = "below_value"
    out_of_control = "out_of_control"
    increasing = "increasing"
    decreasing = "decreasing"


class CepSeverity(str, Enum):
    """Match severity — drives downstream notification routing."""

    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# --------------------------------------------------------------------------
# Window parsing
# --------------------------------------------------------------------------


_DURATION_RE = re.compile(
    r"^\s*(?P<value>\d+(?:\.\d+)?)\s*(?P<unit>ms|s|m|h)\s*$",
    re.IGNORECASE,
)
_UNIT_TO_SECONDS = {"ms": 0.001, "s": 1.0, "m": 60.0, "h": 3600.0}


def parse_window_seconds(window: Any) -> float:
    """Parse a window string (``"30s"``, ``"5m"``, ``"1h"``) into seconds.

    Accepts a numeric value as a shortcut for seconds.

    Raises:
        ValueError: If the string is malformed or non-positive.
    """
    if isinstance(window, (int, float)):
        if window <= 0:
            raise ValueError("window must be positive")
        return float(window)
    if not isinstance(window, str):
        raise ValueError(f"window must be a string or number, got {type(window).__name__}")
    match = _DURATION_RE.match(window)
    if not match:
        raise ValueError(
            f"window {window!r} is not a valid duration "
            f"(expected forms: '30s', '5m', '1h', '500ms')"
        )
    value = float(match.group("value"))
    unit = match.group("unit").lower()
    seconds = value * _UNIT_TO_SECONDS[unit]
    if seconds <= 0:
        raise ValueError("window must be positive")
    return seconds


# --------------------------------------------------------------------------
# Inner models
# --------------------------------------------------------------------------


class CepCondition(BaseModel):
    """Single per-characteristic predicate within a CEP pattern.

    Each condition references a characteristic by its ``hierarchy_path .
    name`` form (the same display the UI uses). The engine resolves the
    path at evaluation time, so renames are picked up without a rule
    rewrite.
    """

    model_config = ConfigDict(extra="forbid")

    characteristic: str = Field(
        ..., min_length=1, max_length=255,
        description="Characteristic identifier (typically 'hierarchy_path.name').",
    )
    rule: CepConditionKind = Field(
        ...,
        description="Condition kind — see CepConditionKind for full list.",
    )
    count: int = Field(
        1, ge=1, le=1000,
        description="Number of consecutive samples that must satisfy the predicate.",
    )
    threshold: Optional[float] = Field(
        None,
        description="Comparison value for value-based conditions (above_value/below_value).",
    )

    @model_validator(mode="after")
    def _check_threshold_required(self) -> "CepCondition":
        needs_threshold = {
            CepConditionKind.above_value,
            CepConditionKind.below_value,
        }
        if self.rule in needs_threshold and self.threshold is None:
            raise ValueError(
                f"rule '{self.rule.value}' requires a 'threshold' field"
            )
        return self


class CepAction(BaseModel):
    """Outcome of a matched pattern — one violation per match."""

    model_config = ConfigDict(extra="forbid")

    violation: str = Field(
        ..., min_length=1, max_length=120,
        description="Stable code stored on the violation (e.g. 'ASSEMBLY_DRIFT_RISK').",
    )
    severity: CepSeverity = Field(
        CepSeverity.medium,
        description="Severity level — drives notification routing.",
    )
    message: Optional[str] = Field(
        None, max_length=500,
        description="Optional operator-facing message included in the violation detail.",
    )


# --------------------------------------------------------------------------
# Top-level rule schema
# --------------------------------------------------------------------------


class CepRuleSpec(BaseModel):
    """Top-level schema for a parsed CEP rule definition.

    This is what users author in YAML. The DB column ``yaml_text`` stores
    the original source; ``parsed_json`` caches ``model_dump_json()`` of
    this schema for hot-path access by the engine.
    """

    model_config = ConfigDict(extra="forbid")

    name: str = Field(..., min_length=1, max_length=120, pattern=r"^[A-Za-z0-9 _\-\.]+$")
    description: Optional[str] = Field(None, max_length=500)
    window: str = Field(
        ...,
        description="Sliding window length (e.g. '30s', '5m').",
    )
    conditions: list[CepCondition] = Field(..., min_length=1, max_length=20)
    action: CepAction
    enabled: bool = Field(
        True,
        description="Optional in YAML — DB column overrides this at runtime.",
    )

    @field_validator("window")
    @classmethod
    def _validate_window(cls, v: str) -> str:
        # Surface a clean error pointing at the offending field
        parse_window_seconds(v)
        return v

    @property
    def window_seconds(self) -> float:
        """Resolve ``window`` to seconds (validated at parse time)."""
        return parse_window_seconds(self.window)


# --------------------------------------------------------------------------
# REST request / response models
# --------------------------------------------------------------------------


class CepRuleCreate(BaseModel):
    """Payload for creating a CEP rule.

    ``yaml_text`` is the source-of-truth; the API parses it through
    ``CepRuleSpec`` and stores both the original text and the cached
    JSON form.
    """

    model_config = ConfigDict(extra="forbid")

    plant_id: int = Field(..., ge=1)
    yaml_text: str = Field(..., min_length=1, max_length=20_000)
    enabled: bool = True


class CepRuleUpdate(BaseModel):
    """Partial-update payload for an existing CEP rule."""

    model_config = ConfigDict(extra="forbid")

    yaml_text: Optional[str] = Field(None, min_length=1, max_length=20_000)
    enabled: Optional[bool] = None


class CepRuleResponse(BaseModel):
    """Response model returned by all CEP rule endpoints."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    plant_id: int
    name: str
    description: Optional[str]
    yaml_text: str
    enabled: bool
    parsed: CepRuleSpec
    created_at: Any
    updated_at: Any


class CepRuleValidateRequest(BaseModel):
    """Request payload for the standalone YAML validation endpoint."""

    model_config = ConfigDict(extra="forbid")

    yaml_text: str = Field(..., min_length=1, max_length=20_000)


class CepRuleValidateResponse(BaseModel):
    """Response payload for the standalone YAML validation endpoint."""

    valid: bool
    errors: list[dict[str, Any]] = Field(default_factory=list)
    parsed: Optional[CepRuleSpec] = None
