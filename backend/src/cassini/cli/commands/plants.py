"""Plant management CLI commands."""
from __future__ import annotations

import asyncio

import click

from cassini.cli.output import format_output


@click.group()
def plants() -> None:
    """Manage plants."""


@plants.command("list")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def plants_list(ctx: click.Context, fmt: str | None) -> None:
    """List all plants."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.plants_list()
            click.echo(format_output(data, fmt=fmt, columns=["id", "name", "timezone"]))

    asyncio.run(_run())


@plants.command("get")
@click.argument("plant_id", type=int)
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def plants_get(ctx: click.Context, plant_id: int, fmt: str | None) -> None:
    """Get plant details."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.plants_get(plant_id)
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


@plants.command("create")
@click.option("--name", required=True, help="Plant name")
@click.option("--timezone", default="UTC", show_default=True, help="Plant timezone")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def plants_create(
    ctx: click.Context, name: str, timezone: str, fmt: str | None
) -> None:
    """Create a new plant."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.plants_create(name, timezone=timezone)
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())
