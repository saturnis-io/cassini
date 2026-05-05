"""MCP server for Cassini — AI agent integration.

Read-only by default. Use --allow-writes to enable write tools.
Auth via CASSINI_API_KEY env var (zeroed after read for security).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

try:
    from mcp.server import Server
    from mcp.server.lowlevel.helper_types import ReadResourceContents
    from mcp.server.stdio import stdio_server
    from mcp.types import Resource, TextContent, Tool

    HAS_MCP = True
except ImportError:
    HAS_MCP = False


def _require_mcp() -> None:
    if not HAS_MCP:
        raise ImportError(
            "MCP SDK not installed. Install with: pip install cassini[mcp]"
        )


# ── Tool definitions ──────────────────────────────────────────────────

_READ_TOOLS: dict[str, dict[str, Any]] = {
    "cassini_plants_list": {
        "description": "List all plants in the Cassini system",
        "properties": {},
    },
    "cassini_health": {
        "description": "Check Cassini server health status",
        "properties": {},
    },
    "cassini_characteristics_list": {
        "description": "List characteristics, optionally filtered by plant",
        "properties": {
            "plant_id": {
                "type": "integer",
                "description": "Filter by plant ID",
            },
        },
    },
    "cassini_capability_get": {
        "description": "Get capability indices (Cp, Cpk, Pp, Ppk) for a characteristic",
        "properties": {
            "char_id": {
                "type": "integer",
                "description": "Characteristic ID",
            },
        },
        "required": ["char_id"],
    },
    "cassini_violations_list": {
        "description": "List SPC violations, optionally filtered by characteristic",
        "properties": {
            "char_id": {
                "type": "integer",
                "description": "Filter by characteristic ID",
            },
            "active": {
                "type": "boolean",
                "description": "Only active violations",
            },
        },
    },
    "cassini_samples_query": {
        "description": "Query sample data for a characteristic",
        "properties": {
            "characteristic_id": {
                "type": "integer",
                "description": "Filter by characteristic ID",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of samples to return (default: 100)",
            },
        },
    },
    "cassini_audit_search": {
        "description": "Search audit log entries",
        "properties": {
            "resource_type": {
                "type": "string",
                "description": "Filter by resource type",
            },
            "action": {
                "type": "string",
                "description": "Filter by action",
            },
            "user_id": {
                "type": "integer",
                "description": "Filter by user ID",
            },
        },
    },
    "cassini_license_status": {
        "description": "Check Cassini license status and tier",
        "properties": {},
    },
    "cassini_replay_get": {
        "description": (
            "(Pro) Time-travel SPC snapshot — reconstruct a resource's state "
            "at a historical UTC timestamp from the hash-chained audit log."
        ),
        "properties": {
            "resource_type": {
                "type": "string",
                "description": "Resource type (currently 'characteristic').",
            },
            "resource_id": {
                "type": "integer",
                "description": "Numeric resource ID.",
            },
            "at": {
                "type": "string",
                "description": "ISO-8601 UTC timestamp to replay (e.g. '2026-03-14T14:00:00Z').",
            },
        },
        "required": ["resource_type", "resource_id", "at"],
    },
    "cassini_lakehouse_list": {
        "description": "(Pro) List the available data product tables.",
        "properties": {},
    },
    "cassini_lakehouse_export": {
        "description": (
            "(Pro) Export a lakehouse table as JSON. Other formats "
            "(parquet/arrow/csv) are available via the REST endpoint directly."
        ),
        "properties": {
            "table": {
                "type": "string",
                "description": "Table name — one of samples, measurements, violations, characteristics, plants.",
            },
            "plant_id": {
                "type": "integer",
                "description": "Restrict to a single plant.",
            },
            "columns": {
                "type": "string",
                "description": "Comma-separated subset of columns.",
            },
            "from": {
                "type": "string",
                "description": "Inclusive start ISO-8601 timestamp.",
            },
            "to": {
                "type": "string",
                "description": "Inclusive end ISO-8601 timestamp.",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum row count (1M ceiling enforced server-side).",
            },
        },
        "required": ["table"],
    },
    "cassini_cep_rules_list": {
        "description": "(Enterprise) List CEP rules for a plant.",
        "properties": {
            "plant_id": {
                "type": "integer",
                "description": "Filter by plant ID.",
            },
        },
    },
    "cassini_cep_rules_validate": {
        "description": (
            "(Enterprise) Validate a YAML CEP rule definition without "
            "persisting it. Returns line/column markers on failure."
        ),
        "properties": {
            "yaml_text": {
                "type": "string",
                "description": "Full YAML rule source.",
            },
        },
        "required": ["yaml_text"],
    },
}

_WRITE_TOOLS: dict[str, dict[str, Any]] = {
    "cassini_samples_submit": {
        "description": "Submit measurement values for a characteristic",
        "properties": {
            "char_id": {
                "type": "integer",
                "description": "Characteristic ID",
            },
            "values": {
                "type": "array",
                "items": {"type": "number"},
                "description": "Measurement values",
            },
        },
        "required": ["char_id", "values"],
    },
    "cassini_plants_create": {
        "description": "Create a new plant",
        "properties": {
            "name": {
                "type": "string",
                "description": "Plant name",
            },
            "timezone": {
                "type": "string",
                "description": "Timezone (default: UTC)",
            },
        },
        "required": ["name"],
    },
    "cassini_users_create": {
        "description": "Create a new user",
        "properties": {
            "username": {
                "type": "string",
                "description": "Username",
            },
            "password": {
                "type": "string",
                "description": "Password",
            },
        },
        "required": ["username", "password"],
    },
    "cassini_characteristics_create": {
        "description": "Create a new characteristic (not yet implemented — placeholder)",
        "properties": {
            "plant_id": {
                "type": "integer",
                "description": "Plant ID",
            },
            "name": {
                "type": "string",
                "description": "Characteristic name",
            },
        },
        "required": ["plant_id", "name"],
    },
    "cassini_cep_rules_create": {
        "description": "(Enterprise) Create a CEP rule from YAML (engineer role required at the target plant).",
        "properties": {
            "plant_id": {
                "type": "integer",
                "description": "Plant ID the rule belongs to.",
            },
            "yaml_text": {
                "type": "string",
                "description": "Full YAML rule source.",
            },
            "enabled": {
                "type": "boolean",
                "description": "Whether the rule is active on creation (default true).",
            },
        },
        "required": ["plant_id", "yaml_text"],
    },
    "cassini_cep_rules_update": {
        "description": "(Enterprise) Update an existing CEP rule's YAML or enabled flag.",
        "properties": {
            "rule_id": {
                "type": "integer",
                "description": "Rule ID to update.",
            },
            "yaml_text": {
                "type": "string",
                "description": "New YAML source. Omit to leave unchanged.",
            },
            "enabled": {
                "type": "boolean",
                "description": "New enabled flag. Omit to leave unchanged.",
            },
        },
        "required": ["rule_id"],
    },
}


def _build_tool_list(tool_defs: dict[str, dict[str, Any]]) -> list[Any]:
    """Convert internal tool definitions to MCP Tool objects."""
    tools = []
    for name, info in tool_defs.items():
        schema: dict[str, Any] = {
            "type": "object",
            "properties": info.get("properties", {}),
        }
        if "required" in info:
            schema["required"] = info["required"]
        tools.append(
            Tool(
                name=name,
                description=info["description"],
                inputSchema=schema,
            )
        )
    return tools


# ── Tool dispatch ─────────────────────────────────────────────────────


async def _dispatch_tool(
    client: Any,
    name: str,
    args: dict[str, Any],
    allow_writes: bool,
) -> Any:
    """Route tool calls to CassiniClient methods."""
    # Read tools
    if name == "cassini_plants_list":
        return await client.plants_list()
    elif name == "cassini_health":
        return await client.health()
    elif name == "cassini_characteristics_list":
        return await client.characteristics_list(plant_id=args.get("plant_id"))
    elif name == "cassini_capability_get":
        return await client.capability_get(char_id=args["char_id"])
    elif name == "cassini_violations_list":
        return await client.violations_list(
            characteristic_id=args.get("char_id"),
            active=args.get("active", False),
        )
    elif name == "cassini_samples_query":
        return await client.samples_list(
            characteristic_id=args.get("characteristic_id"),
            limit=args.get("limit", 100),
        )
    elif name == "cassini_audit_search":
        params: dict[str, Any] = {}
        if args.get("resource_type"):
            params["resource_type"] = args["resource_type"]
        if args.get("action"):
            params["action"] = args["action"]
        if args.get("user_id"):
            params["user_id"] = args["user_id"]
        return await client.audit_search(**params)
    elif name == "cassini_license_status":
        return await client.license_status()
    elif name == "cassini_replay_get":
        return await client.replay_get(
            resource_type=args["resource_type"],
            resource_id=args["resource_id"],
            at=args["at"],
        )
    elif name == "cassini_lakehouse_list":
        return await client.lakehouse_tables()
    elif name == "cassini_lakehouse_export":
        return await client.lakehouse_export(
            table=args["table"],
            format="json",
            plant_id=args.get("plant_id"),
            columns=args.get("columns"),
            from_=args.get("from"),
            to=args.get("to"),
            limit=args.get("limit"),
        )
    elif name == "cassini_cep_rules_list":
        return await client.cep_rules_list(plant_id=args.get("plant_id"))
    elif name == "cassini_cep_rules_validate":
        return await client.cep_rules_validate(yaml_text=args["yaml_text"])
    # Write tools (guarded)
    elif name == "cassini_samples_submit" and allow_writes:
        return await client.samples_submit(
            characteristic_id=args["char_id"],
            measurements=args["values"],
        )
    elif name == "cassini_plants_create" and allow_writes:
        return await client.plants_create(
            name=args["name"],
            timezone=args.get("timezone", "UTC"),
        )
    elif name == "cassini_users_create" and allow_writes:
        return await client.users_create(
            username=args["username"],
            password=args["password"],
        )
    elif name == "cassini_characteristics_create" and allow_writes:
        raise NotImplementedError(
            "cassini_characteristics_create is a placeholder — "
            "the Cassini API does not yet support single-call characteristic creation"
        )
    elif name == "cassini_cep_rules_create" and allow_writes:
        return await client.cep_rules_create(
            plant_id=args["plant_id"],
            yaml_text=args["yaml_text"],
            enabled=args.get("enabled", True),
        )
    elif name == "cassini_cep_rules_update" and allow_writes:
        return await client.cep_rules_update(
            rule_id=args["rule_id"],
            yaml_text=args.get("yaml_text"),
            enabled=args.get("enabled"),
        )
    elif name in _WRITE_TOOLS and not allow_writes:
        raise PermissionError(
            f"Tool '{name}' requires --allow-writes flag"
        )
    else:
        raise ValueError(f"Unknown tool: {name}")


# ── Resource definitions ──────────────────────────────────────────────

_RESOURCES: dict[str, dict[str, str]] = {
    "cassini://plants": {
        "name": "Plant List",
        "description": "Current plant list with summary stats",
        "mimeType": "application/json",
    },
    "cassini://health": {
        "name": "Server Health",
        "description": "Server health status, broker info, queue depth",
        "mimeType": "application/json",
    },
}


async def _dispatch_resource(client: Any, uri: str) -> Any:
    """Route resource reads to CassiniClient methods."""
    if uri == "cassini://plants":
        return await client.plants_list()
    elif uri == "cassini://health":
        return await client.health()
    else:
        raise ValueError(f"Unknown resource: {uri}")


# ── Server entrypoint ─────────────────────────────────────────────────


async def run_mcp_server(
    server_url: str | None = None,
    api_key: str | None = None,
    allow_writes: bool = False,
    transport: str = "stdio",
    port: int = 3001,
) -> None:
    """Run the Cassini MCP server.

    Args:
        server_url: Base URL of the Cassini server.
        api_key: API key for authentication.
        allow_writes: If True, register write tools.
        transport: Transport type — "stdio" or "sse".
        port: Port for SSE transport.
    """
    _require_mcp()

    from cassini.cli.client import CassiniClient

    # Read config from env, then zero the key for security
    url = server_url or os.environ.get("CASSINI_SERVER_URL", "http://localhost:8000")
    key = api_key or os.environ.get("CASSINI_API_KEY", "")
    os.environ.pop("CASSINI_API_KEY", None)

    if not key:
        logger.warning(
            "No CASSINI_API_KEY set — MCP server will make unauthenticated requests"
        )

    server = Server("cassini")

    # Build tool registry
    active_tools: dict[str, dict[str, Any]] = dict(_READ_TOOLS)
    if allow_writes:
        active_tools.update(_WRITE_TOOLS)

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return _build_tool_list(active_tools)

    # ── Resource handlers ────────────────────────────────────────────
    @server.list_resources()
    async def list_resources() -> list[Resource]:
        return [
            Resource(
                uri=uri,
                name=info["name"],
                description=info["description"],
                mimeType=info["mimeType"],
            )
            for uri, info in _RESOURCES.items()
        ]

    @server.read_resource()
    async def read_resource(uri: Any) -> list[ReadResourceContents]:
        uri_str = str(uri)
        async with CassiniClient(
            server_url=url, api_key=key, actor="mcp:resource"
        ) as client:
            data = await _dispatch_resource(client, uri_str)
        return [
            ReadResourceContents(
                content=json.dumps(data, indent=2, default=str),
                mime_type="application/json",
            )
        ]

    # ── Tool handlers ─────────────────────────────────────────────────
    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        actor = f"mcp:{name}"
        async with CassiniClient(server_url=url, api_key=key, actor=actor) as client:
            try:
                result = await _dispatch_tool(client, name, arguments, allow_writes)
                return [
                    TextContent(
                        type="text",
                        text=json.dumps(result, indent=2, default=str),
                    )
                ]
            except (PermissionError, ValueError, NotImplementedError) as e:
                return [TextContent(type="text", text=json.dumps({"error": str(e)}))]
            except Exception:
                logger.exception("MCP tool %s failed", name)
                return [TextContent(type="text", text=json.dumps({"error": "Internal error executing tool"}))]

    if transport == "stdio":
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options(),
            )
    else:
        # SSE transport
        from mcp.server.sse import SseServerTransport
        from starlette.applications import Starlette
        from starlette.routing import Route
        import uvicorn

        sse = SseServerTransport("/messages")

        async def handle_sse(request):  # type: ignore[no-untyped-def]
            async with sse.connect_sse(
                request.scope, request.receive, request._send
            ) as streams:
                await server.run(
                    streams[0],
                    streams[1],
                    server.create_initialization_options(),
                )

        app = Starlette(
            routes=[
                Route("/sse", endpoint=handle_sse),
                Route("/messages", endpoint=sse.handle_post_message, methods=["POST"]),
            ]
        )

        # Bind to localhost only — SSE transport has no inbound auth.
        # Use --sse-host to override if network binding is explicitly needed.
        config = uvicorn.Config(app, host="127.0.0.1", port=port)
        uv_server = uvicorn.Server(config)
        await uv_server.serve()
