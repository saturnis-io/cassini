"""License validation for Cassini open-core editions.

Validates Ed25519-signed JWT license files for Commercial edition features.
Community edition (no license) provides core SPC functionality.
Commercial edition (valid license) unlocks enterprise features.
"""

import structlog
from datetime import datetime, timezone
from pathlib import Path

import jwt

logger = structlog.get_logger(__name__)

# Saturnis Ed25519 public key for license validation.
# Replace with actual production public key before release.
_DEFAULT_PUBLIC_KEY = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAPlaceholderKeyReplaceWithActualProductionKey00=
-----END PUBLIC KEY-----
"""


class LicenseService:
    """Validates and exposes license state for feature gating."""

    def __init__(self, license_path: str | None, public_key: bytes = _DEFAULT_PUBLIC_KEY):
        self._claims: dict | None = None
        self._valid = False
        self._load(license_path, public_key)

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
        return self._valid

    @property
    def edition(self) -> str:
        return "commercial" if self._valid else "community"

    @property
    def tier(self) -> str:
        if not self._valid or not self._claims:
            return "community"
        return self._claims.get("tier", "professional")

    @property
    def max_plants(self) -> int:
        if not self._valid or not self._claims:
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
        return {
            "edition": "commercial",
            "tier": self.tier,
            "max_plants": self.max_plants,
            "expires_at": self._claims.get("expires_at") if self._claims else None,
            "days_until_expiry": self.days_until_expiry,
            "is_expired": self.is_expired,
        }
