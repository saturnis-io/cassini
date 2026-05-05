"""TLS certificate availability check for MQTT integration tests.

The Cassini test harness ships placeholder cert directories that are
gitignored. When real certs are present the TLS test can run; otherwise
it must be skipped cleanly.

Directory layout expected by mosquitto.conf:
    apps/cassini/testing/harness/compose/certs/
        ca.crt      -- CA certificate (PEM)
        server.crt  -- Server certificate (PEM)
        server.key  -- Server private key (PEM)

Generating self-signed certs for local testing (requires openssl):

    CERTS=apps/cassini/testing/harness/compose/certs
    mkdir -p "$CERTS"

    # CA key + cert (10-year validity, no passphrase)
    openssl genrsa -out "$CERTS/ca.key" 4096
    openssl req -x509 -new -nodes -key "$CERTS/ca.key" \
        -sha256 -days 3650 \
        -subj "/CN=cassini-test-ca" \
        -out "$CERTS/ca.crt"

    # Server key + CSR + cert signed by CA
    openssl genrsa -out "$CERTS/server.key" 2048
    openssl req -new -key "$CERTS/server.key" \
        -subj "/CN=localhost" \
        -out "$CERTS/server.csr"
    openssl x509 -req -in "$CERTS/server.csr" \
        -CA "$CERTS/ca.crt" -CAkey "$CERTS/ca.key" -CAcreateserial \
        -out "$CERTS/server.crt" -days 3650 -sha256

The generated files MUST be gitignored (they are — see .gitignore). Never
commit private keys.
"""

from __future__ import annotations

import os
from pathlib import Path

# Resolve relative to this file's location, which is inside the backend
# tests tree. Walk up to the repo root then into the harness.
_REPO_ROOT = Path(__file__).resolve().parents[7]  # …/saturnis
_CERTS_DIR = (
    _REPO_ROOT
    / "apps"
    / "cassini"
    / "testing"
    / "harness"
    / "compose"
    / "certs"
)

_REQUIRED_FILES = ("ca.crt", "server.crt", "server.key")


def certs_available() -> bool:
    """Return True when all TLS cert files exist and are non-empty.

    Does NOT validate that the certs are cryptographically correct; that
    would require spinning the broker and is handled by the test itself.
    """
    if not _CERTS_DIR.is_dir():
        return False
    for name in _REQUIRED_FILES:
        path = _CERTS_DIR / name
        if not path.is_file() or path.stat().st_size == 0:
            return False
    return True


def certs_dir() -> Path:
    """Return the path to the certs directory (may not exist)."""
    return _CERTS_DIR


def ca_cert_path() -> Path:
    """Return the CA cert path."""
    return _CERTS_DIR / "ca.crt"


def server_cert_path() -> Path:
    """Return the server cert path."""
    return _CERTS_DIR / "server.crt"


def server_key_path() -> Path:
    """Return the server key path."""
    return _CERTS_DIR / "server.key"
