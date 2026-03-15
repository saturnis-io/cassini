# Cassini Backend

Event-driven Statistical Process Control system built with FastAPI and SQLAlchemy. The backend provides a REST API for managing equipment hierarchies, control charts, Nelson rules evaluation, industrial data ingestion (MQTT/Sparkplug B, OPC-UA), outbound SPC event publishing, and multi-database administration.

## Project Structure

```
src/cassini/
  main.py              # FastAPI app, lifespan, router registration
  __main__.py          # python -m cassini entrypoint
  cli/
    main.py            # Click CLI (serve, migrate, create-admin, check, version, service, tray)
  api/
    deps.py            # Shared dependencies (auth, DB session, rate limiter)
    schemas/           # Pydantic request/response models
    v1/                # 46 route modules (~300+ endpoints)
      ai_analysis.py       annotations.py       anomaly.py
      api_keys.py          audit.py             auth.py
      brokers.py           capability.py        characteristic_config.py
      characteristics.py   data_entry.py        database_admin.py
      devtools.py          distributions.py     doe.py
      erp_connectors.py    explain.py           fai.py
      gage_bridges.py      health.py            hierarchy.py
      import_router.py     ishikawa.py          license.py
      material_classes.py  material_overrides.py materials.py
      msa.py               multivariate.py      notifications.py
      oidc.py              opcua_servers.py      plants.py
      predictions.py       providers.py         push.py
      retention.py         rule_presets.py       samples.py
      scheduled_reports.py signatures.py        system_settings.py
      tags.py              users.py             violations.py
      websocket.py
  core/
    config.py          # Pydantic-settings (CASSINI_ env prefix + TOML)
    toml_config.py     # cassini.toml loader and Pydantic settings source
    broadcast.py       # WebSocket event broadcaster
    publish.py         # MQTT outbound publisher (violations, stats, Nelson)
    rate_limit.py      # SlowAPI rate limiting
    logging.py         # Structured logging (structlog, console/JSON)
    auth/              # JWT + Argon2, admin bootstrap, RBAC helpers
    engine/            # SPC engine: control limits, Nelson rules, rolling window
    events/            # In-process async event bus
    alerts/            # Alert management
    providers/         # Data ingestion layer
      tag.py           #   MQTT tag-to-characteristic provider
      opcua_provider.py#   OPC-UA subscription-to-SPC provider
      buffer.py        #   Shared subgroup buffer
      manager.py       #   Tag provider lifecycle
      opcua_manager.py #   OPC-UA provider lifecycle
      protocol.py      #   Protocol abstraction
      manual.py        #   Manual data entry provider
  service/
    windows_service.py # Windows Service (CassiniSPC) via pywin32
  tray/
    app.py             # System tray companion (pystray, health polling)
    icons.py           # Dynamic status icon generation (Pillow)
    __main__.py        # Frozen tray entrypoint (avoids heavy backend imports)
  db/
    database.py        # Async engine + session factory
    dialects.py        # Multi-dialect helpers (SQLite, PG, MySQL, MSSQL)
    models/            # 14 SQLAlchemy model files (19 tables)
    repositories/      # 11 async repository classes (CRUD + queries)
  mqtt/
    client.py          # aiomqtt wrapper
    manager.py         # Multi-broker lifecycle manager
    discovery.py       # Topic tree discovery
    sparkplug.py       # Sparkplug B decoder
    sparkplug_b_pb2.py # Generated protobuf
  opcua/
    client.py          # asyncua OPC-UA client wrapper
    manager.py         # Multi-server lifecycle manager
    browsing.py        # Node tree browsing + attribute reads
  utils/
    constants.py       # Shared constants
    statistics.py      # Statistical helper functions
```

## Key Modules

**SPC Engine** (`core/engine/`) -- Computes control limits (X-bar, R, S, p, np, c, u) and evaluates all 8 Nelson rules in real time against incoming samples. Supports rolling-window recalculation.

**Industrial Connectivity** (`mqtt/`, `opcua/`) -- Connects to MQTT brokers (with Sparkplug B decoding) and OPC-UA servers. Manages connections, discovers topics/nodes, and feeds data into the SPC engine through the provider layer.

**Provider Layer** (`core/providers/`) -- Bridges external data sources (MQTT tags, OPC-UA subscriptions, manual entry) to the SPC engine via a shared subgroup buffer. Each provider manages its own subscriptions and lifecycle.

**MQTT Outbound** (`core/publish.py`) -- Publishes SPC events (violations, statistics snapshots, Nelson rule triggers) to configurable MQTT topics with per-event filtering and rate control.

**Database Administration** (`api/v1/database_admin.py`, `db/dialects.py`) -- Admin-only endpoints for database configuration, connection testing, backup, vacuum, and migration status. Supports live switching between SQLite, PostgreSQL, MySQL, and MSSQL with encrypted credential storage.

## Installation

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -e .

# Start the server (auto-migrates database)
cassini serve

# Or start manually without the CLI
alembic upgrade head
uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000
```

For development dependencies (pytest, ruff, mypy):

```bash
pip install -e ".[dev]"
```

For desktop distribution extras (pystray, pywin32, Pillow):

```bash
pip install -e ".[desktop]"
```

## CLI

The `cassini` command is registered as a console script entry point.

```
cassini serve                  # auto-migrate + start server
cassini serve --no-migrate     # skip migrations
cassini serve --host 0.0.0.0 --port 9000
cassini migrate                # run migrations only
cassini create-admin           # interactive admin creation
cassini version                # print version + build info
cassini check                  # validate config, DB, license
cassini tray                   # launch system tray (requires [desktop] extra)
cassini service install        # install Windows Service
cassini service start/stop     # control Windows Service
```

Host and port default to values in `cassini.toml`, falling back to `127.0.0.1:8000`. The TOML config file is searched at: `CASSINI_CONFIG` env var, then current directory, then system path (`C:\ProgramData\Cassini\` on Windows, `/etc/cassini/` on Linux).

## Building Executables

PyInstaller spec files are included for freezing into standalone executables:

```bash
pip install "pyinstaller>=6.5.0"
pyinstaller cassini-server.spec   # server + frontend + migrations
pyinstaller cassini-tray.spec     # tray companion (lightweight)
```

The Inno Setup installer script is at `installer/cassini.iss`. See `installer/assets/README` for wizard image specs.

## Environment Variables

All variables use the `CASSINI_` prefix and can be set in a `.env` file.

| Variable | Default | Description |
|----------|---------|-------------|
| `CASSINI_DATABASE_URL` | `sqlite+aiosqlite:///./cassini.db` | SQLAlchemy async connection string |
| `CASSINI_JWT_SECRET` | *(auto-generated)* | Secret key for JWT signing. Auto-generated and persisted to `.jwt_secret` if not set. **Set explicitly in production.** |
| `CASSINI_COOKIE_SECURE` | `true` | Set the `Secure` flag on refresh token cookie. Must be `true` for HTTPS (production) |
| `CASSINI_ADMIN_USERNAME` | `admin` | Bootstrap admin username (created on first startup when no users exist) |
| `CASSINI_ADMIN_PASSWORD` | *(auto-generated)* | Bootstrap admin password. **Set to a strong value in production.** |
| `CASSINI_CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed CORS origins |
| `CASSINI_RATE_LIMIT_LOGIN` | `5/minute` | Login endpoint rate limit |
| `CASSINI_RATE_LIMIT_DEFAULT` | `60/minute` | Default API rate limit |
| `CASSINI_LOG_FORMAT` | `console` | `console` or `json` (structured logging) |
| `CASSINI_SANDBOX` | `false` | Enable sandbox/devtools mode. **Must be `false` in production.** |
| `CASSINI_DEV_MODE` | `false` | Disable enterprise enforcement (forced password change). **Must be `false` in production.** |
| `CASSINI_DB_ENCRYPTION_KEY` | *(auto-generated)* | Fernet key for encrypting database credentials. Persisted to `.db_encryption_key` if not set. **Separate from JWT secret.** |
| `CASSINI_ALLOWED_DB_PORTS` | `5432,3306,1433` | Comma-separated allowed database ports (SSRF protection). Add non-standard ports if your databases use custom ports. |
| `CASSINI_VAPID_PRIVATE_KEY` | `""` | VAPID private key for web push notifications |
| `CASSINI_VAPID_PUBLIC_KEY` | `""` | VAPID public key for web push notifications |
| `CASSINI_VAPID_CONTACT_EMAIL` | `""` | Contact email for VAPID protocol |
| `CASSINI_LICENSE_FILE` | `""` | Path to license file (commercial edition) |
| `CASSINI_LICENSE_PUBLIC_KEY_FILE` | `""` | Path to Ed25519 public key PEM for license verification |
| `CASSINI_DEV_TIER` | `false` | Simulate commercial license in development |

## Database Support

| Database | Driver | Connection String Example |
|----------|--------|--------------------------|
| SQLite | aiosqlite | `sqlite+aiosqlite:///./cassini.db` |
| PostgreSQL | asyncpg | `postgresql+asyncpg://user:pass@host/dbname` |
| MySQL | aiomysql | `mysql+aiomysql://user:pass@host/dbname` |
| MSSQL | aioodbc | `mssql+aioodbc://user:pass@host/dbname?driver=ODBC+Driver+17+for+SQL+Server` |

Database credentials configured through the admin UI are encrypted at rest using Fernet symmetric encryption (key stored in `.db_encryption_key`, separate from the JWT secret).

## Testing

```bash
pip install -e ".[dev]"
pytest
pytest --cov=cassini     # with coverage
```

The test suite uses pytest-asyncio for async tests and httpx for API integration tests.
