"""Cassini CLI entrypoint.

Provides commands for running the server, managing migrations,
creating admin users, performing health checks, managing the
Windows Service, launching the system tray companion, and
resource-verb commands for plants, characteristics, samples, etc.

Usage:
    cassini serve                  # auto-migrate + start server
    cassini serve --no-migrate     # skip migrations
    cassini serve --host 0.0.0.0 --port 9000
    cassini migrate                # run migrations only
    cassini create-admin           # interactive admin creation
    cassini version                # print version + build info
    cassini check                  # validate config, DB, license
    cassini tray                   # launch system tray companion
    cassini service install        # install Windows Service
    cassini service uninstall      # remove Windows Service
    cassini service start          # start the service
    cassini service stop           # stop the service
    cassini login --server URL     # authenticate + store CLI key
    cassini plants list            # list plants via API
    cassini chars list             # list characteristics
    cassini samples list           # list samples
    cassini health                 # remote health check via API
"""

from __future__ import annotations

import asyncio
import platform
import socket
import sys
import urllib.parse
from pathlib import Path

import click
import uvicorn

try:
    from importlib.metadata import version as _pkg_version

    __version__ = _pkg_version("cassini")
except Exception:
    __version__ = "0.0.9"


def _get_backend_dir() -> Path:
    """Return the Cassini backend root directory.

    Resolves relative to this file's location so it works both in
    development (editable install) and in frozen/bundled builds.
    In a PyInstaller frozen build, ``__file__`` lives under ``_MEIPASS``
    which has a flat layout — walking up parents would escape the bundle.
    """
    # PyInstaller frozen build: data files are relative to _MEIPASS root
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    # Development / pip install
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


def _check_port_available(host: str, port: int) -> bool:
    """Check if a port is available for binding.

    Attempts to bind a TCP socket to the given host and port. Returns
    True if the port is free, False if it is already in use.
    """
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, port))
            return True
    except OSError:
        return False


def _get_client_factory(
    server: str | None = None,
    api_key: str | None = None,
    profile: str = "default",
) -> object:
    """Create a CassiniClient factory from CLI options or stored credentials.

    Resolution order for both server URL and API key:
      1. Explicit flag (--server / --api-key)
      2. Environment variable (CASSINI_SERVER_URL / CASSINI_API_KEY)
      3. Stored credential profile (~/.cassini/credentials.json)

    Returns:
        A callable that returns a ``CassiniClient`` async context manager.

    Raises:
        click.ClickException: If no server URL can be resolved.
    """
    import os

    from cassini.cli.client import CassiniClient
    from cassini.cli.credentials import load_credential

    url = server or os.environ.get("CASSINI_SERVER_URL")
    key = api_key or os.environ.get("CASSINI_API_KEY")

    if not url or not key:
        cred = load_credential(profile)
        if cred:
            url = url or cred[0]
            key = key or cred[1]

    if not url:
        raise click.ClickException(
            "No server URL. Use --server, CASSINI_SERVER_URL, or 'cassini login'"
        )

    def factory() -> CassiniClient:
        return CassiniClient(server_url=url, api_key=key)

    return factory


@click.group()
@click.option("--server", default=None, envvar="CASSINI_SERVER_URL", hidden=True, help="Cassini server URL")
@click.option("--api-key", default=None, envvar="CASSINI_API_KEY", hidden=True, help="API key")
@click.option("--profile", default="default", hidden=True, help="Credential profile")
@click.pass_context
def cli(ctx: click.Context, server: str | None, api_key: str | None, profile: str) -> None:
    """Cassini SPC — Event-Driven Statistical Process Control."""
    ctx.ensure_object(dict)
    # Store raw options — the client factory is built lazily on first use.
    # Server-local commands (serve, migrate, check) never touch ctx.obj["client"].
    ctx.obj["_server"] = server
    ctx.obj["_api_key"] = api_key
    ctx.obj["_profile"] = profile

    # Lazy wrapper: resolves credentials and creates a CassiniClient on demand.
    # Commands call:  async with ctx.obj["client"]() as client: ...
    _resolved_factory: list[object] = []  # mutable closure cell

    def _lazy_client() -> object:
        if not _resolved_factory:
            _resolved_factory.append(
                _get_client_factory(
                    server=ctx.obj["_server"],
                    api_key=ctx.obj["_api_key"],
                    profile=ctx.obj["_profile"],
                )
            )
        return _resolved_factory[0]()

    ctx.obj["client"] = _lazy_client


# ── Remote resource commands (require CassiniClient) ────────────────────

from cassini.cli.commands.auth import login  # noqa: E402
from cassini.cli.commands.plants import plants  # noqa: E402
from cassini.cli.commands.data import chars, samples, capability, violations  # noqa: E402
from cassini.cli.commands.admin import users, audit, license, api_keys  # noqa: E402
from cassini.cli.commands.ops import health, status  # noqa: E402

cli.add_command(login)
cli.add_command(plants)
cli.add_command(chars)
cli.add_command(samples)
cli.add_command(capability)
cli.add_command(violations)
cli.add_command(users)
cli.add_command(audit)
cli.add_command(license)
cli.add_command(api_keys)
cli.add_command(health)
cli.add_command(status)


@cli.command()
@click.option("--host", default=None, help="Bind address [default: from config or 127.0.0.1]")
@click.option("--port", default=None, type=int, help="Bind port [default: from config or 8000]")
@click.option("--workers", default=1, show_default=True, help="Number of worker processes")
@click.option(
    "--no-migrate",
    is_flag=True,
    default=False,
    help="Skip automatic database migrations",
)
@click.option(
    "--roles",
    default=None,
    help="Comma-separated node roles (e.g. api,spc,ingestion). Overrides CASSINI_ROLES.",
)
def serve(host: str | None, port: int | None, workers: int, no_migrate: bool, roles: str | None) -> None:
    """Start the Cassini server.

    By default, runs database migrations before starting. Use --no-migrate
    to skip this step if migrations are managed externally.

    Host and port default to the values in cassini.toml ([server] section),
    falling back to 127.0.0.1:8000 if not configured.

    Use --roles to restrict which subsystems this node runs. Default is "all"
    (every subsystem). In a cluster, split roles across nodes, e.g.:
    --roles api on the frontend nodes, --roles spc,ingestion on workers.
    """
    import os

    from cassini.core.config import get_settings

    # Override CASSINI_ROLES env var if --roles is provided (before settings load)
    if roles is not None:
        os.environ["CASSINI_ROLES"] = roles
        # Clear cached settings so the new env var is picked up
        get_settings.cache_clear()

    settings = get_settings()
    host = host if host is not None else settings.server_host
    port = port if port is not None else settings.server_port

    if not _check_port_available(host, port):
        click.echo(
            f"\nError: Port {port} is already in use.\n\n"
            "Another application is using this port. To fix:\n"
            "  1. Edit cassini.toml and change [server] port\n"
            f"  2. Or use: cassini serve --port <other-port>\n"
            f"  3. Or stop the application using port {port}\n",
            err=True,
        )
        raise SystemExit(1)

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
        errors.append(f"Configuration error: {_redact_url(str(exc))}")
        click.echo(f"  FAILED: {_redact_url(str(exc))}", err=True)

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
        errors.append(f"Database error: {_redact_url(str(exc))}")
        click.echo(f"  FAILED: {_redact_url(str(exc))}", err=True)

    # 3. License status
    click.echo("Checking license...")
    try:
        from cassini.core.config import get_settings
        from cassini.core.licensing import LicenseService

        settings = get_settings()
        svc = LicenseService(
            license_path=settings.license_file or None,
            public_key_path=settings.license_public_key_file or None,
            dev_tier=settings.dev_tier,
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
        errors.append(f"License error: {_redact_url(str(exc))}")
        click.echo(f"  FAILED: {_redact_url(str(exc))}", err=True)

    # Summary
    if errors:
        click.echo(f"\nCheck completed with {len(errors)} error(s).", err=True)
        raise SystemExit(1)
    else:
        click.echo("\nAll checks passed.")


# -- System Tray companion --------------------------------------------------


@cli.command()
@click.option("--host", default="localhost", show_default=True, help="Cassini server host")
@click.option("--port", default=8000, show_default=True, type=int, help="Cassini server port")
def tray(host: str, port: int) -> None:
    """Launch the system tray companion app (Windows).

    Shows a status icon that monitors the Cassini server health
    and provides quick actions for service control, log viewing,
    and opening the web UI.
    """
    try:
        from cassini.tray.app import CassiniTray
    except ImportError:
        raise click.ClickException(
            "Tray dependencies not installed. Run: pip install cassini[tray]"
        )

    app = CassiniTray(host=host, port=port)
    click.echo(f"Starting Cassini tray (monitoring {app.base_url})...")
    app.run()


# -- Windows Service helpers -----------------------------------------------


def _require_windows() -> None:
    """Raise ClickException if not running on Windows."""
    if sys.platform != "win32":
        raise click.ClickException("Windows Service commands are only available on Windows")


def _service_install() -> None:
    """Install the Cassini Windows Service."""
    _require_windows()
    import win32service  # type: ignore[import-untyped]
    import win32serviceutil  # type: ignore[import-untyped]

    from cassini.service.windows_service import CassiniService

    win32serviceutil.InstallService(
        win32serviceutil.GetServiceClassString(CassiniService),
        CassiniService._svc_name_,
        CassiniService._svc_display_name_,
        description=CassiniService._svc_description_,
        startType=win32service.SERVICE_AUTO_START,
    )


def _service_uninstall() -> None:
    """Uninstall the Cassini Windows Service."""
    _require_windows()
    import win32serviceutil  # type: ignore[import-untyped]

    from cassini.service.windows_service import CassiniService

    win32serviceutil.RemoveService(CassiniService._svc_name_)


def _service_start() -> None:
    """Start the Cassini Windows Service."""
    _require_windows()
    import win32serviceutil  # type: ignore[import-untyped]

    from cassini.service.windows_service import CassiniService

    win32serviceutil.StartService(CassiniService._svc_name_)


def _service_stop() -> None:
    """Stop the Cassini Windows Service."""
    _require_windows()
    import win32serviceutil  # type: ignore[import-untyped]

    from cassini.service.windows_service import CassiniService

    win32serviceutil.StopService(CassiniService._svc_name_)


@cli.group()
def service() -> None:
    """Manage the Cassini Windows Service."""


@service.command()
def install() -> None:
    """Install Cassini as a Windows Service."""
    _service_install()
    click.echo("Cassini service installed.")


@service.command()
def uninstall() -> None:
    """Remove the Cassini Windows Service."""
    _service_uninstall()
    click.echo("Cassini service removed.")


@service.command()
def start() -> None:
    """Start the Cassini Windows Service."""
    _service_start()
    click.echo("Cassini service started.")


@service.command()
def stop() -> None:
    """Stop the Cassini Windows Service."""
    _service_stop()
    click.echo("Cassini service stopped.")


@cli.command("mcp-server")
@click.option(
    "--transport",
    type=click.Choice(["stdio", "sse"]),
    default="stdio",
    show_default=True,
    help="MCP transport type",
)
@click.option("--port", default=3001, show_default=True, help="Port for SSE transport")
@click.option(
    "--allow-writes",
    is_flag=True,
    default=False,
    help="Enable write tools (samples submit, plant/user creation)",
)
@click.option("--server", default=None, help="Cassini server URL [env: CASSINI_SERVER_URL]")
@click.option("--api-key", default=None, help="API key [env: CASSINI_API_KEY]")
def mcp_server_cmd(
    transport: str, port: int, allow_writes: bool, server: str | None, api_key: str | None
) -> None:
    """Start the MCP server for AI agent integration.

    Exposes Cassini data as MCP tools for LLM agents. Read-only by
    default — pass --allow-writes to enable mutation tools.

    Authentication is via CASSINI_API_KEY env var or --api-key flag.
    The key is zeroed from the environment after reading for security.

    Examples:

        cassini mcp-server                          # stdio, read-only
        cassini mcp-server --allow-writes           # stdio, read+write
        cassini mcp-server --transport sse --port 3001  # SSE transport
    """
    from cassini.cli.mcp_server import run_mcp_server

    asyncio.run(
        run_mcp_server(
            server_url=server,
            api_key=api_key,
            allow_writes=allow_writes,
            transport=transport,
            port=port,
        )
    )


def _redact_url(url: str) -> str:
    """Redact credentials from a database URL for display.

    Uses ``urllib.parse.urlparse`` to correctly handle passwords that
    contain ``@`` characters (e.g. ``user:p@ss@host``).
    """
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.username or parsed.password:
            # Reconstruct with credentials replaced by ***
            # netloc = user:pass@host:port -> ***@host:port
            host_part = parsed.hostname or ""
            if parsed.port:
                host_part = f"{host_part}:{parsed.port}"
            replaced = parsed._replace(netloc=f"***@{host_part}")
            return urllib.parse.urlunparse(replaced)
    except Exception:
        pass
    return url


def main() -> None:
    """Main entrypoint for ``python -m cassini``."""
    cli()


if __name__ == "__main__":
    main()
