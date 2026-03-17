"""CLI authentication commands."""
from __future__ import annotations

import asyncio

import click
import httpx

from cassini.cli.credentials import save_credential


@click.command()
@click.option("--server", required=True, help="Cassini server URL (e.g. http://localhost:8000)")
@click.option("--username", prompt=True, help="Username")
@click.option("--password", prompt=True, hide_input=True, help="Password")
@click.option("--profile", default="default", show_default=True, help="Credential profile name")
def login(server: str, username: str, password: str, profile: str) -> None:
    """Authenticate and store CLI credentials.

    Logs in with username/password, creates a scoped CLI API key,
    and stores it in ~/.cassini/credentials.json for future commands.
    """

    async def _login() -> None:
        base = server.rstrip("/")
        async with httpx.AsyncClient(base_url=f"{base}/api/v1") as client:
            # Step 1: Authenticate with username/password to get a JWT
            resp = await client.post(
                "/auth/login",
                json={"username": username, "password": password},
            )
            if not resp.is_success:
                click.echo(f"Login failed: {resp.status_code}", err=True)
                raise SystemExit(1)

            token = resp.json().get("access_token")
            if not token:
                click.echo("Login failed: no access token in response", err=True)
                raise SystemExit(1)

            # Step 2: Create a CLI token using the JWT
            resp2 = await client.post(
                "/auth/cli-token",
                json={"label": "cli"},
                headers={"Authorization": f"Bearer {token}"},
            )
            if not resp2.is_success:
                click.echo(
                    f"Failed to create CLI token: {resp2.status_code}", err=True
                )
                raise SystemExit(1)

            api_key = resp2.json()["key"]

        save_credential(base, api_key, profile=profile)
        click.echo(f"Logged in to {base} as {username} (profile: {profile})")

    asyncio.run(_login())
