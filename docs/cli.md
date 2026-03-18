# CLI Reference

The `cassini` command is available after installing via pip (`pip install -e .`) or the Windows Installer (if PATH was added). These commands work on Windows, macOS, and Linux unless noted.

## Server Commands

| Command | Description | Platform |
|---------|-------------|----------|
| `cassini serve` | Start server (runs migrations first) | All |
| `cassini serve --no-migrate` | Start server, skip migrations | All |
| `cassini serve --host 0.0.0.0 --port 9000` | Custom host and port | All |
| `cassini migrate` | Run database migrations only | All |
| `cassini create-admin` | Create admin user (interactive) | All |
| `cassini version` | Print version and build info | All |
| `cassini check` | Validate config, database, license | All |
| `cassini tray` | Launch system tray / menu bar companion | All (desktop) |
| `cassini service install` | Install as Windows Service | Windows |
| `cassini service uninstall` | Remove Windows Service | Windows |
| `cassini service start` | Start the Windows Service | Windows |
| `cassini service stop` | Stop the Windows Service | Windows |

## Behavior

`cassini serve` auto-migrates the database before starting. Use `--no-migrate` if migrations are managed separately (e.g., in a CI/CD pipeline).

Host and port default to values in `cassini.toml` (see [Configuration](configuration.md)), falling back to `127.0.0.1:8000`.

## Background Service

| Platform | Method |
|----------|--------|
| **Windows** | `cassini service install` (built-in) |
| **Linux** | systemd unit file — see [Deployment](deployment.md#linux-systemd) |
| **macOS** | launchd plist — see [Getting Started](getting-started.md#running-in-background) |

> **Linux/macOS tip:** Use `systemd` or `launchd` to run Cassini as a background service. See [Production Deployment](deployment.md) for ready-made service files.

---

## Connection & Authentication

The remote CLI commands connect to a running Cassini server over HTTP. Before using resource commands, configure the server URL and authenticate.

### Server URL

Set the server URL via environment variable or the `login` command:

```bash
# Environment variable
export CASSINI_SERVER_URL=https://factory.example.com:8000

# Or specify during login
cassini login --server https://factory.example.com:8000
```

The default server URL is `http://127.0.0.1:8000`.

### Authentication

**Interactive login** — authenticates with username/password and stores an API key in `~/.cassini/credentials.toml`:

```bash
cassini login --server https://factory.example.com:8000
# Username: admin
# Password: ********
# ✓ Logged in. API key stored in ~/.cassini/credentials.toml
```

**API key via environment** — for CI/CD, scripts, and MCP server:

```bash
export CASSINI_API_KEY=cassini_ak_...
export CASSINI_SERVER_URL=https://factory.example.com:8000
cassini plants list
```

API keys can be created in the Cassini web UI under Settings > API Keys, or via the self-service CLI token endpoint (`POST /api/v1/cli-auth/token`).

### Credential Storage

Credentials are stored in `~/.cassini/credentials.toml` with one section per server:

```toml
[servers."https://factory.example.com:8000"]
api_key = "cassini_ak_..."
default = true
```

The `CASSINI_API_KEY` environment variable takes precedence over stored credentials.

---

## Resource Commands

All resource commands follow a `cassini <resource> <verb>` pattern. They connect to the server specified by `CASSINI_SERVER_URL` or the default stored credential.

### Plants

```bash
cassini plants list                          # List all plants
cassini plants list --output json            # JSON output
```

### Characteristics

```bash
cassini characteristics list                  # List all characteristics
cassini characteristics list --plant-id 1     # Filter by plant
cassini characteristics list --output csv     # CSV output
```

### Samples

```bash
cassini samples submit --char-id 1 --values 10.1,10.2,10.3    # Submit inline values
cassini samples submit --char-id 1 --file measurements.csv      # Submit from CSV file
cassini samples submit --char-id 1 --file data.json             # Submit from JSON file
```

### Capability

```bash
cassini capability list                       # List capability summaries
cassini capability list --plant-id 1          # Filter by plant
```

### Violations

```bash
cassini violations list                       # List recent violations
cassini violations list --plant-id 1          # Filter by plant
cassini violations list --limit 50            # Limit results
```

### Users

```bash
cassini users list                            # List users (admin only)
```

### Audit Log

```bash
cassini audit list                            # List recent audit entries
cassini audit list --limit 100                # More entries
```

### License

```bash
cassini license show                          # Show license status
```

### API Keys

```bash
cassini api-keys list                         # List API keys
cassini api-keys create --name "CI pipeline"  # Create new key
cassini api-keys revoke --key-id <id>         # Revoke a key
```

### Health & Status

```bash
cassini health                                # Server health check
cassini status                                # Server status (version, uptime, etc.)
```

### Cluster (Enterprise)

```bash
cassini cluster status                        # Cluster topology and node roles
```

---

## Output Modes

The CLI auto-detects the output mode based on whether stdout is a TTY:

| Mode | When | Flag |
|------|------|------|
| **Table** | TTY (interactive terminal) | `--output table` |
| **JSON** | Piped / non-TTY | `--output json` |
| **CSV** | Explicit only | `--output csv` |

Override the auto-detection with `--output`:

```bash
# Force JSON even in a terminal
cassini plants list --output json

# Force table even when piped
cassini plants list --output table | less

# CSV for spreadsheet import
cassini characteristics list --output csv > chars.csv
```

JSON output writes one JSON object (or array) to stdout, suitable for piping to `jq`:

```bash
cassini plants list --output json | jq '.[].name'
```

---

## MCP Server

The MCP (Model Context Protocol) server exposes Cassini's API as tools for AI agents (Claude, etc.).

### Starting the Server

```bash
# Default: stdio transport (for direct integration)
cassini mcp-server

# SSE transport (for network access)
cassini mcp-server --transport sse --port 8081

# Enable write operations (disabled by default for safety)
cassini mcp-server --allow-writes

# Combined
cassini mcp-server --transport sse --port 8081 --allow-writes
```

Requires the `[mcp]` extra: `pip install cassini[mcp]`.

### Configuration

The MCP server uses the same authentication as the CLI (`CASSINI_SERVER_URL` + `CASSINI_API_KEY` or stored credentials).

| Variable | Default | Description |
|----------|---------|-------------|
| `CASSINI_SERVER_URL` | `http://127.0.0.1:8000` | Cassini server to connect to |
| `CASSINI_API_KEY` | *(from credentials)* | API key for authentication |

### Tool Surface

The MCP server exposes the following tool categories:

| Category | Tools | Default Mode |
|----------|-------|--------------|
| Plants | `list_plants` | Read |
| Characteristics | `list_characteristics`, `get_characteristic` | Read |
| Samples | `list_samples`, `submit_sample` | `submit_sample` requires `--allow-writes` |
| Capability | `get_capability`, `list_capability` | Read |
| Violations | `list_violations` | Read |
| Health | `health_check`, `server_status` | Read |
| Cluster | `cluster_status` | Read |

### Security

- **Read-only by default** — write operations (sample submission, etc.) are disabled unless `--allow-writes` is passed
- **stdio transport** binds to the parent process only (no network exposure)
- **SSE transport** binds to `127.0.0.1` by default — use a reverse proxy for remote access
- Authentication is required — the MCP server uses the same API key as the CLI

---

## Cluster Operations

Cluster mode enables multi-node Cassini deployments with role-based workload distribution. Requires an Enterprise license and a Valkey/Redis broker.

### Prerequisites

```bash
pip install cassini[cluster]
```

Set the broker URL and node roles:

```bash
export CASSINI_BROKER_URL=redis://valkey-host:6379
export CASSINI_ROLES=api,engine     # This node handles API + SPC engine
cassini serve
```

### Node Roles

| Role | Responsibilities |
|------|-----------------|
| `api` | Serves HTTP API and WebSocket connections |
| `engine` | Runs SPC engine (control limits, Nelson rules, CUSUM/EWMA) |
| `ingest` | Manages MQTT/OPC-UA data ingestion providers |

A single node can have multiple roles (default: `api,engine`). In a cluster, roles can be split across nodes for horizontal scaling.

### Cluster Status

```bash
cassini cluster status
```

Returns cluster topology, node roles, leader election state, and broker connectivity. This command requires an Enterprise license.

### Health & Readiness

```bash
cassini health        # Liveness check (is the server running?)
```

The `/api/v1/health` endpoint returns basic liveness. The `/api/v1/cluster/status` endpoint (Enterprise) returns detailed cluster topology including all connected nodes, their roles, and leader status.
