"""License validation for Cassini open-core editions.

Validates Ed25519-signed JWT license files for Commercial edition features.
Community edition (no license) provides core SPC functionality.
Commercial edition (valid license AND not expired) unlocks enterprise features.

Activation and deactivation files (machine -> portal) are signed with a
per-instance Ed25519 keypair (21 CFR Part 11 §11.10(e) integrity). The
machine's public key and the bundled license JWT are embedded in each
file so the portal can verify both the file's tamper-evident signature
and the chain of trust back to the portal-issued license.
"""

import base64
import json as _json
import os
import secrets
import socket
import structlog
import uuid
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path

import jwt
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    PublicFormat,
)

logger = structlog.get_logger(__name__)


class LicenseTier(str, Enum):
    COMMUNITY = "community"
    PRO = "pro"
    ENTERPRISE = "enterprise"


PRO_FEATURES = frozenset({
    "multi-plant", "enterprise-databases", "opc-ua", "unlimited-mqtt",
    "msa-gage-rr", "doe", "non-normal-distributions", "rule-presets",
    "ishikawa", "correlation", "scheduled-reporting", "api-keys",
    "push-notifications", "email-alerts",
})

ENTERPRISE_FEATURES = frozenset({
    "gage-bridge", "electronic-signatures", "first-article-inspection",
    "multivariate-spc", "anomaly-detection", "predictive-analytics",
    "ai-analysis", "sso-oidc", "erp-connectors", "data-retention",
    "database-admin", "async-spc", "dedicated-support",
})

# Bundled public key ships with Cassini — used to verify license JWTs from saturnis.io
_BUNDLED_PUBLIC_KEY_PATH = Path(__file__).resolve().parent.parent / "license_public_key.pem"

# Standard JWT claims that the website portal binds when issuing licenses
LICENSE_ISSUER = "saturnis.io"
LICENSE_AUDIENCE = "cassini"


def _legacy_grace_enabled() -> bool:
    """Whether to accept license JWTs missing standard iss/aud/exp claims.

    Defaults to True during migration — set CASSINI_LICENSE_LEGACY_GRACE=false
    once all in-the-wild licenses have been re-issued with the standard claims.
    Plan: flip default to false in next minor release after portal rolls out
    the new claim set.
    """
    raw = os.environ.get("CASSINI_LICENSE_LEGACY_GRACE", "true").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _decode_license_jwt(token: str, public_key: bytes) -> dict:
    """Decode and verify a license JWT against the bundled public key.

    Verifies signature, algorithm, and (when present) standard JWT claims:
    iss="saturnis.io", aud="cassini", exp. Falls back to legacy mode when
    the grace flag is enabled and the token is missing those claims, but
    always emits a warning so operators are aware of pre-migration tokens.

    Raises:
        jwt.InvalidSignatureError: Signature does not match.
        jwt.DecodeError: Token is malformed.
        jwt.MissingRequiredClaimError: Standard claims missing and grace disabled.
        jwt.InvalidIssuerError / InvalidAudienceError / ExpiredSignatureError:
            Standard claim verification failed.
    """
    # Strict path: enforce iss + aud + exp on tokens that include them.
    try:
        return jwt.decode(
            token,
            public_key,
            algorithms=["EdDSA"],
            issuer=LICENSE_ISSUER,
            audience=LICENSE_AUDIENCE,
            options={"require": ["exp", "iss", "aud"]},
        )
    except jwt.MissingRequiredClaimError as e:
        # Token predates the iss/aud/exp migration. Optionally accept it
        # under the legacy grace flag, but always warn.
        if not _legacy_grace_enabled():
            logger.warning(
                "license_legacy_claims_missing",
                msg=(
                    "License JWT missing required iss/aud/exp claims and "
                    "CASSINI_LICENSE_LEGACY_GRACE is disabled — rejecting"
                ),
                claim=str(e),
            )
            raise
        logger.warning(
            "license_legacy_claims_grace",
            msg=(
                "License JWT missing standard iss/aud/exp claims — "
                "accepting under legacy grace flag. Re-issue this license "
                "before disabling CASSINI_LICENSE_LEGACY_GRACE."
            ),
            claim=str(e),
        )
        # Re-decode without claim requirements but still verify signature.
        return jwt.decode(token, public_key, algorithms=["EdDSA"])


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
        """Compute the data directory path for license and instance files.

        Resolves through ``cassini.core.config.get_data_dir`` so the
        location is configurable via ``CASSINI_DATA_DIR`` and shared with
        the signature engine — preventing the CWD-relative regeneration
        bug that would otherwise invalidate historical signatures.
        """
        from cassini.core.config import get_data_dir

        return get_data_dir()

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
            self._claims = _decode_license_jwt(token, public_key)
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
        # Default to COMMUNITY (most restrictive) when claim is missing — fail-closed.
        raw = self._claims.get("tier", LicenseTier.COMMUNITY.value) if self._claims else LicenseTier.COMMUNITY.value
        try:
            return LicenseTier(raw).value
        except ValueError:
            # Unknown tier (typo or attacker-crafted) MUST fail closed to COMMUNITY,
            # never escalate to ENTERPRISE. Log a security warning so operators
            # notice the malformed license.
            logger.warning(
                "license_unknown_tier",
                msg="Unknown license tier — falling back to COMMUNITY (fail-closed)",
                tier=raw,
                customer=self._claims.get("sub") if self._claims else None,
            )
            return LicenseTier.COMMUNITY.value

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
            claims = _decode_license_jwt(token, public_key)
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

    # ------------------------------------------------------------------
    # Activation / deactivation signing keys (21 CFR Part 11 §11.10(e))
    # ------------------------------------------------------------------
    #
    # Activation/deactivation files flow machine -> operator -> portal.
    # To prevent forgery (a malicious portal cannot deactivate a slot
    # without a real machine signature; a MITM cannot tamper en route),
    # each file is Ed25519-signed by a per-instance keypair generated on
    # first use and stored in the stable data directory.
    #
    # The signed envelope carries:
    #   - payload (typed dict: type, version, licenseId, instanceId, timestamp)
    #   - signature (base64 Ed25519 signature over canonical JSON of payload)
    #   - publicKey (PEM, embedded so the portal can verify without out-of-band exchange)
    #
    # Schema version is bumped to 2 to signal the new format. Portal-side
    # verification rejects v<2 unsigned files. This is a breaking change
    # documented in the changelog.
    ACTIVATION_FILE_VERSION = 2

    def _activation_key_path(self) -> Path:
        """Path to the per-instance Ed25519 private key file."""
        return self._data_dir / ".activation_key"

    def _load_or_create_activation_key(self) -> Ed25519PrivateKey:
        """Load the per-instance signing key, generating one on first use."""
        key_path = self._activation_key_path()
        if key_path.exists():
            try:
                pem_bytes = key_path.read_bytes()
                from cryptography.hazmat.primitives.serialization import (
                    load_pem_private_key,
                )

                private = load_pem_private_key(pem_bytes, password=None)
                if isinstance(private, Ed25519PrivateKey):
                    return private
                logger.warning(
                    "activation_key_wrong_type — regenerating",
                )
            except Exception:
                logger.warning(
                    "activation_key_unreadable — regenerating",
                )

        # Generate fresh keypair and persist.
        self._data_dir.mkdir(parents=True, exist_ok=True)
        private = Ed25519PrivateKey.generate()
        pem = private.private_bytes(
            Encoding.PEM, PrivateFormat.PKCS8, NoEncryption(),
        )
        key_path.write_bytes(pem)
        try:
            key_path.chmod(0o600)
        except OSError:
            pass
        logger.info("activation_key_generated", path=str(key_path))
        return private

    def _public_key_pem(self, private: Ed25519PrivateKey) -> str:
        """Return the Ed25519 public key as a PEM string."""
        pub_bytes = private.public_key().public_bytes(
            Encoding.PEM, PublicFormat.SubjectPublicKeyInfo,
        )
        return pub_bytes.decode("ascii")

    def _sign_envelope(self, payload: dict) -> dict:
        """Wrap a payload dict in a signed Ed25519 envelope.

        The signature is computed over a deterministic JSON serialization
        of the payload (sorted keys, no whitespace), so the verifier can
        reconstruct the exact bytes that were signed.
        """
        private = self._load_or_create_activation_key()
        canonical = _json.dumps(
            payload, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")
        signature = private.sign(canonical)
        return {
            **payload,
            "signature": base64.b64encode(signature).decode("ascii"),
            "publicKey": self._public_key_pem(private),
            "signatureAlgorithm": "Ed25519",
        }

    def generate_activation_file(self) -> dict:
        """Generate signed activation file content for offline portal registration.

        21 CFR Part 11 §11.10(e): the file is Ed25519-signed by a
        per-instance key so the portal can detect tampering or forgery.
        """
        if not self.is_commercial or not self._instance_id:
            raise ValueError("No active license to generate activation file")
        payload = {
            "type": "cassini-activation",
            "version": self.ACTIVATION_FILE_VERSION,
            "licenseId": self._claims.get("sub", ""),
            "instanceId": self._instance_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return self._sign_envelope(payload)

    def generate_deactivation_file(self) -> dict | None:
        """Generate signed deactivation file content before license removal.

        Must be called BEFORE clear() since clear() resets claims.
        Returns None if no active license or no instance ID.
        21 CFR Part 11 §11.10(e): Ed25519-signed (see ``generate_activation_file``).
        """
        if not self._valid or not self._instance_id or not self._claims:
            return None
        payload = {
            "type": "cassini-deactivation",
            "version": self.ACTIVATION_FILE_VERSION,
            "licenseId": self._claims.get("sub", ""),
            "instanceId": self._instance_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return self._sign_envelope(payload)

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

    @staticmethod
    def verify_activation_file(envelope: dict) -> dict:
        """Verify an Ed25519-signed activation/deactivation envelope.

        Re-derives the canonical payload, decodes the embedded public key
        and signature, and checks that the signature is valid.

        Returns the inner payload dict on success.
        Raises ValueError on:
          - missing signature/publicKey fields (legacy unsigned file)
          - version < 2 (legacy unsigned format)
          - wrong algorithm
          - invalid signature
          - malformed envelope
        """
        if not isinstance(envelope, dict):
            raise ValueError("Activation envelope must be a JSON object")

        # Reject legacy unsigned files
        version = envelope.get("version")
        if not isinstance(version, int) or version < 2:
            raise ValueError(
                "Activation file is unsigned (version < 2). 21 CFR Part 11 "
                "compliance requires signed activation files."
            )

        signature_b64 = envelope.get("signature")
        public_key_pem = envelope.get("publicKey")
        algorithm = envelope.get("signatureAlgorithm")

        if not signature_b64 or not public_key_pem:
            raise ValueError("Activation file is missing signature or public key")
        if algorithm != "Ed25519":
            raise ValueError(
                f"Unsupported signature algorithm: {algorithm!r}; expected 'Ed25519'"
            )

        # Reconstruct payload (envelope minus signature fields)
        payload = {
            k: v for k, v in envelope.items()
            if k not in ("signature", "publicKey", "signatureAlgorithm")
        }
        canonical = _json.dumps(
            payload, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")

        # Decode signature
        try:
            signature = base64.b64decode(signature_b64, validate=True)
        except (ValueError, TypeError):
            raise ValueError("Activation file signature is not valid base64")

        # Load embedded public key
        try:
            from cryptography.hazmat.primitives.serialization import (
                load_pem_public_key,
            )

            public_key = load_pem_public_key(public_key_pem.encode("ascii"))
        except Exception:
            raise ValueError("Activation file public key is malformed")

        if not isinstance(public_key, Ed25519PublicKey):
            raise ValueError(
                "Activation file public key is not an Ed25519 public key"
            )

        try:
            public_key.verify(signature, canonical)
        except InvalidSignature:
            raise ValueError("Activation file signature is invalid")

        return payload

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
