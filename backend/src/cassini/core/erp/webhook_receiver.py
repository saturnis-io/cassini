"""Inbound webhook receiver for ERP/LIMS push integration.

Validates inbound webhooks using HMAC-SHA256 (constant-time comparison),
parses the payload, and applies field mappings to create SPC data.
"""

import hashlib
import hmac
import json
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


class WebhookReceiver:
    """Validates and processes inbound ERP/LIMS webhooks.

    Args:
        hmac_secret: The HMAC-SHA256 secret for this connector
    """

    def __init__(self, hmac_secret: str) -> None:
        self._hmac_secret = hmac_secret.encode("utf-8") if isinstance(hmac_secret, str) else hmac_secret

    def validate_signature(self, payload: bytes, signature: str) -> bool:
        """Validate HMAC-SHA256 signature using constant-time comparison.

        Args:
            payload: Raw request body bytes
            signature: Signature from X-Hub-Signature-256 header (hex digest, optionally prefixed with 'sha256=')

        Returns:
            True if signature is valid
        """
        expected = hmac.new(self._hmac_secret, payload, hashlib.sha256).hexdigest()

        # Strip optional 'sha256=' prefix
        actual = signature
        if actual.startswith("sha256="):
            actual = actual[7:]

        return hmac.compare_digest(expected, actual)

    def parse_payload(self, raw_body: bytes) -> dict[str, Any]:
        """Parse the webhook payload as JSON.

        Args:
            raw_body: Raw request body bytes

        Returns:
            Parsed JSON dict

        Raises:
            ValueError: If payload is not valid JSON
        """
        try:
            return json.loads(raw_body)
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON payload")

    def apply_field_mappings(
        self, payload: dict[str, Any], mappings: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """Apply field mappings to extract and transform data from the webhook payload.

        Args:
            payload: Parsed webhook payload
            mappings: List of field mapping configs with keys:
                - erp_field_path: JSONPath expression for source field
                - openspc_entity: Target entity type
                - openspc_field: Target field name
                - transform: Optional transform config (e.g., {"multiply": 25.4})

        Returns:
            Dict keyed by openspc_entity with mapped field values
        """
        result: dict[str, dict[str, Any]] = {}

        for mapping in mappings:
            erp_path = mapping.get("erp_field_path", "")
            openspc_entity = mapping.get("openspc_entity", "")
            openspc_field = mapping.get("openspc_field", "")
            transform_config = mapping.get("transform")

            if not erp_path or not openspc_entity or not openspc_field:
                continue

            # Extract value using JSONPath
            value = self._extract_value(payload, erp_path)
            if value is None:
                continue

            # Apply transform if configured
            if transform_config:
                value = self._apply_transform(value, transform_config)

            if openspc_entity not in result:
                result[openspc_entity] = {}
            result[openspc_entity][openspc_field] = value

        return result

    def _extract_value(self, data: dict[str, Any], path: str) -> Any:
        """Extract a value from nested dict using JSONPath-like expression.

        Supports both jsonpath-ng expressions and simple dot notation.
        """
        # Try jsonpath-ng first
        try:
            from jsonpath_ng import parse
            expr = parse(path)
            matches = expr.find(data)
            if matches:
                return matches[0].value
        except ImportError:
            pass
        except Exception:
            pass

        # Fallback: simple dot notation (a.b.c)
        parts = path.replace("$.", "").split(".")
        current = data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def _apply_transform(self, value: Any, transform: dict[str, Any] | str) -> Any:
        """Apply a transformation to a value.

        Supported transforms:
        - {"multiply": factor} — multiply numeric value
        - {"divide": divisor} — divide numeric value
        - {"round": decimals} — round numeric value
        - {"map": {"old": "new"}} — map string values
        """
        if isinstance(transform, str):
            try:
                transform = json.loads(transform)
            except (json.JSONDecodeError, TypeError):
                return value

        if not isinstance(transform, dict):
            return value

        if "multiply" in transform:
            try:
                return float(value) * float(transform["multiply"])
            except (ValueError, TypeError):
                return value

        if "divide" in transform:
            try:
                divisor = float(transform["divide"])
                if divisor == 0:
                    return value
                return float(value) / divisor
            except (ValueError, TypeError):
                return value

        if "round" in transform:
            try:
                return round(float(value), int(transform["round"]))
            except (ValueError, TypeError):
                return value

        if "map" in transform and isinstance(transform["map"], dict):
            return transform["map"].get(str(value), value)

        return value
