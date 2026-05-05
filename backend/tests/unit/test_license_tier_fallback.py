"""Tests for license tier fallback (C6 fix).

A license JWT containing an unrecognized `tier` value MUST fail closed
to COMMUNITY (most restrictive), never escalate to ENTERPRISE. The previous
implementation defaulted unknown tiers to ENTERPRISE — a fail-open security
bug exploitable via typo or attacker-crafted license payloads.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
import pytest
import structlog
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)
from structlog.testing import capture_logs

from cassini.core.licensing import (
    ENTERPRISE_FEATURES,
    PRO_FEATURES,
    LicenseService,
    LicenseTier,
)


@pytest.fixture
def ed25519_keypair() -> tuple[bytes, bytes]:
    """Generate a test Ed25519 keypair as PEM bytes."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(
        Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
    )
    public_pem = public_key.public_bytes(
        Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
    )
    return private_pem, public_pem


@pytest.fixture
def make_license(ed25519_keypair, tmp_path):
    """Factory to create signed license JWT files."""
    private_pem, public_pem = ed25519_keypair

    def _make(claims: dict, filename: str = "license.key"):
        token = jwt.encode(claims, private_pem, algorithm="EdDSA")
        license_path = tmp_path / filename
        license_path.write_text(token)
        return license_path, public_pem

    return _make


def _valid_claims(tier: str) -> dict:
    """Standard valid license claims with the given tier value."""
    return {
        "sub": "acme",
        "tier": tier,
        "max_plants": 5,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
    }


class TestUnknownTierFallback:
    """C6: unknown tier must fail closed to COMMUNITY, never to ENTERPRISE."""

    def test_unknown_tier_falls_to_community(self, make_license):
        """A JWT with tier='hyperdrive' must resolve to community, not enterprise."""
        path, pub = make_license(_valid_claims("hyperdrive"))
        svc = LicenseService(license_path=str(path), public_key=pub)
        # The JWT itself is signed correctly, so is_commercial=True (license is valid)
        # But the tier accessor must fail closed when the value is unrecognized.
        assert svc.tier == LicenseTier.COMMUNITY.value
        assert svc.tier != LicenseTier.ENTERPRISE.value

    def test_unknown_tier_grants_no_features(self, make_license):
        """An unknown tier must grant ZERO paid features (defense in depth)."""
        path, pub = make_license(_valid_claims("custom-tier"))
        svc = LicenseService(license_path=str(path), public_key=pub)
        for feature in PRO_FEATURES | ENTERPRISE_FEATURES:
            assert svc.has_feature(feature) is False, (
                f"Unknown tier must NOT grant feature: {feature}"
            )

    def test_unknown_tier_logs_warning(self, make_license):
        """Unknown tier must emit a security warning so operators notice."""
        path, pub = make_license(_valid_claims("attacker-injected"))
        svc = LicenseService(license_path=str(path), public_key=pub)

        # structlog's testing helper captures bound-logger output regardless
        # of the global processor configuration.
        with capture_logs() as logs:
            _ = svc.tier
            _ = svc.tier  # idempotent

        unknown_tier_warnings = [
            entry for entry in logs
            if entry.get("event") == "license_unknown_tier"
            and entry.get("log_level") == "warning"
        ]
        assert len(unknown_tier_warnings) >= 1, (
            f"Expected license_unknown_tier warning; got entries: {logs}"
        )
        # Must include the offending tier value for operator triage.
        assert unknown_tier_warnings[0].get("tier") == "attacker-injected"

    def test_typo_tier_does_not_escalate(self, make_license):
        """A common typo like 'enterprize' must NOT be treated as enterprise."""
        path, pub = make_license(_valid_claims("enterprize"))
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_enterprise is False
        assert svc.is_pro is False
        assert svc.tier == LicenseTier.COMMUNITY.value

    def test_empty_tier_does_not_escalate(self, make_license):
        """An empty tier value must NOT be treated as enterprise."""
        path, pub = make_license(_valid_claims(""))
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_enterprise is False
        assert svc.tier == LicenseTier.COMMUNITY.value

    def test_known_tiers_still_work(self, make_license):
        """Regression guard: known tiers must continue to resolve correctly."""
        for known_tier in (
            LicenseTier.COMMUNITY.value,
            LicenseTier.PRO.value,
            LicenseTier.ENTERPRISE.value,
        ):
            path, pub = make_license(_valid_claims(known_tier))
            svc = LicenseService(license_path=str(path), public_key=pub)
            assert svc.tier == known_tier
