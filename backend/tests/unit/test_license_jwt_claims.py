"""Tests for license JWT standard-claim verification (C7 fix).

The license JWT validation must verify standard claims iss="saturnis.io",
aud="cassini", and exp — not just the custom expires_at field. PyJWT does
NOT enforce expiration via expires_at; relying on the application-layer
field alone leaves the token verifiable indefinitely if attacker controls
the system clock.

A grace flag CASSINI_LICENSE_LEGACY_GRACE allows pre-migration tokens
without those claims to still be accepted (with a warning). When disabled,
strict mode rejects them.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from structlog.testing import capture_logs

from cassini.core.licensing import (
    LICENSE_AUDIENCE,
    LICENSE_ISSUER,
    LicenseService,
)


@pytest.fixture
def ed25519_keypair() -> tuple[bytes, bytes]:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    )
    public_pem = public_key.public_bytes(
        Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
    )
    return private_pem, public_pem


def _legacy_claims() -> dict:
    """Pre-migration claim set — no iss/aud/exp standard claims."""
    return {
        "sub": "legacy-customer",
        "tier": "pro",
        "max_plants": 5,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
    }


def _modern_claims(now_ts: int | None = None, expires_in: int = 365 * 86400) -> dict:
    """Post-migration claim set — includes iss/aud/exp."""
    now_ts = now_ts or int(datetime.now(timezone.utc).timestamp())
    return {
        "sub": "modern-customer",
        "tier": "enterprise",
        "max_plants": 10,
        "expires_at": datetime.fromtimestamp(
            now_ts + expires_in, tz=timezone.utc
        ).isoformat(),
        "iss": LICENSE_ISSUER,
        "aud": LICENSE_AUDIENCE,
        "iat": now_ts,
        "exp": now_ts + expires_in,
    }


def _write_token(tmp_path, claims: dict, private_pem: bytes) -> str:
    token = jwt.encode(claims, private_pem, algorithm="EdDSA")
    license_path = tmp_path / "license.key"
    license_path.write_text(token)
    return str(license_path)


class TestLegacyGrace:
    """Migration grace: tokens missing iss/aud/exp."""

    def test_missing_iss_aud_accepted_with_warning_when_grace_on(
        self, ed25519_keypair, tmp_path, monkeypatch
    ):
        """Legacy JWT without iss/aud/exp must be accepted under grace flag."""
        monkeypatch.setenv("CASSINI_LICENSE_LEGACY_GRACE", "true")
        private_pem, public_pem = ed25519_keypair
        path = _write_token(tmp_path, _legacy_claims(), private_pem)

        with capture_logs() as logs:
            svc = LicenseService(license_path=path, public_key=public_pem)

        assert svc.is_commercial is True
        assert svc.tier == "pro"
        # A warning must be logged so operators know to re-issue.
        grace_warnings = [
            entry for entry in logs
            if entry.get("event") == "license_legacy_claims_grace"
            and entry.get("log_level") == "warning"
        ]
        assert len(grace_warnings) >= 1, (
            f"Expected license_legacy_claims_grace warning; got: {logs}"
        )

    def test_missing_iss_aud_rejected_when_grace_off(
        self, ed25519_keypair, tmp_path, monkeypatch
    ):
        """When grace flag disabled, legacy JWT must fall back to community."""
        monkeypatch.setenv("CASSINI_LICENSE_LEGACY_GRACE", "false")
        private_pem, public_pem = ed25519_keypair
        path = _write_token(tmp_path, _legacy_claims(), private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        # Rejected token = falls back to community (consistent with other
        # validation failures elsewhere in LicenseService).
        assert svc.is_commercial is False
        assert svc.tier == "community"

    def test_grace_default_is_true(
        self, ed25519_keypair, tmp_path, monkeypatch
    ):
        """Default behaviour during migration window: grace flag ON."""
        monkeypatch.delenv("CASSINI_LICENSE_LEGACY_GRACE", raising=False)
        private_pem, public_pem = ed25519_keypair
        path = _write_token(tmp_path, _legacy_claims(), private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        assert svc.is_commercial is True


class TestStrictClaimVerification:
    """Strict mode: tokens with iss/aud/exp are verified against expected values."""

    def test_modern_jwt_with_correct_claims_accepted(
        self, ed25519_keypair, tmp_path, monkeypatch
    ):
        """A token with iss=saturnis.io and aud=cassini must validate."""
        monkeypatch.setenv("CASSINI_LICENSE_LEGACY_GRACE", "false")
        private_pem, public_pem = ed25519_keypair
        path = _write_token(tmp_path, _modern_claims(), private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        assert svc.is_commercial is True
        assert svc.tier == "enterprise"

    def test_wrong_audience_rejected(self, ed25519_keypair, tmp_path):
        """A token with aud='cassini-other' must fail validation."""
        private_pem, public_pem = ed25519_keypair
        claims = _modern_claims()
        claims["aud"] = "wrong-audience"
        path = _write_token(tmp_path, claims, private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        assert svc.is_commercial is False

    def test_wrong_issuer_rejected(self, ed25519_keypair, tmp_path):
        """A token with iss='evil.example.com' must fail validation."""
        private_pem, public_pem = ed25519_keypair
        claims = _modern_claims()
        claims["iss"] = "evil.example.com"
        path = _write_token(tmp_path, claims, private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        assert svc.is_commercial is False

    def test_expired_jwt_rejected_via_exp_claim(
        self, ed25519_keypair, tmp_path
    ):
        """A JWT with past `exp` must be rejected by PyJWT itself.

        This is the core C7 protection: PyJWT enforces the standard `exp`
        claim. The legacy `expires_at` field-only check left tokens
        verifiable past their expiry if PyJWT didn't enforce `exp`.
        """
        private_pem, public_pem = ed25519_keypair
        # exp 1 hour in the past
        past_ts = int(datetime.now(timezone.utc).timestamp()) - 3600
        claims = _modern_claims(now_ts=past_ts - 86400, expires_in=86400)
        # Sanity: exp is in the past
        assert claims["exp"] < datetime.now(timezone.utc).timestamp()

        path = _write_token(tmp_path, claims, private_pem)

        svc = LicenseService(license_path=path, public_key=public_pem)
        # Expired-by-PyJWT token = rejected outright = community fallback.
        assert svc.is_commercial is False
        assert svc.tier == "community"
