# OpenSPC Backend

Event-driven Statistical Process Control system built with FastAPI and SQLAlchemy. The backend provides a REST API for managing equipment hierarchies, control charts, Nelson rules evaluation, industrial data ingestion (MQTT/Sparkplug B, OPC-UA), outbound SPC event publishing, and multi-database administration.

## Project Structure

```
src/openspc/
  main.py              # FastAPI app, lifespan, router registration
  api/
    deps.py            # Shared dependencies (auth, DB session, rate limiter)
    schemas/           # Pydantic request/response models
    v1/                # 20 route modules (~120+ endpoints)
      annotations.py       auth.py             api_keys.py
      brokers.py           characteristics.py   characteristic_config.py
      data_entry.py        database_admin.py    devtools.py
      hierarchy.py         opcua_servers.py     plants.py
      providers.py         samples.py           tags.py
      users.py             violations.py        websocket.py
  core/
    config.py          # Pydantic-settings (OPENSPC_ env prefix)
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

# Run database migrations
alembic upgrade head

# Start the server
uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
```

For development dependencies (pytest, ruff, mypy):

```bash
pip install -e ".[dev]"
```

## Environment Variables

All variables use the `OPENSPC_` prefix and can be set in a `.env` file.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENSPC_DATABASE_URL` | `sqlite+aiosqlite:///./openspc.db` | SQLAlchemy async connection string |
| `OPENSPC_JWT_SECRET` | *(auto-generated)* | Secret key for JWT signing |
| `OPENSPC_COOKIE_SECURE` | `false` | Set `true` for HTTPS-only refresh cookies |
| `OPENSPC_ADMIN_USERNAME` | `admin` | Bootstrap admin username |
| `OPENSPC_ADMIN_PASSWORD` | *(auto-generated)* | Bootstrap admin password |
| `OPENSPC_CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `OPENSPC_RATE_LIMIT_LOGIN` | `5/minute` | Login endpoint rate limit |
| `OPENSPC_RATE_LIMIT_DEFAULT` | `60/minute` | Default API rate limit |
| `OPENSPC_LOG_FORMAT` | `console` | `console` or `json` (structured logging) |
| `OPENSPC_SANDBOX` | `false` | Enable sandbox/devtools mode |
| `OPENSPC_DEV_MODE` | `false` | Disable enterprise enforcement (forced password change) |

## Database Support

| Database | Driver | Connection String Example |
|----------|--------|--------------------------|
| SQLite | aiosqlite | `sqlite+aiosqlite:///./openspc.db` |
| PostgreSQL | asyncpg | `postgresql+asyncpg://user:pass@host/dbname` |
| MySQL | aiomysql | `mysql+aiomysql://user:pass@host/dbname` |
| MSSQL | aioodbc | `mssql+aioodbc://user:pass@host/dbname?driver=ODBC+Driver+17+for+SQL+Server` |

Database credentials configured through the admin UI are encrypted at rest using Fernet symmetric encryption (key stored in `.db_encryption_key`, separate from the JWT secret).

## Testing

```bash
pip install -e ".[dev]"
pytest
pytest --cov=openspc     # with coverage
```

The test suite uses pytest-asyncio for async tests and httpx for API integration tests.
