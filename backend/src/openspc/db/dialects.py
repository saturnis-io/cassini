"""Multi-database dialect support for OpenSPC.

Provides dialect detection, encrypted credential storage, connection URL building,
and configuration file management for SQLite, PostgreSQL, MySQL, and MSSQL.
"""

import json
import os
import secrets
import tempfile
from enum import Enum
from pathlib import Path
from typing import Optional

import structlog
from cryptography.fernet import Fernet, InvalidToken
from pydantic import BaseModel, field_validator
from sqlalchemy.engine import make_url

logger = structlog.get_logger(__name__)
audit_log = structlog.get_logger("audit")


class DatabaseDialect(str, Enum):
    """Supported database dialects."""

    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"
    MSSQL = "mssql"


# Async driver mapping per dialect
DIALECT_DRIVERS: dict[DatabaseDialect, str] = {
    DatabaseDialect.SQLITE: "aiosqlite",
    DatabaseDialect.POSTGRESQL: "asyncpg",
    DatabaseDialect.MYSQL: "aiomysql",
    DatabaseDialect.MSSQL: "aioodbc",
}

# SSRF protection: only known DB ports allowed for server dialects
ALLOWED_PORTS: set[int] = {5432, 3306, 1433}

# Whitelist of safe connection options (no connect_args, no init_command)
ALLOWED_OPTIONS: set[str] = {"pool_size", "pool_timeout", "pool_recycle", "pool_pre_ping"}

# Default ports per dialect
DEFAULT_PORTS: dict[DatabaseDialect, int] = {
    DatabaseDialect.POSTGRESQL: 5432,
    DatabaseDialect.MYSQL: 3306,
    DatabaseDialect.MSSQL: 1433,
}

# Default config file location (relative to CWD)
DEFAULT_CONFIG_PATH = Path("db_config.json")
DEFAULT_KEY_PATH = Path(".db_encryption_key")


class DatabaseConnectionConfig(BaseModel):
    """Database connection configuration with encrypted credentials."""

    dialect: DatabaseDialect
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    encrypted_password: str = ""
    options: dict[str, str | int | bool] = {}

    @field_validator("host")
    @classmethod
    def validate_host(cls, v: str) -> str:
        """Validate hostname pattern (no slashes, no special chars)."""
        import re

        if v and not re.match(r"^[a-zA-Z0-9._-]+$", v):
            raise ValueError("Invalid hostname: only alphanumeric, dots, hyphens, and underscores allowed")
        return v

    @field_validator("database")
    @classmethod
    def validate_database(cls, v: str) -> str:
        """Validate database name pattern."""
        import re

        if v and not re.match(r"^[a-zA-Z0-9_./-]+$", v):
            raise ValueError("Invalid database name: only alphanumeric, underscores, hyphens, dots, and slashes allowed")
        return v


def detect_dialect(url: str) -> DatabaseDialect:
    """Detect database dialect from a SQLAlchemy URL string.

    Args:
        url: SQLAlchemy database URL.

    Returns:
        Detected DatabaseDialect.
    """
    parsed = make_url(url)
    backend = parsed.get_backend_name()

    if backend == "sqlite":
        return DatabaseDialect.SQLITE
    elif backend == "postgresql":
        return DatabaseDialect.POSTGRESQL
    elif backend == "mysql":
        return DatabaseDialect.MYSQL
    elif backend == "mssql":
        return DatabaseDialect.MSSQL
    else:
        logger.warning("unknown_dialect", backend=backend, url=url)
        return DatabaseDialect.SQLITE


def get_default_port(dialect: DatabaseDialect) -> int:
    """Get the default port for a database dialect.

    Args:
        dialect: The database dialect.

    Returns:
        Default port number, or 0 for SQLite.
    """
    return DEFAULT_PORTS.get(dialect, 0)


def validate_connection_options(options: dict) -> dict:
    """Validate connection options against the whitelist.

    Args:
        options: Dictionary of connection options.

    Returns:
        Validated options dict (only whitelisted keys).

    Raises:
        ValueError: If any key is not in the whitelist.
    """
    invalid_keys = set(options.keys()) - ALLOWED_OPTIONS
    if invalid_keys:
        raise ValueError(f"Disallowed connection options: {', '.join(sorted(invalid_keys))}")
    return options


def get_encryption_key(key_path: Optional[Path] = None) -> bytes:
    """Get or create the database encryption key.

    Resolution order:
    1. OPENSPC_DB_ENCRYPTION_KEY environment variable
    2. .db_encryption_key file (auto-generated on first use)

    This key is SEPARATE from the JWT secret — rotating JWT does not
    affect encrypted database credentials.

    Args:
        key_path: Override path for the key file.

    Returns:
        Fernet-compatible encryption key bytes.
    """
    # 1. Check env var
    env_key = os.environ.get("OPENSPC_DB_ENCRYPTION_KEY")
    if env_key:
        return env_key.encode()

    # 2. Check/create key file
    path = key_path or DEFAULT_KEY_PATH
    if path.exists():
        key = path.read_text().strip()
        # Warn if file is world-readable (Unix only)
        try:
            mode = path.stat().st_mode
            if mode & 0o077:
                logger.warning(
                    "encryption_key_permissions_too_open",
                    path=str(path),
                    mode=oct(mode),
                )
        except (OSError, AttributeError):
            pass
        return key.encode()

    # Auto-generate key
    key = Fernet.generate_key()
    # Atomic write with restrictive permissions
    _atomic_write(path, key.decode(), mode=0o600)
    logger.info("encryption_key_created", path=str(path))
    return key


def encrypt_password(password: str, key: bytes) -> str:
    """Encrypt a password using Fernet symmetric encryption.

    Args:
        password: Plaintext password.
        key: Fernet encryption key.

    Returns:
        Encrypted password string (base64-encoded).
    """
    f = Fernet(key)
    return f.encrypt(password.encode()).decode()


def decrypt_password(encrypted: str, key: bytes) -> str:
    """Decrypt a password using Fernet symmetric encryption.

    Args:
        encrypted: Encrypted password string.
        key: Fernet encryption key.

    Returns:
        Decrypted plaintext password.

    Raises:
        ValueError: If decryption fails (wrong key or corrupted data).
    """
    try:
        f = Fernet(key)
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt password — encryption key may have changed")


def build_database_url(config: DatabaseConnectionConfig, key: bytes) -> str:
    """Build a SQLAlchemy database URL from configuration.

    Args:
        config: Database connection configuration.
        key: Encryption key for decrypting the password.

    Returns:
        SQLAlchemy async database URL string.
    """
    dialect = config.dialect
    driver = DIALECT_DRIVERS[dialect]

    if dialect == DatabaseDialect.SQLITE:
        db_path = config.database or "./openspc.db"
        return f"sqlite+{driver}:///{db_path}"

    # Validate port for server dialects
    if config.port not in ALLOWED_PORTS:
        raise ValueError(f"Port {config.port} not allowed. Allowed ports: {sorted(ALLOWED_PORTS)}")

    # Decrypt password if present
    password = ""
    if config.encrypted_password:
        password = decrypt_password(config.encrypted_password, key)

    # Build URL based on dialect
    if dialect == DatabaseDialect.POSTGRESQL:
        backend = f"postgresql+{driver}"
    elif dialect == DatabaseDialect.MYSQL:
        backend = f"mysql+{driver}"
    elif dialect == DatabaseDialect.MSSQL:
        backend = f"mssql+{driver}"
    else:
        raise ValueError(f"Unsupported dialect: {dialect}")

    # Build user:pass@host:port/database
    userinfo = ""
    if config.username:
        userinfo = config.username
        if password:
            # URL-encode special characters in password
            from urllib.parse import quote_plus

            userinfo += f":{quote_plus(password)}"
        userinfo += "@"

    return f"{backend}://{userinfo}{config.host}:{config.port}/{config.database}"


def load_db_config(path: Optional[Path] = None) -> Optional[DatabaseConnectionConfig]:
    """Load database configuration from a JSON file.

    Args:
        path: Override path for the config file.

    Returns:
        DatabaseConnectionConfig if file exists and is valid, None otherwise.
    """
    config_path = path or DEFAULT_CONFIG_PATH
    if not config_path.exists():
        return None

    try:
        data = json.loads(config_path.read_text())
        return DatabaseConnectionConfig(**data)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("db_config_load_failed", path=str(config_path), error=str(e))
        return None


def save_db_config(config: DatabaseConnectionConfig, path: Optional[Path] = None) -> None:
    """Save database configuration to a JSON file atomically.

    Uses atomic write (temp file + os.replace) to prevent corruption.
    Sets restrictive file permissions (0o600).

    Args:
        config: Database connection configuration to save.
        path: Override path for the config file.
    """
    config_path = path or DEFAULT_CONFIG_PATH
    data = config.model_dump(mode="json")
    _atomic_write(config_path, json.dumps(data, indent=2), mode=0o600)
    logger.info("db_config_saved", path=str(config_path), dialect=config.dialect)


def _atomic_write(path: Path, content: str, mode: int = 0o600) -> None:
    """Write content to a file atomically with restrictive permissions.

    Writes to a temp file in the same directory, then uses os.replace()
    for an atomic rename. Sets file permissions to the specified mode.

    Args:
        path: Target file path.
        content: File content to write.
        mode: Unix file permissions (default 0o600).
    """
    dir_path = path.parent
    dir_path.mkdir(parents=True, exist_ok=True)

    # Write to temp file in same directory (ensures same filesystem for atomic rename)
    fd, tmp_path = tempfile.mkstemp(dir=str(dir_path), prefix=f".{path.name}.")
    try:
        os.write(fd, content.encode())
        os.close(fd)
        fd = -1  # Mark as closed

        # Set permissions before moving into place
        try:
            os.chmod(tmp_path, mode)
        except OSError:
            pass  # Windows doesn't support chmod in the same way

        # Atomic rename
        os.replace(tmp_path, str(path))
    except Exception:
        # Clean up temp file on failure
        if fd >= 0:
            os.close(fd)
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
