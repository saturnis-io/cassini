"""License validation for Cassini open-core editions.

Validates Ed25519-signed JWT license files for Commercial edition features.
Community edition (no license) provides core SPC functionality.
Commercial edition (valid license AND not expired) unlocks enterprise features.
"""

import os
import socket
import structlog
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import jwt

logger = structlog.get_logger(__name__)


class LicenseTier(str, Enum):
    COMMUNITY = "community"
    PRO = "pro"
    ENTERPRISE = "enterprise"


PRO_FEATURES = frozenset({
    "multi-plant", "enterprise-databases", "opc-ua", "unlimited-mqtt",
    "msa-gage-rr", "doe", "non-normal-distributions", "rule-presets",
    "ishikawa", "correlation", "scheduled-reporting", "api-keys",
    "push-notifications", "email-alerts", "custom-metadata",
})

ENTERPRISE_FEATURES = frozenset({
    "gage-bridge", "electronic-signatures", "first-article-inspection",
    "multivariate-spc", "anomaly-detection", "predictive-analytics",
    "ai-analysis", "sso-oidc", "erp-connectors", "data-retention",
    "database-admin", "async-spc", "dedicated-support",
})

# Bundled public key ships with Cassini — used to verify license JWTs from saturnis.io
_BUNDLED_PUBLIC_KEY_PATH = Path(__file__).resolve().parent.parent / "license_public_key.pem"


class LicenseService:
    """Validates and exposes license state for feature gating."""

    def __init__(
        self,
        license_path: str | None,
        public_key_path: str | None = None,
        public_key: bytes | None = None,
        dev_tier: str = "",
    ):
        self._claims: dict | None = None
        self._valid = False
        self._dev_tier_active = False
        self._instance_id: str | None = None
        self._license_path: str | None = license_path

        resolved_tier = dev_tier.lower().strip() if dev_tier else ""
        if resolved_tier:
            if resolved_tier not in ("pro", "enterprise"):
                raise ValueError(f"Invalid dev_tier '{dev_tier}'. Must be 'pro' or 'enterprise'.")
            self._valid = True
            self._dev_tier_active = True
            self._claims = {
                "tier": resolved_tier,
                "max_plants": 999,
                "sub": "dev-toggle",
            }
            logger.info("DEV MODE: Running as %s tier (CASSINI_DEV_TIER=%s)", resolved_tier.capitalize(), resolved_tier)
            return

        # Resolve public key: explicit bytes (testing) > file path (config) > bundled key
        resolved_key = (
            public_key
            or self._load_public_key_file(public_key_path)
            or self._load_public_key_file(str(_BUNDLED_PUBLIC_KEY_PATH))
        )
        if resolved_key:
            self._load(license_path, resolved_key)
        elif license_path:
            logger.warning(
                "License file specified but no public key available — running as Community Edition"
            )
        else:
            logger.info("No license file configured — running as Community Edition")

    @staticmethod
    def _load_public_key_file(path: str | None) -> bytes | None:
        """Load an Ed25519 public key PEM from disk."""
        if not path:
            return None
        p = Path(path)
        if not p.exists():
            logger.warning("License public key file not found at %s", path)
            return None
        return p.read_bytes()

    @property
    def _data_dir(self) -> Path:
        """Compute the data directory path for license and instance files."""
        return Path(__file__).resolve().parent.parent.parent.parent / "data"

    @property
    def instance_id(self) -> str | None:
        """Return the instance ID, or None if no license has been loaded."""
        return self._instance_id

    def _resolve_instance_id(self) -> str:
        """Resolve the instance ID for this Cassini installation.

        Priority:
          1. CASSINI_INSTANCE_ID env var (operator-chosen, e.g. "PLANT-DETROIT-LINE2")
          2. Persisted instance-id file (stable across hostname changes)
          3. System hostname (e.g. "PLANT-FLOOR-3") — persisted on first use
          4. Generated UUID (last resort, persisted)

        Human-readable identifiers are strongly preferred. Once resolved,
        the ID is persisted to data/instance-id so hostname changes don't
        orphan the activation slot on the portal.
        """
        env_id = os.environ.get("CASSINI_INSTANCE_ID")
        if env_id:
            return env_id

        instance_file = self._data_dir / "instance-id"
        if instance_file.exists():
            stored_id = instance_file.read_text().strip()
            if stored_id:
                return stored_id

        # First activation — use hostname, or UUID as last resort
        hostname = socket.gethostname()
        if hostname and hostname != "localhost":
            new_id = hostname
        else:
            new_id = str(uuid.uuid4())
            logger.warning("Using generated UUID as instance ID — set CASSINI_INSTANCE_ID env var for a human-readable name")

        # Persist so the same ID is used if hostname changes later
        self._data_dir.mkdir(parents=True, exist_ok=True)
        instance_file.write_text(new_id)
        return new_id

    def _load(self, license_path: str | None, public_key: bytes) -> None:
        if not license_path:
            logger.info("No license file configured — running as Community Edition")
            return

        path = Path(license_path)
        if not path.exists():
            logger.info("License file not found at %s — running as Community Edition", license_path)
            return

        try:
            token = path.read_text().strip()
            self._claims = jwt.decode(token, public_key, algorithms=["EdDSA"])
            self._valid = True
            self._instance_id = self._resolve_instance_id()
            logger.info(
                "License validated",
                tier=self._claims.get("tier"),
                customer=self._claims.get("sub"),
                expires_at=self._claims.get("expires_at"),
                instance_id=self._instance_id,
            )
        except jwt.InvalidSignatureError:
            logger.warning("License file has invalid signature — running as Community Edition")
        except jwt.DecodeError:
            logger.warning("License file is corrupted — running as Community Edition")
        except Exception as e:
            logger.warning("License validation failed — running as Community Edition", error=type(e).__name__)

    @property
    def is_commercial(self) -> bool:
        """A license must be valid AND not expired to unlock commercial features."""
        return self._valid and not self.is_expired

    @property
    def edition(self) -> str:
        return "commercial" if self.is_commercial else "community"

    @property
    def tier(self) -> str:
        if not self.is_commercial:
            return LicenseTier.COMMUNITY.value
        raw = self._claims.get("tier", "enterprise") if self._claims else "community"
        try:
            return LicenseTier(raw).value
        except ValueError:
            return LicenseTier.ENTERPRISE.value

    @property
    def is_pro(self) -> bool:
        return self.tier == LicenseTier.PRO.value

    @property
    def is_enterprise(self) -> bool:
        return self.tier == LicenseTier.ENTERPRISE.value

    def has_feature(self, feature: str) -> bool:
        t = self.tier
        if t == LicenseTier.ENTERPRISE.value:
            return feature in PRO_FEATURES or feature in ENTERPRISE_FEATURES
        if t == LicenseTier.PRO.value:
            return feature in PRO_FEATURES
        return False

    @property
    def max_plants(self) -> int:
        if not self.is_commercial:
            return 1
        return self._claims.get("max_plants", 1)

    @property
    def is_expired(self) -> bool:
        if not self._valid or not self._claims:
            return False
        expires_at = self._claims.get("expires_at")
        if not expires_at:
            return False
        expiry = datetime.fromisoformat(expires_at)
        return datetime.now(timezone.utc) > expiry

    @property
    def days_until_expiry(self) -> int | None:
        if not self._valid or not self._claims:
            return None
        expires_at = self._claims.get("expires_at")
        if not expires_at:
            return None
        expiry = datetime.fromisoformat(expires_at)
        delta = expiry - datetime.now(timezone.utc)
        return delta.days

    def activate_from_token(self, token: str) -> None:
        """Validate and activate a license from a raw JWT string.

        Writes the token to data/license.key and validates it against
        the bundled public key. On success, updates internal state.

        Raises:
            ValueError: If in dev-tier mode, or validation fails.
        """
        if self._dev_tier_active:
            raise ValueError("Cannot upload license in dev tier mode")

        token = token.strip()
        public_key = self._load_public_key_file(str(_BUNDLED_PUBLIC_KEY_PATH))
        if not public_key:
            raise ValueError("No public key available to verify license")

        try:
            claims = jwt.decode(token, public_key, algorithms=["EdDSA"])
        except jwt.InvalidSignatureError:
            raise ValueError("License has invalid signature")
        except jwt.DecodeError:
            raise ValueError("License file is corrupted")
        except Exception as e:
            logger.warning("License validation failed", error=type(e).__name__)
            raise ValueError("License validation failed")

        # Write to data/license.key for persistence across restarts
        self._data_dir.mkdir(parents=True, exist_ok=True)
        key_path = self._data_dir / "license.key"
        key_path.write_text(token)

        self._claims = claims
        self._valid = True
        self._instance_id = self._resolve_instance_id()
        logger.info(
            "License activated via upload",
            tier=claims.get("tier"),
            customer=claims.get("sub"),
            expires_at=claims.get("expires_at"),
            instance_id=self._instance_id,
        )

    def generate_activation_file(self) -> dict:
        """Generate activation file content for offline portal registration."""
        if not self.is_commercial or not self._instance_id:
            raise ValueError("No active license to generate activation file")
        return {
            "type": "cassini-activation",
            "version": 1,
            "licenseId": self._claims.get("sub", ""),
            "instanceId": self._instance_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def generate_deactivation_file(self) -> dict | None:
        """Generate deactivation file content before license removal.

        Must be called BEFORE clear() since clear() resets claims.
        Returns None if no active license or no instance ID.
        """
        if not self._valid or not self._instance_id or not self._claims:
            return None
        return {
            "type": "cassini-deactivation",
            "version": 1,
            "licenseId": self._claims.get("sub", ""),
            "instanceId": self._instance_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @property
    def raw_key(self) -> str | None:
        """Return the raw license JWT string from disk, or None.

        Checks data/license.key first (written by activate_from_token),
        then falls back to the original license_path from config.
        """
        key_path = self._data_dir / "license.key"
        if key_path.exists():
            content = key_path.read_text().strip()
            if content:
                return content

        # Fallback: config-provided license path
        if self._license_path:
            p = Path(self._license_path)
            if p.exists():
                content = p.read_text().strip()
                if content:
                    return content
        return None

    def clear(self) -> None:
        """Remove the active license and revert to Community Edition.

        Raises:
            ValueError: If running in dev-tier mode (cannot remove).
        """
        if self._dev_tier_active:
            raise ValueError("Cannot remove license in dev tier mode")
        self._claims = None
        self._valid = False
        self._instance_id = None
        logger.info("License cleared, reverted to Community Edition")

    def status(self) -> dict:
        """Return license status for the API endpoint."""
        if not self._valid:
            return {
                "edition": "community",
                "tier": "community",
                "licensed_tier": None,
                "max_plants": 1,
                "instance_id": None,
            }
        if self.is_expired:
            return {
                "edition": "community",
                "tier": "community",
                "licensed_tier": self._claims.get("tier") if self._claims else None,
                "max_plants": 1,
                "is_expired": True,
                "expires_at": self._claims.get("expires_at") if self._claims else None,
                "instance_id": self._instance_id,
            }
        licensed_tier = self._claims.get("tier") if self._claims else None
        return {
            "edition": "commercial",
            "tier": licensed_tier,
            "licensed_tier": licensed_tier,
            "max_plants": self._claims.get("max_plants", 1) if self._claims else 1,
            "expires_at": self._claims.get("expires_at") if self._claims else None,
            "days_until_expiry": self.days_until_expiry,
            "is_expired": False,
            "instance_id": self._instance_id,
        }
