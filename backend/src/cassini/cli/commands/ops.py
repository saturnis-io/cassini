"""Operational CLI commands — health, status, cluster."""
from __future__ import annotations

import asyncio

import click

from cassini.cli.output import format_output

# All possible node roles — used to detect uncovered roles
ALL_ROLES = {"api", "spc", "ingestion", "reports", "erp", "purge"}


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


@click.group()
def cluster() -> None:
    """Cluster management commands."""


@cluster.command("status")
@click.option("--json", "fmt", flag_value="json", help="Output as JSON")
@click.pass_context
def cluster_status(ctx: click.Context, fmt: str | None) -> None:
    """Show cluster status: nodes, roles, broker, and coverage gaps."""

    async def _run() -> None:
        async with ctx.obj["client"]() as client:
            data = await client.cluster_status()

        if fmt == "json":
            click.echo(format_output(data, fmt="json"))
            return

        # --- Header ---
        mode = data.get("mode", "unknown")
        broker = data.get("broker", "unknown")
        queue_depth = data.get("queue_depth", 0)
        nodes = data.get("nodes", [])

        mode_color = "green" if mode == "cluster" else "yellow"
        click.echo()
        click.secho(f"  Mode:   {mode}", fg=mode_color, bold=True)
        click.echo(f"  Broker: {broker}")
        click.echo(f"  Queue:  {queue_depth} pending")
        click.echo(f"  Nodes:  {len(nodes)}")

        # --- Node table ---
        click.echo()
        # Column widths
        hdr = f"  {'NODE':<40}  {'ROLES':<35}  {'STATUS':<10}  {'VERSION'}"
        click.echo(hdr)
        click.echo(f"  {'-' * 40}  {'-' * 35}  {'-' * 10}  {'-' * 10}")

        covered_roles: set[str] = set()
        for node in nodes:
            node_id = node.get("id", "?")
            hostname = node.get("hostname", "?")
            pid = node.get("pid", "?")
            roles = node.get("roles", [])
            node_status = node.get("status", "?")
            version = node.get("version", "?")

            # "all" means every role
            if "all" in roles:
                covered_roles.update(ALL_ROLES)
                roles_str = "all (" + ", ".join(sorted(ALL_ROLES)) + ")"
            else:
                covered_roles.update(roles)
                roles_str = ", ".join(roles)

            # Short node label: hostname:pid
            label = f"{hostname}:{pid}"

            status_color = "green" if node_status == "healthy" else "red"
            click.echo(
                f"  {label:<40}  {roles_str:<35}  "
                + click.style(f"{node_status:<10}", fg=status_color)
                + f"  {version}"
            )

        # --- Leader info ---
        leaders = data.get("leader_info")
        if leaders:
            click.echo()
            click.secho("  Leaders:", bold=True)
            for role, leader_node in leaders.items():
                click.echo(f"    {role}: {leader_node}")

        # --- Coverage analysis ---
        click.echo()
        uncovered = ALL_ROLES - covered_roles
        if uncovered:
            click.secho("  WARNING: Uncovered roles:", fg="red", bold=True)
            for role in sorted(uncovered):
                click.echo(click.style(f"    X {role}", fg="red"))
            click.echo()
            click.echo("  These roles have no node assigned. Affected features:")
            role_descriptions = {
                "api": "HTTP API and WebSocket connections",
                "spc": "Statistical process control evaluation",
                "ingestion": "MQTT and OPC-UA data ingestion",
                "reports": "Scheduled PDF report generation",
                "erp": "ERP/LIMS synchronization",
                "purge": "Data retention enforcement",
            }
            for role in sorted(uncovered):
                desc = role_descriptions.get(role, "")
                click.echo(f"      {role}: {desc}")
        else:
            click.secho("  All roles covered OK", fg="green")

        click.echo()

    asyncio.run(_run())
