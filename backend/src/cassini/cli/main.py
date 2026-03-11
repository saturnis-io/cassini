"""Cassini CLI entrypoint.

Provides commands for running the server, managing migrations,
creating admin users, and performing health checks.

Usage:
    cassini serve                  # auto-migrate + start server
    cassini serve --no-migrate     # skip migrations
    cassini serve --host 0.0.0.0 --port 9000
    cassini migrate                # run migrations only
    cassini create-admin           # interactive admin creation
    cassini version                # print version + build info
    cassini check                  # validate config, DB, license
"""

from __future__ import annotations

import asyncio
import platform
from pathlib import Path

import click
import uvicorn

__version__ = "0.0.9"


def _get_backend_dir() -> Path:
    """Return the Cassini backend root directory.

    Resolves relative to this file's location so it works both in
    development (editable install) and in frozen/bundled builds.
    """
    # cli/main.py -> cassini/ -> src/ -> backend/
    return Path(__file__).resolve().parent.parent.parent.parent


def _run_migrations() -> None:
    """Run Alembic migrations (upgrade head).

    Resolves the alembic.ini path relative to the backend directory
    so this works regardless of the current working directory.
    """
    from alembic import command as alembic_command
    from alembic.config import Config as AlembicConfig

    backend_dir = _get_backend_dir()
    alembic_ini = backend_dir / "alembic.ini"

    if not alembic_ini.exists():
        # Fallback: try current working directory (for installed packages)
        alembic_ini = Path.cwd() / "alembic.ini"

    if not alembic_ini.exists():
        click.echo("Warning: alembic.ini not found, skipping migrations", err=True)
        return

    cfg = AlembicConfig(str(alembic_ini))

    # Ensure script_location is absolute so Alembic can find versions/
    script_location = cfg.get_main_option("script_location")
    if script_location and not Path(script_location).is_absolute():
        cfg.set_main_option(
            "script_location", str(alembic_ini.parent / script_location)
        )

    # Ensure version_locations is absolute
    version_locations = cfg.get_main_option("version_locations")
    if version_locations:
        resolved = []
        for loc in version_locations.split():
            loc_path = Path(loc.replace("%(here)s", str(alembic_ini.parent)))
            if not loc_path.is_absolute():
                loc_path = alembic_ini.parent / loc_path
            resolved.append(str(loc_path))
        cfg.set_main_option("version_locations", " ".join(resolved))

    alembic_command.upgrade(cfg, "head")


def _create_admin_user(username: str, password: str) -> None:
    """Create an admin user in the database (sync wrapper).

    Args:
        username: The admin username.
        password: The plaintext password (will be hashed).
    """

    async def _inner() -> None:
        from sqlalchemy import func, select

        from cassini.core.auth.passwords import hash_password
        from cassini.db.database import get_database
        from cassini.db.models.plant import Plant
        from cassini.db.models.user import User, UserPlantRole, UserRole

        db = get_database()
        try:
            async with db.session() as session:
                # Check if username already exists
                stmt = select(User).where(User.username == username)
                result = await session.execute(stmt)
                existing = result.scalar_one_or_none()
                if existing:
                    raise click.ClickException(
                        f"User '{username}' already exists"
                    )

                hashed = hash_password(password)
                admin_user = User(
                    username=username,
                    hashed_password=hashed,
                    is_active=True,
                    must_change_password=False,
                )
                session.add(admin_user)
                await session.flush()

                # Assign admin role for ALL existing plants
                plant_stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
                plant_result = await session.execute(plant_stmt)
                all_plants = plant_result.scalars().all()

                for plant in all_plants:
                    role = UserPlantRole(
                        user_id=admin_user.id,
                        plant_id=plant.id,
                        role=UserRole.admin,
                    )
                    session.add(role)

                await session.commit()

                plant_count = len(all_plants)
                click.echo(
                    f"Admin user '{username}' created"
                    + (f" with access to {plant_count} plant(s)" if plant_count else "")
                )
        finally:
            await db.dispose()

    asyncio.run(_inner())


@click.group()
def cli() -> None:
    """Cassini SPC — Event-Driven Statistical Process Control."""


@cli.command()
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind address")
@click.option("--port", default=8000, show_default=True, help="Bind port")
@click.option("--workers", default=1, show_default=True, help="Number of worker processes")
@click.option(
    "--no-migrate",
    is_flag=True,
    default=False,
    help="Skip automatic database migrations",
)
def serve(host: str, port: int, workers: int, no_migrate: bool) -> None:
    """Start the Cassini server.

    By default, runs database migrations before starting. Use --no-migrate
    to skip this step if migrations are managed externally.
    """
    if not no_migrate:
        click.echo("Running database migrations...")
        _run_migrations()
        click.echo("Migrations complete.")

    click.echo(f"Starting Cassini on {host}:{port}")
    uvicorn.run(
        "cassini.main:app",
        host=host,
        port=port,
        workers=workers,
        log_level="info",
    )


@cli.command()
def migrate() -> None:
    """Run database migrations (Alembic upgrade head)."""
    click.echo("Running database migrations...")
    _run_migrations()
    click.echo("Migrations complete.")


@cli.command("create-admin")
@click.option("--username", default=None, help="Admin username")
@click.option("--password", default=None, help="Admin password")
def create_admin(username: str | None, password: str | None) -> None:
    """Create an admin user interactively.

    Prompts for username and password if not provided via flags.
    The password must be at least 8 characters long.
    """
    if not username:
        username = click.prompt("Username")

    if not password:
        password = click.prompt("Password", hide_input=True)
        confirm = click.prompt("Repeat password", hide_input=True)
        if password != confirm:
            raise click.ClickException("Passwords do not match")

    if len(password) < 8:
        raise click.ClickException("Password must be at least 8 characters long")

    _create_admin_user(username, password)


@cli.command()
def version() -> None:
    """Print Cassini version and build information."""
    click.echo(f"Cassini {__version__}")
    click.echo(f"Python {platform.python_version()}")
    click.echo(f"Platform: {platform.platform()}")


@cli.command()
def check() -> None:
    """Validate configuration, database connectivity, and license status."""
    errors: list[str] = []

    # 1. Configuration
    click.echo("Checking configuration...")
    try:
        from cassini.core.config import get_settings

        settings = get_settings()
        click.echo(f"  Database URL: {_redact_url(settings.database_url)}")
        click.echo(f"  CORS origins: {settings.cors_origins}")

        if not settings.jwt_secret:
            click.echo("  JWT secret: [auto-generated at runtime]")
        else:
            click.echo("  JWT secret: [configured]")
    except Exception as exc:
        errors.append(f"Configuration error: {exc}")
        click.echo(f"  FAILED: {exc}", err=True)

    # 2. Database connectivity
    click.echo("Checking database connectivity...")
    try:

        async def _check_db() -> str:
            from sqlalchemy import text

            from cassini.db.database import get_database

            db = get_database()
            try:
                async with db.session() as session:
                    result = await session.execute(text("SELECT 1"))
                    result.scalar_one()
                return db.database_url
            finally:
                await db.dispose()

        db_url = asyncio.run(_check_db())
        click.echo(f"  Connected: {_redact_url(db_url)}")
    except Exception as exc:
        errors.append(f"Database error: {exc}")
        click.echo(f"  FAILED: {exc}", err=True)

    # 3. License status
    click.echo("Checking license...")
    try:
        from cassini.core.config import get_settings
        from cassini.core.licensing import LicenseService

        settings = get_settings()
        svc = LicenseService(
            license_path=settings.license_file or None,
            public_key_path=settings.license_public_key_file or None,
            dev_commercial=settings.dev_commercial,
        )
        status = svc.status()
        click.echo(f"  Edition: {status['edition']}")
        click.echo(f"  Tier: {status['tier']}")
        click.echo(f"  Max plants: {status['max_plants']}")
        if status.get("expires_at"):
            click.echo(f"  Expires: {status['expires_at']}")
        if status.get("days_until_expiry") is not None:
            click.echo(f"  Days until expiry: {status['days_until_expiry']}")
    except Exception as exc:
        errors.append(f"License error: {exc}")
        click.echo(f"  FAILED: {exc}", err=True)

    # Summary
    if errors:
        click.echo(f"\nCheck completed with {len(errors)} error(s).", err=True)
        raise SystemExit(1)
    else:
        click.echo("\nAll checks passed.")


def _redact_url(url: str) -> str:
    """Redact credentials from a database URL for display."""
    if "@" in url:
        # scheme://user:pass@host -> scheme://***@host
        scheme_rest = url.split("://", 1)
        if len(scheme_rest) == 2:
            at_split = scheme_rest[1].split("@", 1)
            if len(at_split) == 2:
                return f"{scheme_rest[0]}://***@{at_split[1]}"
    return url


def main() -> None:
    """Main entrypoint for ``python -m cassini``."""
    cli()


if __name__ == "__main__":
    main()
