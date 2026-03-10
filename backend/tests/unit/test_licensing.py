"""Tests for license validation and LicenseService."""

import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import PropertyMock

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
        assert svc.is_expired is True
        assert svc.days_until_expiry < 0

    def test_expired_license_is_not_commercial(self, make_license):
        """Expired license should NOT be commercial (BLOCKER-1 fix)."""
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.is_commercial is False
        assert svc.tier == "community"
        assert svc.max_plants == 1
        assert svc.edition == "community"

    def test_expired_license_status_shows_licensed_tier(self, make_license):
        """Expired license status should report community but include the original tier."""
        path, pub = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key=pub)
        status = svc.status()
        assert status["edition"] == "community"
        assert status["tier"] == "community"
        assert status["is_expired"] is True
        assert status["licensed_tier"] == "enterprise"

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

    def test_no_public_key_is_community(self, make_license):
        """License file without public key configured should be community."""
        path, _ = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path))  # No public key at all
        assert svc.is_commercial is False
        assert svc.tier == "community"

    def test_public_key_from_file(self, make_license, ed25519_keypair, tmp_path):
        """Public key loaded from file path should validate the license."""
        _, public_pem = ed25519_keypair
        key_file = tmp_path / "public.pem"
        key_file.write_bytes(public_pem)
        path, _ = make_license({
            "sub": "acme",
            "tier": "professional",
            "max_plants": 5,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(license_path=str(path), public_key_path=str(key_file))
        assert svc.is_commercial is True
        assert svc.tier == "professional"
        assert svc.max_plants == 5

    def test_public_key_file_not_found(self, make_license):
        """Missing public key file should result in community edition."""
        path, _ = make_license({
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        })
        svc = LicenseService(
            license_path=str(path),
            public_key_path="/nonexistent/public.pem",
        )
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


class TestInstanceId:
    """Tests for instance ID persistence."""

    @pytest.fixture
    def data_dir(self, tmp_path):
        """Provide a temporary data directory for instance ID tests."""
        d = tmp_path / "data"
        d.mkdir()
        return d

    @pytest.fixture
    def patch_data_dir(self, data_dir, monkeypatch):
        """Patch LicenseService._data_dir to use a temporary directory."""
        monkeypatch.setattr(
            LicenseService, "_data_dir", PropertyMock(return_value=data_dir),
        )
        return data_dir

    @pytest.fixture
    def valid_claims(self):
        """Standard valid license claims for instance ID tests."""
        return {
            "sub": "acme",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        }

    def test_data_dir_property_returns_correct_path(self):
        """_data_dir should resolve to the backend data/ directory."""
        svc = LicenseService(license_path=None, public_key=b"unused")
        expected = Path(__file__).resolve().parent.parent.parent / "src" / "cassini" / "core"
        # _data_dir is 4 parents up from licensing.py, then / "data"
        # licensing.py is at src/cassini/core/licensing.py
        # 4 parents up = backend/, then / "data" = backend/data
        from cassini.core import licensing
        expected = Path(licensing.__file__).resolve().parent.parent.parent.parent / "data"
        assert svc._data_dir == expected

    def test_instance_id_none_before_license_loaded(self):
        """Instance ID should be None when no license is loaded."""
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.instance_id is None

    def test_instance_id_generated_on_load(self, make_license, valid_claims, patch_data_dir):
        """Instance ID should be generated when a valid license is loaded via _load."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id is not None
        # Should be a valid UUID
        uuid.UUID(svc.instance_id)

    def test_instance_id_persisted_to_file(self, make_license, valid_claims, patch_data_dir, data_dir):
        """Instance ID should be written to data/instance-id file."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        instance_file = data_dir / "instance-id"
        assert instance_file.exists()
        assert instance_file.read_text().strip() == svc.instance_id

    def test_instance_id_stable_across_restarts(self, make_license, valid_claims, patch_data_dir, data_dir):
        """Instance ID should be the same when reloading from file (simulating restart)."""
        path, pub = make_license(valid_claims)
        svc1 = LicenseService(license_path=str(path), public_key=pub)
        first_id = svc1.instance_id
        assert first_id is not None

        # "Restart" — create a new service instance loading the same license
        svc2 = LicenseService(license_path=str(path), public_key=pub)
        assert svc2.instance_id == first_id

    def test_env_var_overrides_file(self, make_license, valid_claims, patch_data_dir, data_dir, monkeypatch):
        """CASSINI_INSTANCE_ID env var should take priority over file."""
        env_id = "env-override-id-12345"
        monkeypatch.setenv("CASSINI_INSTANCE_ID", env_id)

        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id == env_id

    def test_env_var_overrides_existing_file(self, make_license, valid_claims, patch_data_dir, data_dir, monkeypatch):
        """CASSINI_INSTANCE_ID env var should override even when file already exists."""
        # Pre-populate the instance-id file
        instance_file = data_dir / "instance-id"
        instance_file.write_text("file-based-id")

        env_id = "env-override-id-67890"
        monkeypatch.setenv("CASSINI_INSTANCE_ID", env_id)

        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id == env_id

    def test_instance_id_none_after_clear(self, make_license, valid_claims, patch_data_dir):
        """Instance ID should be None after clear() is called."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id is not None

        svc.clear()
        assert svc.instance_id is None

    def test_instance_id_file_persists_after_clear(self, make_license, valid_claims, patch_data_dir, data_dir):
        """Instance ID file should NOT be deleted by clear() — preserved for reuse."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        original_id = svc.instance_id

        svc.clear()

        instance_file = data_dir / "instance-id"
        assert instance_file.exists(), "instance-id file should persist after clear()"
        assert instance_file.read_text().strip() == original_id

    def test_instance_id_set_on_activate_from_token(
        self, ed25519_keypair, valid_claims, patch_data_dir, data_dir, monkeypatch
    ):
        """Instance ID should be set when activating via activate_from_token."""
        private_pem, public_pem = ed25519_keypair
        token = jwt.encode(valid_claims, private_pem, algorithm="EdDSA")

        # Patch the bundled key loading to use our test key
        monkeypatch.setattr(
            LicenseService,
            "_load_public_key_file",
            staticmethod(lambda path: public_pem),
        )

        svc = LicenseService(license_path=None, public_key=public_pem)
        assert svc.instance_id is None

        svc.activate_from_token(token)
        assert svc.instance_id is not None
        uuid.UUID(svc.instance_id)

    def test_instance_id_reads_existing_file(self, make_license, valid_claims, patch_data_dir, data_dir):
        """Instance ID should be read from existing file without generating a new one."""
        pre_existing_id = "pre-existing-uuid-value"
        instance_file = data_dir / "instance-id"
        instance_file.write_text(pre_existing_id)

        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id == pre_existing_id

    def test_instance_id_not_set_on_invalid_license(self, tmp_path, ed25519_keypair, patch_data_dir):
        """Instance ID should remain None when license validation fails."""
        _, pub = ed25519_keypair
        bad_file = tmp_path / "license.key"
        bad_file.write_text("not-a-valid-jwt")
        svc = LicenseService(license_path=str(bad_file), public_key=pub)
        assert svc.instance_id is None

    def test_instance_id_creates_data_dir_if_missing(self, make_license, valid_claims, tmp_path, monkeypatch):
        """_resolve_instance_id should create the data directory if it doesn't exist."""
        new_data_dir = tmp_path / "nonexistent" / "data"
        monkeypatch.setattr(
            LicenseService, "_data_dir", PropertyMock(return_value=new_data_dir),
        )

        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        assert svc.instance_id is not None
        assert new_data_dir.exists()
        assert (new_data_dir / "instance-id").exists()


class TestActivationFile:
    """Tests for generate_activation_file and generate_deactivation_file."""

    @pytest.fixture
    def data_dir(self, tmp_path):
        """Provide a temporary data directory."""
        d = tmp_path / "data"
        d.mkdir()
        return d

    @pytest.fixture
    def patch_data_dir(self, data_dir, monkeypatch):
        """Patch LicenseService._data_dir to use a temporary directory."""
        monkeypatch.setattr(
            LicenseService, "_data_dir", PropertyMock(return_value=data_dir),
        )
        return data_dir

    @pytest.fixture
    def valid_claims(self):
        """Standard valid license claims."""
        return {
            "sub": "acme-corp",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        }

    def test_activation_file_structure(self, make_license, valid_claims, patch_data_dir):
        """Activation file should contain correct type, version, licenseId, instanceId, timestamp."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        result = svc.generate_activation_file()

        assert result["type"] == "cassini-activation"
        assert result["version"] == 1
        assert result["licenseId"] == "acme-corp"
        assert result["instanceId"] == svc.instance_id
        assert "timestamp" in result
        # Verify timestamp is valid ISO format
        datetime.fromisoformat(result["timestamp"])

    def test_activation_file_raises_for_community(self):
        """Activation file generation should raise ValueError for community edition."""
        svc = LicenseService(license_path=None, public_key=b"unused")
        with pytest.raises(ValueError, match="No active license"):
            svc.generate_activation_file()

    def test_activation_file_raises_for_expired(self, make_license, patch_data_dir):
        """Activation file generation should raise ValueError for expired license."""
        expired_claims = {
            "sub": "acme-corp",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }
        path, pub = make_license(expired_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        with pytest.raises(ValueError, match="No active license"):
            svc.generate_activation_file()

    def test_activation_file_raises_without_instance_id(self, make_license, valid_claims, patch_data_dir):
        """Activation file generation should raise if instance_id is somehow None."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        # Force instance_id to None
        svc._instance_id = None

        with pytest.raises(ValueError, match="No active license"):
            svc.generate_activation_file()

    def test_deactivation_file_structure(self, make_license, valid_claims, patch_data_dir):
        """Deactivation file should contain correct type, version, licenseId, instanceId, timestamp."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        result = svc.generate_deactivation_file()

        assert result is not None
        assert result["type"] == "cassini-deactivation"
        assert result["version"] == 1
        assert result["licenseId"] == "acme-corp"
        assert result["instanceId"] == svc.instance_id
        assert "timestamp" in result
        datetime.fromisoformat(result["timestamp"])

    def test_deactivation_file_none_for_community(self):
        """Deactivation file should return None for community edition (not valid)."""
        svc = LicenseService(license_path=None, public_key=b"unused")
        assert svc.generate_deactivation_file() is None

    def test_deactivation_file_none_without_instance_id(self, make_license, valid_claims, patch_data_dir):
        """Deactivation file should return None if instance_id is None."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        svc._instance_id = None

        assert svc.generate_deactivation_file() is None

    def test_deactivation_file_none_after_clear(self, make_license, valid_claims, patch_data_dir):
        """Deactivation file should return None after clear() since _valid is False."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        svc.clear()
        assert svc.generate_deactivation_file() is None

    def test_deactivation_file_before_clear(self, make_license, valid_claims, patch_data_dir):
        """Deactivation file must be generated BEFORE clear() to capture license data."""
        path, pub = make_license(valid_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)
        instance_id = svc.instance_id

        # Generate deactivation file first, then clear — simulating the endpoint flow
        deactivation = svc.generate_deactivation_file()
        svc.clear()

        assert deactivation is not None
        assert deactivation["licenseId"] == "acme-corp"
        assert deactivation["instanceId"] == instance_id

    def test_deactivation_file_works_for_expired_license(self, make_license, patch_data_dir):
        """Deactivation file should still work for expired licenses (valid=True, expired=True)."""
        expired_claims = {
            "sub": "acme-corp",
            "tier": "enterprise",
            "max_plants": 20,
            "expires_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        }
        path, pub = make_license(expired_claims)
        svc = LicenseService(license_path=str(path), public_key=pub)

        # Expired license still has _valid=True, just is_commercial=False
        result = svc.generate_deactivation_file()
        assert result is not None
        assert result["type"] == "cassini-deactivation"
        assert result["licenseId"] == "acme-corp"
