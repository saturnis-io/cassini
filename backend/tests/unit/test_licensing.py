"""Tests for license validation and LicenseService."""

from datetime import datetime, timezone, timedelta
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

from cassini.core.licensing import LicenseService


@pytest.fixture
def ed25519_keypair():
    """Generate a test Ed25519 keypair."""
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    private_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    public_pem = public_key.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    return private_pem, public_pem


@pytest.fixture
def make_license(ed25519_keypair, tmp_path):
    """Factory to create signed license files."""
    private_pem, public_pem = ed25519_keypair

    def _make(claims: dict, filename: str = "license.key") -> tuple[Path, bytes]:
        token = jwt.encode(claims, private_pem, algorithm="EdDSA")
        license_path = tmp_path / filename
        license_path.write_text(token)
        return license_path, public_pem

    return _make


class TestLicenseServiceCommunity:
    """Tests for Community edition (no license)."""

    def test_no_license_file_is_community(self):
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.is_commercial is False
        assert svc.edition == "community"
        assert svc.tier == "community"
        assert svc.max_plants == 1

    def test_nonexistent_file_is_community(self):
        svc = LicenseService(license_path="/nonexistent/license.key", public_key=b"unused")
        assert svc.is_commercial is False

    def test_days_until_expiry_is_none_for_community(self):
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.days_until_expiry is None


class TestLicenseServiceCommercial:
    """Tests for Commercial edition (valid license)."""

    def test_valid_license_is_commercial(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_commercial is True
        assert svc.edition == "commercial"
        assert svc.tier == "enterprise"
        assert svc.max_plants == 20

    def test_days_until_expiry(self, make_license):
        expires = datetime.now(timezone.utc) + timedelta(days=30)
        path, pub = make_license({
            "sub": "acme",
            "tier": "professional",
            "max_plants": 5,
            "expires_at": expires.isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert 29 <= svc.days_until_expiry <= 31

    def test_expired_license_is_expired(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_commercial is True
        assert svc.is_expired is True
        assert svc.days_until_expiry < 0

    def test_invalid_signature_falls_back_to_community(self, make_license):
        other_private = Ed25519PrivateKey.generate()
        other_pub = other_private.public_key().public_bytes(
            Encoding.PEM, PublicFormat.SubjectPublicKeyInfo
        )
        path, _ = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=other_pub)
        assert svc.is_commercial is False

    def test_corrupted_file_falls_back_to_community(self, tmp_path, ed25519_keypair):
        _, pub = ed25519_keypair
        bad_file = tmp_path / "license.key"
        bad_file.write_text("this-is-not-a-jwt")
        svc = LicenseService(license_path=str(bad_file), public_key=pub)
        assert svc.is_commercial is False

    def test_status_dict(self, make_license):
        path, pub = make_license({
            "sub": "acme",
            "customer_name": "Acme Inc.",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        status = svc.status()
        assert status["edition"] == "commercial"
        assert status["tier"] == "enterprise"
        assert status["max_plants"] == 20
        assert "expires_at" in status
        assert "days_until_expiry" in status
