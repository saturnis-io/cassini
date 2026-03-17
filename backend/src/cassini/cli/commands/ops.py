"""Operational CLI commands — health, status."""
from __future__ import annotations

import asyncio

import click

from cassini.cli.output import format_output


@click.command()
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def health(ctx: click.Context, fmt: str | None) -> None:
    """Check server health."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.health()
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


@click.command()
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def status(ctx: click.Context, fmt: str | None) -> None:
    """Show server status (health + license + version)."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            health_data = await client.health()
            license_data = await client.license_status()
            combined = {
                "health": health_data.get("status", "unknown"),
                "edition": license_data.get("edition", "unknown"),
                "tier": license_data.get("tier", "unknown"),
                "max_plants": license_data.get("max_plants", "unknown"),
            }
            click.echo(format_output(combined, fmt=fmt))

    asyncio.run(_run())
