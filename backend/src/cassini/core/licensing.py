"""License validation for Cassini open-core editions.

Validates Ed25519-signed JWT license files for Commercial edition features.
Community edition (no license) provides core SPC functionality.
Commercial edition (valid license AND not expired) unlocks enterprise features.
"""

import structlog
from datetime import datetime, timezone
from pathlib import Path

import jwt

logger = structlog.get_logger(__name__)


class LicenseService:
    """Validates and exposes license state for feature gating."""

    def __init__(
        self,
        license_path: str | None,
        public_key_path: str | None = None,
        public_key: bytes | None = None,
    ):
        self._claims: dict | None = None
        self._valid = False

        # Resolve public key: explicit bytes (testing) > file path (production)
        resolved_key = public_key or self._load_public_key_file(public_key_path)
        if resolved_key:
            self._load(license_path, resolved_key)
        elif license_path:
            logger.warning(
                "License file specified but no public key configured — running as Community Edition"
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
            logger.info(
                "License validated",
                tier=self._claims.get("tier"),
                customer=self._claims.get("sub"),
                expires_at=self._claims.get("expires_at"),
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
            return "community"
        return self._claims.get("tier", "professional")

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

    def status(self) -> dict:
        """Return license status for the API endpoint."""
        if not self._valid:
            return {"edition": "community", "tier": "community", "max_plants": 1}
        if self.is_expired:
            return {
                "edition": "community",
                "tier": "community",
                "max_plants": 1,
                "is_expired": True,
                "expires_at": self._claims.get("expires_at") if self._claims else None,
                "licensed_tier": self._claims.get("tier", "professional") if self._claims else "professional",
            }
        return {
            "edition": "commercial",
            "tier": self._claims.get("tier", "professional") if self._claims else "professional",
            "max_plants": self._claims.get("max_plants", 1) if self._claims else 1,
            "expires_at": self._claims.get("expires_at") if self._claims else None,
            "days_until_expiry": self.days_until_expiry,
            "is_expired": False,
        }
