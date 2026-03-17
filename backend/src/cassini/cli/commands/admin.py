"""Admin CLI commands — users, audit, license, API keys."""
from __future__ import annotations

import asyncio

import click

from cassini.cli.output import format_output


# ── Users ────────────────────────────────────────────────────────────────


@click.group()
def users() -> None:
    """Manage users."""


@users.command("list")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def users_list(ctx: click.Context, fmt: str | None) -> None:
    """List all users."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.users_list()
            click.echo(
                format_output(data, fmt=fmt, columns=["id", "username", "is_active"])
            )

    asyncio.run(_run())


@users.command("create")
@click.option("--username", required=True, help="Username")
@click.option("--password", required=True, prompt=True, hide_input=True, help="Password")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def users_create(
    ctx: click.Context, username: str, password: str, fmt: str | None
) -> None:
    """Create a new user."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.users_create(username, password)
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


# ── Audit ────────────────────────────────────────────────────────────────


@click.group()
def audit() -> None:
    """Search audit logs."""


@audit.command("search")
@click.option("--resource-type", default=None, help="Filter by resource type")
@click.option("--action", default=None, help="Filter by action")
@click.option("--limit", type=int, default=50, show_default=True, help="Max results")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def audit_search(
    ctx: click.Context,
    resource_type: str | None,
    action: str | None,
    limit: int,
    fmt: str | None,
) -> None:
    """Search audit log entries."""

    async def _run() -> None:
        params: dict[str, object] = {"limit": limit}
        if resource_type is not None:
            params["resource_type"] = resource_type
        if action is not None:
            params["action"] = action

        async with ctx.obj["client"]() as client:
            data = await client.audit_search(**params)
            click.echo(
                format_output(
                    data,
                    fmt=fmt,
                    columns=["id", "timestamp", "resource_type", "action", "username"],
                )
            )

    asyncio.run(_run())


# ── License ──────────────────────────────────────────────────────────────


@click.group()
def license() -> None:
    """License management."""


@license.command("status")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def license_status(ctx: click.Context, fmt: str | None) -> None:
    """Show current license status."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.license_status()
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


# ── API Keys ─────────────────────────────────────────────────────────────


@click.group("api-keys")
def api_keys() -> None:
    """Manage API keys."""


@api_keys.command("list")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def api_keys_list(ctx: click.Context, fmt: str | None) -> None:
    """List all API keys."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.api_keys_list()
            click.echo(
                format_output(
                    data, fmt=fmt, columns=["id", "name", "scope", "expires_at"]
                )
            )

    asyncio.run(_run())


@api_keys.command("create")
@click.option("--name", required=True, help="API key name")
@click.option(
    "--scope",
    type=click.Choice(["read-only", "read-write"]),
    default="read-write",
    show_default=True,
    help="Key scope",
)
@click.option("--plant-ids", default=None, help="Comma-separated plant IDs to scope to")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def api_keys_create(
    ctx: click.Context,
    name: str,
    scope: str,
    plant_ids: str | None,
    fmt: str | None,
) -> None:
    """Create a new API key."""

    async def _run() -> None:
        parsed_ids: list[int] | None = None
        if plant_ids is not None:
            parsed_ids = [int(x.strip()) for x in plant_ids.split(",")]

        async with ctx.obj["client"]() as client:
            data = await client.api_keys_create(
                name, scope=scope, plant_ids=parsed_ids
            )
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())
