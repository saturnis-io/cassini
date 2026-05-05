# Cassini full-stack test harness

This harness spins up every external service Cassini speaks to — databases,
brokers, MQTT, OPC-UA — alongside the Cassini backend and a built frontend
preview. It is what end-to-end tests should target. CI brings it up, runs
the test suite, then tears it down.

The compose file lives one level up so it sits next to the existing
`docker-compose.yml` / `docker-compose.test-dbs.yml` / `docker-compose.prod.yml`:

```
apps/cassini/
  docker-compose.full.yml          <- this harness
  testing/harness/
    compose/
      mosquitto.conf
      mosquitto-passwd.README.md
    opcua_sim/
      Dockerfile
      requirements.txt
      server.py
    README.md                      <- you are here
```

## Services

| Service               | Port (host) | Purpose                                                                       |
| --------------------- | ----------- | ----------------------------------------------------------------------------- |
| `cassini-postgres`    | 5432        | PostgreSQL 16. Default backing store for the backend when `CASSINI_DB_DIALECT=postgresql`. |
| `cassini-mysql`       | 3306        | MySQL 8.4.                                                                    |
| `cassini-mssql`       | 1433        | SQL Server 2022. Provisions a `cassini` login + DB via `mssql-init.sh`.       |
| `cassini-valkey`      | 6379        | Valkey 8 (Redis-compatible). Used by the broker for cluster-mode tests.       |
| `cassini-mosquitto`   | 1883, 8883  | Eclipse Mosquitto 2. Plain + TLS listeners, basic auth, no anonymous.         |
| `cassini-opcua-sim`   | 4840        | Custom Python OPC-UA simulator (`asyncua`) — five gauges + counter + state.   |
| `cassini-backend`     | 8001 -> 8000 | FastAPI backend (built from `apps/cassini/Dockerfile`). Serves both API and bundled SPA. |
| `cassini-frontend`    | 5174 -> 4173 | Vite preview of the built frontend. Useful when you want a fresh dev bundle separate from the backend's baked-in copy. |

All services share a single bridge network, `cassini-test-net`. Volume names
are prefixed `cassini-test-` to keep them clearly distinguishable from the
production compose stack's volumes.

## Starting the harness

```bash
# Validate the compose file (no containers started)
docker compose -f apps/cassini/docker-compose.full.yml config

# Bring everything up and block until each healthcheck passes
docker compose -f apps/cassini/docker-compose.full.yml up -d --wait

# Tail logs for one service
docker compose -f apps/cassini/docker-compose.full.yml logs -f cassini-backend

# Tear everything down (preserve volumes)
docker compose -f apps/cassini/docker-compose.full.yml down

# Tear down + wipe volumes (fresh databases next run)
docker compose -f apps/cassini/docker-compose.full.yml down -v
```

## Selecting a database dialect for the backend

The backend uses SQLite by default for fast cold starts. To point it at one
of the running database services, set `CASSINI_DB_DIALECT` and override
`CASSINI_DATABASE_URL` accordingly:

```bash
# PostgreSQL
CASSINI_DB_DIALECT=postgresql \
CASSINI_DATABASE_URL='postgresql+asyncpg://cassini:cassini@cassini-postgres:5432/cassini' \
  docker compose -f apps/cassini/docker-compose.full.yml up -d --wait

# MySQL
CASSINI_DB_DIALECT=mysql \
CASSINI_DATABASE_URL='mysql+asyncmy://cassini:cassini@cassini-mysql:3306/cassini' \
  docker compose -f apps/cassini/docker-compose.full.yml up -d --wait

# MSSQL — the password contains '#' which must be URL-encoded as %23.
CASSINI_DB_DIALECT=mssql \
CASSINI_DATABASE_URL='mssql+aioodbc://cassini:Cassini%23Test1@cassini-mssql:1433/cassini?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes' \
  docker compose -f apps/cassini/docker-compose.full.yml up -d --wait
```

The `x-db-urls` block at the top of `docker-compose.full.yml` documents the
canonical DSN strings.

## First-time setup

Two pieces are intentionally not committed and must be generated locally
before the Mosquitto container will boot:

1. **Mosquitto password file** — see
   [`compose/mosquitto-passwd.README.md`](compose/mosquitto-passwd.README.md).
2. **TLS certificates for the 8883 listener** — same README documents the
   `openssl` commands that produce `compose/certs/{ca.crt,server.crt,server.key}`.

If you only need plain MQTT (port 1883) you can still generate self-signed
placeholder certs — Mosquitto refuses to start without them.

## Adding new tests

End-to-end tests live in `apps/cassini/frontend/e2e/` (Playwright) and the
backend's `tests/` tree (pytest). The harness exposes:

- `http://localhost:8001/api/v1/...` — backend API
- `http://localhost:5174/` — frontend bundle
- `mqtt://cassini:cassini@localhost:1883` — MQTT plain
- `mqtts://cassini:cassini@localhost:8883` — MQTT TLS
- `opc.tcp://localhost:4840/cassini/test/` — OPC-UA simulator
- `redis://localhost:6379/0` — Valkey (broker)

Inside the compose network the same services resolve by their container
names (`cassini-backend`, `cassini-postgres`, `cassini-mosquitto`, etc.),
which is what the backend's `depends_on` env vars reference.

When you add a new external dependency:

1. Add the service to `docker-compose.full.yml` with the `cassini-` prefix
   and a healthcheck.
2. Wire `cassini-backend.depends_on` to it (`condition: service_healthy`).
3. Document it in the table above.
4. If it has its own config files, drop them under
   `apps/cassini/testing/harness/compose/` and mount them in.

The harness is intentionally a single compose file rather than a stack
across multiple files: simpler to validate (`docker compose config`) and
simpler to map onto CI service definitions.
