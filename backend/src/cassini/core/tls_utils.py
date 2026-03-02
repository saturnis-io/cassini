"""TLS/SSL utilities for MQTT and OPC-UA certificate handling."""

import os
import ssl
import tempfile

import structlog

from cassini.db.dialects import decrypt_password

logger = structlog.get_logger(__name__)


def build_ssl_context(
    ca_cert_pem: str | None,
    client_cert_pem: str | None,
    client_key_pem: str | None,
    encryption_key: bytes,
    encrypted: bool = True,
    insecure: bool = False,
) -> ssl.SSLContext:
    """Build an SSL context for MQTT or OPC-UA TLS connections.

    Args:
        ca_cert_pem: PEM-encoded CA certificate (or Fernet-encrypted PEM).
        client_cert_pem: PEM-encoded client certificate (or Fernet-encrypted PEM).
        client_key_pem: PEM-encoded client private key (or Fernet-encrypted PEM).
        encryption_key: Fernet encryption key for decrypting PEM strings.
        encrypted: If True, decrypt PEM strings before use.
        insecure: If True, disable hostname checking and certificate verification.

    Returns:
        Configured ssl.SSLContext ready for TLS connections.
    """
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    if insecure:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    # Load CA certificate
    if ca_cert_pem:
        ca_pem = decrypt_password(ca_cert_pem, encryption_key) if encrypted else ca_cert_pem
        ca_path = _write_temp_pem(ca_pem)
        try:
            ctx.load_verify_locations(cafile=ca_path)
        finally:
            os.unlink(ca_path)
    else:
        ctx.set_default_verify_paths()

    # Load client certificate + key for mutual TLS
    if client_cert_pem and client_key_pem:
        cert_pem = decrypt_password(client_cert_pem, encryption_key) if encrypted else client_cert_pem
        key_pem = decrypt_password(client_key_pem, encryption_key) if encrypted else client_key_pem
        cert_path = _write_temp_pem(cert_pem)
        key_path = _write_temp_pem(key_pem)
        try:
            ctx.load_cert_chain(certfile=cert_path, keyfile=key_path)
        finally:
            os.unlink(cert_path)
            os.unlink(key_path)

    logger.info(
        "tls_context_built",
        has_ca_cert=ca_cert_pem is not None,
        has_client_cert=client_cert_pem is not None and client_key_pem is not None,
        insecure=insecure,
    )

    return ctx


def decrypt_and_write_cert_files(
    ca_cert_pem: str | None,
    client_cert_pem: str | None,
    client_key_pem: str | None,
    encryption_key: bytes,
) -> tuple[str | None, str | None, str | None]:
    """Decrypt PEM strings and write them to temporary files.

    For libraries like asyncua that need file paths instead of an ssl context.
    Caller is responsible for cleanup via os.unlink() on the returned paths.

    Args:
        ca_cert_pem: Fernet-encrypted PEM CA certificate, or None.
        client_cert_pem: Fernet-encrypted PEM client certificate, or None.
        client_key_pem: Fernet-encrypted PEM client private key, or None.
        encryption_key: Fernet encryption key.

    Returns:
        Tuple of (ca_path, cert_path, key_path) — each is a file path or None.
    """
    ca_path = None
    cert_path = None
    key_path = None

    if ca_cert_pem:
        ca_pem = decrypt_password(ca_cert_pem, encryption_key)
        ca_path = _write_temp_pem(ca_pem)

    if client_cert_pem:
        cert_pem = decrypt_password(client_cert_pem, encryption_key)
        cert_path = _write_temp_pem(cert_pem)

    if client_key_pem:
        key_pem = decrypt_password(client_key_pem, encryption_key)
        key_path = _write_temp_pem(key_pem)

    return ca_path, cert_path, key_path


def validate_pem_format(pem: str, expected_type: str = "CERTIFICATE") -> bool:
    """Check if a string looks like a valid PEM-encoded block.

    Args:
        pem: The PEM string to validate.
        expected_type: Expected PEM type (e.g. "CERTIFICATE", "PRIVATE KEY").

    Returns:
        True if the string has valid PEM begin/end markers.
    """
    stripped = pem.strip()
    return (
        stripped.startswith(f"-----BEGIN {expected_type}-----")
        and stripped.endswith(f"-----END {expected_type}-----")
    )


def _write_temp_pem(pem_content: str) -> str:
    """Write PEM content to a secure temporary file.

    Sets file permissions to 0o600 on Unix. On Windows, permissions
    are managed by the OS and chmod is skipped.

    Args:
        pem_content: Decrypted PEM string to write.

    Returns:
        Path to the temporary file. Caller must os.unlink() when done.
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pem", mode="w")
    try:
        tmp.write(pem_content)
        tmp.close()
        # Set restrictive permissions on Unix
        try:
            os.chmod(tmp.name, 0o600)
        except OSError:
            pass  # Windows doesn't support Unix permissions
        return tmp.name
    except Exception:
        tmp.close()
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
        raise
