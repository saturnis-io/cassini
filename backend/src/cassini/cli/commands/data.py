"""Data resource CLI commands — characteristics, samples, capability, violations."""
from __future__ import annotations

import asyncio

import click

from cassini.cli.output import format_output


# ── Characteristics ──────────────────────────────────────────────────────


@click.group("chars")
def chars() -> None:
    """Manage characteristics."""


@chars.command("list")
@click.option("--plant-id", type=int, default=None, help="Filter by plant ID")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def chars_list(ctx: click.Context, plant_id: int | None, fmt: str | None) -> None:
    """List characteristics."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.characteristics_list(plant_id=plant_id)
            click.echo(
                format_output(data, fmt=fmt, columns=["id", "name", "plant_id"])
            )

    asyncio.run(_run())


@chars.command("get")
@click.argument("char_id", type=int)
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def chars_get(ctx: click.Context, char_id: int, fmt: str | None) -> None:
    """Get characteristic details."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.characteristics_get(char_id)
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


# ── Samples ──────────────────────────────────────────────────────────────


@click.group()
def samples() -> None:
    """Manage samples."""


@samples.command("list")
@click.option("--char-id", type=int, default=None, help="Filter by characteristic ID")
@click.option("--limit", type=int, default=100, show_default=True, help="Max results")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def samples_list(
    ctx: click.Context, char_id: int | None, limit: int, fmt: str | None
) -> None:
    """List samples."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.samples_list(characteristic_id=char_id, limit=limit)
            items = data.get("items", data) if isinstance(data, dict) else data
            click.echo(format_output(items, fmt=fmt))

    asyncio.run(_run())


@samples.command("submit")
@click.option("--char-id", required=True, type=int, help="Characteristic ID")
@click.argument("measurements", nargs=-1, type=float, required=True)
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def samples_submit(
    ctx: click.Context, char_id: int, measurements: tuple[float, ...], fmt: str | None
) -> None:
    """Submit sample measurements.

    Pass measurements as positional arguments: cassini samples submit --char-id 10 1.0 2.0 3.0
    """

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.samples_submit(char_id, list(measurements))
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


# ── Capability ───────────────────────────────────────────────────────────


@click.group()
def capability() -> None:
    """Process capability analysis."""


@capability.command("get")
@click.argument("char_id", type=int)
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def capability_get(ctx: click.Context, char_id: int, fmt: str | None) -> None:
    """Get capability indices for a characteristic."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.capability_get(char_id)
            click.echo(format_output(data, fmt=fmt))

    asyncio.run(_run())


# ── Violations ───────────────────────────────────────────────────────────


@click.group()
def violations() -> None:
    """Manage SPC violations."""


@violations.command("list")
@click.option("--char-id", type=int, default=None, help="Filter by characteristic ID")
@click.option("--active", is_flag=True, default=False, help="Only active violations")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.option("--csv", "fmt", flag_value="csv", help="Output as CSV")
@click.pass_context
def violations_list(
    ctx: click.Context, char_id: int | None, active: bool, fmt: str | None
) -> None:
    """List SPC violations."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.violations_list(
                characteristic_id=char_id, active=active
            )
            items = data.get("items", data) if isinstance(data, dict) else data
            click.echo(format_output(items, fmt=fmt))

    asyncio.run(_run())
