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

# Bundled public key ships with Cassini — used to verify license JWTs from saturnis.io
_BUNDLED_PUBLIC_KEY_PATH = Path(__file__).resolve().parent.parent / "license_public_key.pem"

# Well-known location for uploaded license files (relative to CWD)
_SAVED_LICENSE_PATH = Path("data/license.key")


def _resolve_public_key(
    public_key_path: str | None = None,
    public_key: bytes | None = None,
) -> bytes | None:
    """Resolve public key from explicit bytes, file path, or bundled key."""
    if public_key:
        return public_key
    if public_key_path:
        p = Path(public_key_path)
        if p.exists():
            return p.read_bytes()
        logger.warning("License public key file not found at %s", public_key_path)
    bundled = _BUNDLED_PUBLIC_KEY_PATH
    if bundled.exists():
        return bundled.read_bytes()
    return None


class LicenseService:
    """Validates and exposes license state for feature gating."""

    def __init__(
        self,
        license_path: str | None,
        public_key_path: str | None = None,
        public_key: bytes | None = None,
        dev_commercial: bool = False,
    ):
        self._claims: dict | None = None
        self._valid = False
        self._dev_commercial = dev_commercial
        self._public_key: bytes | None = None

        if dev_commercial:
            self._valid = True
            self._claims = {
                "tier": "enterprise",
                "max_plants": 999,
                "sub": "dev-toggle",
            }
            logger.info("DEV MODE: Running as Commercial Edition (CASSINI_DEV_COMMERCIAL=true)")
            return

        # Resolve public key: explicit bytes (testing) > file path (config) > bundled key
        self._public_key = _resolve_public_key(public_key_path, public_key)

        if not self._public_key:
            if license_path:
                logger.warning(
                    "License file specified but no public key available — running as Community Edition"
                )
            else:
                logger.info("No license file configured — running as Community Edition")
            return

        # Check for uploaded license FIRST, then fall back to env-var path
        effective_path = license_path
        if _SAVED_LICENSE_PATH.exists():
            effective_path = str(_SAVED_LICENSE_PATH)
            logger.info("Found uploaded license at %s", effective_path)

        self._load(effective_path, self._public_key)

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
            # Disable exp verification — we use our own expires_at claim so Cassini
            # can show "expired" status with the licensed tier instead of rejecting outright
            self._claims = jwt.decode(
                token, public_key, algorithms=["EdDSA"], options={"verify_exp": False}
            )
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

    def reload(self, license_content: str) -> bool:
        """Validate and apply a license JWT string.

        Updates internal state if valid. Saves the JWT to the well-known
        location on disk so it persists across restarts.

        Args:
            license_content: Raw JWT string.

        Returns:
            True if the license was valid and applied, False otherwise.

        Raises:
            ValueError: If the license JWT is invalid or cannot be verified.
        """
        if self._dev_commercial:
            raise ValueError("Cannot upload license in dev-commercial mode")

        public_key = self._public_key
        if not public_key:
            raise ValueError("No public key available to verify license")

        token = license_content.strip()
        if not token:
            raise ValueError("License key is empty")

        try:
            claims = jwt.decode(
                token, public_key, algorithms=["EdDSA"], options={"verify_exp": False}
            )
        except jwt.InvalidSignatureError:
            raise ValueError("Invalid license signature")
        except jwt.DecodeError:
            raise ValueError("License key is malformed")
        except Exception:
            raise ValueError("License validation failed")

        # Reject expired licenses on upload
        expires_at = claims.get("expires_at")
        if expires_at:
            expiry = datetime.fromisoformat(expires_at)
            if datetime.now(timezone.utc) > expiry:
                raise ValueError("License has expired")

        # Valid — persist to disk
        _SAVED_LICENSE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _SAVED_LICENSE_PATH.write_text(token)
        logger.info(
            "License uploaded and saved",
            tier=claims.get("tier"),
            customer=claims.get("sub"),
            path=str(_SAVED_LICENSE_PATH),
        )

        # Update internal state
        self._claims = claims
        self._valid = True
        return True

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
    def license_name(self) -> str | None:
        """Organizational label for this license (formerly siteName)."""
        if not self._valid or not self._claims:
            return None
        # Support both new (licenseName) and legacy (siteName) JWT claim fields
        return self._claims.get("licenseName") or self._claims.get("siteName")

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
                "license_name": self.license_name,
            }
        return {
            "edition": "commercial",
            "tier": self._claims.get("tier", "professional") if self._claims else "professional",
            "max_plants": self._claims.get("max_plants", 1) if self._claims else 1,
            "expires_at": self._claims.get("expires_at") if self._claims else None,
            "days_until_expiry": self.days_until_expiry,
            "is_expired": False,
            "license_name": self.license_name,
        }
