"""Reset a user's password from the command line.

Break-glass recovery tool for self-hosted instances. Requires filesystem
access to the server (SSH/RDP). Resolves the database using the same
priority as the app: db_config.json -> CASSINI_DATABASE_URL -> sqlite default.

Usage:
    python scripts/reset_password.py <username> [--password <new_password>]
"""

import argparse
import getpass
import os
import sqlite3
import sys
from pathlib import Path

# -- Path setup ----------------------------------------------------------------
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir / "src"))

from cassini.core.auth.passwords import hash_password


def _async_to_sync_url(url: str) -> str:
    """Convert async SQLAlchemy driver URLs to sync equivalents."""
    return (
        url.replace("sqlite+aiosqlite", "sqlite")
        .replace("postgresql+asyncpg", "postgresql")
        .replace("mysql+aiomysql", "mysql+pymysql")
        .replace("mssql+aioodbc", "mssql+pyodbc")
    )


def _resolve_sync_database_url() -> str:
    """Resolve database URL using the same priority as the app, returning sync URL.

    Priority: db_config.json -> CASSINI_DATABASE_URL env -> sqlite default.
    """
    # 1. db_config.json (encrypted credentials)
    from cassini.db.dialects import (
        build_database_url,
        get_encryption_key,
        load_db_config,
    )

    config = load_db_config()
    if config is not None:
        try:
            key = get_encryption_key()
            async_url = build_database_url(config, key)
            return _async_to_sync_url(async_url)
        except Exception as e:
            print(f"Warning: Could not load db_config.json: {e}")

    # 2. CASSINI_DATABASE_URL environment variable
    env_url = os.environ.get("CASSINI_DATABASE_URL", "")
    if env_url:
        return _async_to_sync_url(env_url)

    # 3. Default SQLite
    return f"sqlite:///{backend_dir / 'cassini.db'}"


def reset_password(username: str, new_password: str) -> None:
    """Reset a user's password and unlock the account."""
    url = _resolve_sync_database_url()
    hashed = hash_password(new_password)

    if url.startswith("sqlite"):
        # Extract path from sqlite:///path
        db_path = url.split("///", 1)[1] if "///" in url else "cassini.db"
        if not os.path.exists(db_path):
            print(f"ERROR: Database file not found: {db_path}")
            sys.exit(1)

        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        cur.execute("SELECT id FROM user WHERE username = ?", (username,))
        if not cur.fetchone():
            print(f"ERROR: User '{username}' not found.")
            conn.close()
            sys.exit(1)

        cur.execute(
            """UPDATE user SET
                hashed_password = ?,
                must_change_password = 0,
                failed_login_count = 0,
                locked_until = NULL,
                updated_at = datetime('now')
            WHERE username = ?""",
            (hashed, username),
        )
        conn.commit()
        conn.close()
    else:
        # Non-SQLite: use SQLAlchemy sync engine
        from sqlalchemy import create_engine, text

        engine = create_engine(url)
        with engine.connect() as conn:
            result = conn.execute(
                text('SELECT id FROM "user" WHERE username = :u'),
                {"u": username},
            )
            if not result.fetchone():
                print(f"ERROR: User '{username}' not found.")
                engine.dispose()
                sys.exit(1)

            conn.execute(
                text(
                    """UPDATE "user" SET
                    hashed_password = :h,
                    must_change_password = false,
                    failed_login_count = 0,
                    locked_until = NULL
                WHERE username = :u"""
                ),
                {"h": hashed, "u": username},
            )
            conn.commit()
        engine.dispose()

    print(f"Password reset for '{username}'. Account unlocked.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reset a Cassini user's password (requires filesystem access)",
    )
    parser.add_argument("username", help="Username to reset")
    parser.add_argument("--password", help="New password (prompted if omitted)")
    args = parser.parse_args()

    if args.password:
        new_password = args.password
    else:
        new_password = getpass.getpass("New password: ")
        confirm = getpass.getpass("Confirm password: ")
        if new_password != confirm:
            print("ERROR: Passwords do not match.")
            sys.exit(1)

    if len(new_password) < 4:
        print("ERROR: Password must be at least 4 characters.")
        sys.exit(1)

    reset_password(args.username, new_password)


if __name__ == "__main__":
    main()
