"""Validates sample metadata against a characteristic's custom field schema (I8).

Performs type coercion, required-field checks, default application, and
unknown-key stripping. Used by all three ingestion paths (Manual, MQTT, OPC-UA).
"""

import math

import structlog

logger = structlog.get_logger(__name__)


MAX_STRING_VALUE_LENGTH = 1000


def validate_metadata(
    metadata: dict | None,
    schema: list[dict] | None,
    *,
    strict: bool = False,
) -> dict:
    """Validate and normalize metadata against a custom fields schema.

    Args:
        metadata: Raw metadata dict from the ingestion source. May be None.
        schema: The characteristic's custom_fields_schema (list of field defs).
                May be None (no schema defined = pass-through).
        strict: If True, raise ValueError on missing required fields (manual entry).
                If False, log warning and continue (automated ingestion).

    Returns:
        Validated metadata dict with defaults applied, unknowns stripped,
        and types coerced. Returns empty dict if both inputs are None.

    Raises:
        ValueError: In strict mode, if a required field is missing with no default.
    """
    if not schema:
        # No schema defined — return metadata as-is (or empty dict)
        return metadata or {}

    result: dict = {}
    raw = metadata or {}

    # Build a lookup for fast field access
    field_defs = {f["name"]: f for f in schema if isinstance(f, dict) and "name" in f}

    for name, field_def in field_defs.items():
        field_type = field_def.get("field_type", "string")
        required = field_def.get("required", False)
        default_value = field_def.get("default_value")

        if name in raw:
            value = raw[name]
            coerced = _coerce_value(value, field_type)
            if coerced is not None:
                result[name] = coerced
            elif required:
                logger.warning(
                    "metadata_coercion_failed",
                    field=name,
                    value=repr(value),
                    expected_type=field_type,
                )
                # Use default if available, otherwise skip
                if default_value is not None:
                    result[name] = default_value
                elif strict:
                    raise ValueError(f"Required metadata field '{name}' has invalid value")
            # else: skip non-required field with bad value
        elif required:
            if default_value is not None:
                result[name] = default_value
            elif strict:
                raise ValueError(f"Required metadata field '{name}' is missing")
            else:
                logger.warning("metadata_required_field_missing", field=name)
        elif default_value is not None:
            result[name] = default_value

    return result


def _coerce_value(value: object, field_type: str) -> object | None:
    """Attempt to coerce a value to the expected type.

    Returns None if coercion fails.
    """
    if value is None:
        return None

    if field_type == "string":
        s = str(value)
        if len(s) > MAX_STRING_VALUE_LENGTH:
            return None  # Reject oversized strings
        return s

    if field_type == "number":
        if isinstance(value, bool):
            return None  # bool is subclass of int; reject
        if isinstance(value, (int, float)):
            v = float(value)
            if math.isnan(v) or math.isinf(v):
                return None  # NaN/Infinity not valid JSON (RFC 7159)
            return v
        if isinstance(value, str):
            try:
                v = float(value)
                if math.isnan(v) or math.isinf(v):
                    return None
                return v
            except ValueError:
                return None
        return None

    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            if value.lower() in ("true", "1", "yes"):
                return True
            if value.lower() in ("false", "0", "no"):
                return False
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return bool(value)
        return None

    return None
