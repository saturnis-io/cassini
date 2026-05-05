"""Tests for license endpoint error message safety (H4 fix).

The license endpoints previously surfaced raw exception text via `str(e)`,
leaking internal details (file paths, JWT decode failure reasons) to API
clients. Per project rule: never pass raw exception messages to API clients.
Log via structlog server-side, return generic messages.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from structlog.testing import capture_logs


class TestActivateEndpointErrorMessage:
    """POST /api/v1/license/activate must not leak exception text on failure."""

    @pytest.mark.asyncio
    async def test_activate_endpoint_returns_generic_message(self):
        """A ValueError from activate_from_token must return a generic 400."""
        from cassini.api.v1.license import activate_license
        from cassini.api.schemas.license import LicenseUploadRequest

        # Mock license service that raises with sensitive internal text.
        license_service = MagicMock()
        license_service.activate_from_token = MagicMock(
            side_effect=ValueError(
                "License signature decode failed at "
                "/internal/path/license.key: bad EdDSA bytes"
            )
        )

        request = MagicMock()
        request.state = MagicMock()
        body = LicenseUploadRequest(key="malformed.jwt.token")

        with pytest.raises(HTTPException) as exc_info:
            await activate_license(
                body=body,
                request=request,
                session=AsyncMock(),
                license_service=license_service,
                _user=MagicMock(),
            )

        assert exc_info.value.status_code == 400
        # Generic message — no internal path or raw exception text leaked.
        assert exc_info.value.detail == "License could not be activated"
        assert "/internal/path" not in exc_info.value.detail
        assert "EdDSA" not in exc_info.value.detail
        assert "decode" not in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_activate_endpoint_logs_full_error_server_side(self):
        """The full exception detail must still be logged for ops debugging."""
        from cassini.api.v1.license import activate_license
        from cassini.api.schemas.license import LicenseUploadRequest

        license_service = MagicMock()
        sensitive_msg = "JWT decode error: invalid base64 in segment 1"
        license_service.activate_from_token = MagicMock(
            side_effect=ValueError(sensitive_msg)
        )

        request = MagicMock()
        request.state = MagicMock()
        body = LicenseUploadRequest(key="bad.token")

        with capture_logs() as logs:
            with pytest.raises(HTTPException):
                await activate_license(
                    body=body,
                    request=request,
                    session=AsyncMock(),
                    license_service=license_service,
                    _user=MagicMock(),
                )

        # Server-side log must include the full sensitive detail (for ops).
        activation_failures = [
            entry for entry in logs
            if entry.get("event") == "license_activation_failed"
        ]
        assert len(activation_failures) == 1, (
            f"Expected one license_activation_failed log entry; got: {logs}"
        )
        # The structured log must include the original error_message for triage.
        assert activation_failures[0].get("error_message") == sensitive_msg
        assert activation_failures[0].get("error_type") == "ValueError"


class TestActivationFileEndpointErrorMessage:
    """GET /activation-file must not leak exception text on failure."""

    @pytest.mark.asyncio
    async def test_activation_file_returns_generic_message(self):
        """A ValueError from generate_activation_file returns a generic 400."""
        from cassini.api.v1.license import get_activation_file

        license_service = MagicMock()
        license_service.generate_activation_file = MagicMock(
            side_effect=ValueError(
                "internal-state: instance_id is None for license sub=acme"
            )
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_activation_file(
                license_service=license_service,
                _user=MagicMock(),
            )

        assert exc_info.value.status_code == 400
        assert exc_info.value.detail == "Activation file could not be generated"
        assert "internal-state" not in exc_info.value.detail
        assert "acme" not in exc_info.value.detail
