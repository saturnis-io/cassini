"""Inbound webhook receiver for ERP/LIMS push integration.

Validates inbound webhooks using HMAC-SHA256 (constant-time comparison),
parses the payload, and applies field mappings to create SPC data.

Replay protection (A6-H2):
  - Senders MUST emit ``X-Webhook-Timestamp`` (Unix epoch seconds) alongside
    ``X-Hub-Signature-256``.
  - The signature is computed over ``f"{timestamp}.{raw_body}"`` to prevent
    a captured payload from being replayed with a different timestamp.
  - The receiver rejects timestamps outside ``+/- WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS``
    of server time (default 300s).
  - A short-TTL nonce cache (request hash) blocks duplicate deliveries
    inside the tolerance window.
  - When ``CASSINI_ERP_WEBHOOK_LEGACY_GRACE=true`` (default during the
    migration period) requests without a timestamp header still validate
    against the body-only signature with a structured warning. The flag
    will flip to False in the next minor release.
"""

import hashlib
import hmac
import json
import time
from collections import OrderedDict
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Tolerance window for the X-Webhook-Timestamp header (seconds). Anything
# outside +/- this many seconds of server time is rejected as stale or
# clock-skewed.
WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300

# Nonce cache size cap. If a sender goes berserk we still want a bounded
# memory footprint — oldest entries are evicted FIFO.
_NONCE_CACHE_MAX_ENTRIES = 1024

# Module-level nonce cache: {nonce_hex: expires_at_epoch}. Process-local —
# in cluster mode each node has its own cache, which is acceptable because
# the same captured payload would still need to land on the same node within
# the 5-minute window to bypass detection. Future hardening can move this
# into the broker if needed.
_seen_nonces: "OrderedDict[str, float]" = OrderedDict()


def _evict_expired_nonces(now: float) -> None:
    """Drop entries whose TTL has elapsed."""
    expired = [k for k, exp in _seen_nonces.items() if exp <= now]
    for key in expired:
        _seen_nonces.pop(key, None)


def _record_nonce(nonce: str, now: float) -> None:
    """Add a nonce with TTL = tolerance window."""
    # Evict if at capacity
    while len(_seen_nonces) >= _NONCE_CACHE_MAX_ENTRIES:
        _seen_nonces.popitem(last=False)
    _seen_nonces[nonce] = now + WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS


def _is_nonce_seen(nonce: str, now: float) -> bool:
    """Check whether the nonce was seen within the active window."""
    _evict_expired_nonces(now)
    return nonce in _seen_nonces


def reset_nonce_cache() -> None:
    """Test helper: clear the in-memory nonce cache."""
    _seen_nonces.clear()


class WebhookReplayError(ValueError):
    """Raised when a webhook fails replay-protection checks."""


class WebhookReceiver:
    """Validates and processes inbound ERP/LIMS webhooks.

    Args:
        hmac_secret: The HMAC-SHA256 secret for this connector
    """

    def __init__(self, hmac_secret: str) -> None:
        self._hmac_secret = hmac_secret.encode("utf-8") if isinstance(hmac_secret, str) else hmac_secret

    def validate_signature(self, payload: bytes, signature: str) -> bool:
        """Validate HMAC-SHA256 over the raw body only (legacy path).

        Used by the legacy-grace fallback and by callers that intentionally
        sign just the body. New integrations should use
        :meth:`validate_signature_with_timestamp` instead.

        Args:
            payload: Raw request body bytes
            signature: Signature from X-Hub-Signature-256 header (hex digest,
                optionally prefixed with 'sha256=')

        Returns:
            True if signature is valid
        """
        expected = hmac.new(self._hmac_secret, payload, hashlib.sha256).hexdigest()

        # Strip optional 'sha256=' prefix
        actual = signature
        if actual.startswith("sha256="):
            actual = actual[7:]

        return hmac.compare_digest(expected, actual)

    def validate_signature_with_timestamp(
        self,
        payload: bytes,
        signature: str,
        timestamp: str,
        *,
        now: float | None = None,
        tolerance_seconds: int = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
    ) -> bool:
        """Validate timestamp-bound HMAC-SHA256 signature.

        The signed string is ``f"{timestamp}.{raw_body}"`` (matching Stripe's
        construction). Senders must therefore include the timestamp in the
        HMAC input, not just send it alongside.

        Args:
            payload: Raw request body bytes.
            signature: Hex digest from X-Hub-Signature-256 (with optional
                'sha256=' prefix).
            timestamp: Unix epoch seconds as a string (X-Webhook-Timestamp).
            now: Override server time for testing.
            tolerance_seconds: Acceptance window on either side of ``now``.

        Returns:
            True if the timestamp is within the window AND the signature
            matches the timestamped payload.
        """
        ts_int = self._parse_timestamp(timestamp)
        if ts_int is None:
            return False

        current = now if now is not None else time.time()
        if abs(current - ts_int) > tolerance_seconds:
            return False

        signed_payload = f"{ts_int}.".encode("utf-8") + payload
        expected = hmac.new(
            self._hmac_secret, signed_payload, hashlib.sha256
        ).hexdigest()

        actual = signature
        if actual.startswith("sha256="):
            actual = actual[7:]

        return hmac.compare_digest(expected, actual)

    @staticmethod
    def _parse_timestamp(value: str | None) -> int | None:
        """Parse an X-Webhook-Timestamp header value.

        Accepts plain integer seconds. Returns None on any parse failure.
        """
        if not value:
            return None
        try:
            return int(str(value).strip())
        except (ValueError, TypeError):
            return None

    def compute_nonce(
        self,
        payload: bytes,
        signature: str,
        timestamp: str,
    ) -> str:
        """Compute a stable cache key for replay tracking.

        Hashes the (timestamp, signature) pair so a captured request cannot
        be replayed verbatim within the tolerance window. The signature is
        already content-bound, so collisions are vanishingly improbable.
        """
        digest = hashlib.sha256()
        digest.update(str(timestamp).encode("utf-8"))
        digest.update(b"|")
        # Strip optional 'sha256=' prefix to canonicalize
        sig_clean = signature
        if sig_clean.startswith("sha256="):
            sig_clean = sig_clean[7:]
        digest.update(sig_clean.encode("utf-8"))
        # Mix payload length so the same (ts, sig) pair on different bodies
        # — which should be impossible — at least produces distinct nonces.
        digest.update(b"|")
        digest.update(str(len(payload)).encode("utf-8"))
        return digest.hexdigest()

    @staticmethod
    def is_nonce_seen(nonce: str, *, now: float | None = None) -> bool:
        """Check whether a nonce was already accepted in the active window."""
        return _is_nonce_seen(nonce, now if now is not None else time.time())

    @staticmethod
    def record_nonce(nonce: str, *, now: float | None = None) -> None:
        """Record that a nonce was accepted (for replay rejection)."""
        _record_nonce(nonce, now if now is not None else time.time())

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
