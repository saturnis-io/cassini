# Testing harness

Cassini ships with a Docker-orchestrated test harness that brings up every external dependency the platform speaks to — three SQL databases, a Valkey broker, an MQTT broker, an OPC-UA simulator, and the Cassini backend and frontend themselves — so end-to-end tests can exercise the whole stack without touching a real factory deployment.

## Layout

```text
cassini/
├── docker-compose.full.yml          Full stack: DBs + broker + MQTT + OPC-UA + backend + frontend
├── docker-compose.test-dbs.yml      Only the SQL databases (lighter weight)
├── docker-compose.yml               Production single-stack (PostgreSQL + backend)
├── docker-compose.prod.yml          Production multi-stack overrides
├── testing/
│   └── harness/
│       ├── compose/                 Mosquitto config, certs, passwd
│       └── opcua_sim/               OPC-UA simulator container source
└── backend/
    └── tests/
        ├── containerized/           pytest fixtures using testcontainers-python
        ├── integration/             multi-DB integration tests
        └── unit/                    unit tests, no containers
```

## Bring up the full stack

```bash
docker compose -f docker-compose.full.yml up -d --wait
```

The `--wait` flag blocks until every service reports healthy. Then:

| Service | URL | Credentials |
|---------|-----|-------------|
| Cassini backend | http://localhost:8001 | `admin` / `cassini` |
| Cassini frontend (Vite preview) | http://localhost:5174 | `admin` / `cassini` |
| PostgreSQL | localhost:5432 | `cassini` / `cassini` |
| MySQL | localhost:3306 | `cassini` / `cassini` |
| MSSQL | localhost:1433 | `sa` / `Cassini#Test1` |
| Valkey | localhost:6379 | (none) |
| Mosquitto MQTT | localhost:1883 | `cassini` / `cassini` |
| Mosquitto MQTTS | localhost:8883 | `cassini` / `cassini` |
| OPC-UA simulator | opc.tcp://localhost:4840 | (none) |

Tear down (with volumes, so the next run is from a clean slate):

```bash
docker compose -f docker-compose.full.yml down -v
```

### Pick a database dialect

The backend container reads `CASSINI_DB_DIALECT` to decide which database to connect to. All three SQL services come up regardless, so you can run the same harness for any dialect:

```bash
CASSINI_DB_DIALECT=postgresql docker compose -f docker-compose.full.yml up -d --wait
CASSINI_DB_DIALECT=mysql      docker compose -f docker-compose.full.yml up -d --wait
CASSINI_DB_DIALECT=mssql      docker compose -f docker-compose.full.yml up -d --wait
CASSINI_DB_DIALECT=sqlite     docker compose -f docker-compose.full.yml up -d --wait
```

Default is `sqlite` for the fastest spin-up.

## Validate the compose file without spinning anything up

```bash
docker compose -f docker-compose.full.yml config
```

## Containerized pytest fixtures

The `backend/tests/containerized/` directory uses `testcontainers-python` to spin real Docker containers for tests that need a live broker, real MQTT, real OPC-UA, or a real SQL dialect. These tests are **opt-in** — the default `pytest` run never touches them.

### Prerequisites

```bash
cd backend
pip install -e ".[dev,test-containerized]"
```

Docker Desktop (Windows / macOS) or Docker Engine (Linux / WSL2) must be running.

### Markers

| Marker | Meaning |
|--------|---------|
| `containerized` | The test starts at least one Docker container. |
| `live_broker` | The test publishes / subscribes to a live MQTT broker. |

### Running

```bash
cd backend

# All containerized tests (parametrized across SQLite + PostgreSQL + MySQL + MSSQL)
pytest tests/containerized -m containerized

# Only MQTT ingestion tests
pytest -m "containerized and live_broker"

# One dialect only
pytest tests/containerized -m containerized -k sqlite

# Verify collection without running (no Docker needed)
python -m pytest tests/containerized --collect-only -q
```

If Docker isn't reachable at collection time, every fixture calls `pytest.skip()` gracefully — no test failures, no import errors.

### Available fixtures

| Fixture | Scope | Container |
|---------|-------|-----------|
| `cassini_db_url` | session, parametrized | postgres / mysql / mssql / sqlite |
| `mqtt_broker` | session | mosquitto |
| `mqtt_publisher` | function | (uses `mqtt_broker`) |
| `valkey_broker` | session | valkey |
| `opcua_simulator` | session | opcua_sim |
| `cassini_backend` | session | cassini-backend |
| `auth_token` | session | (uses `cassini_backend`) |

## CI matrix

GitHub Actions runs the following on every PR plus a nightly schedule:

| Job | Trigger | What it runs |
|-----|---------|--------------|
| `backend` | Every PR | Unit + integration tests on SQLite. |
| `backend-multidb` | Every PR | Integration tests against PostgreSQL and MySQL services. |
| `frontend` | Every PR | `tsc --noEmit` + production build. |
| `e2e` | Every PR | Playwright functional suite against a seeded SQLite backend. |
| `e2e-multidb` | Nightly + label `multi-db` | Playwright suite against PostgreSQL and MySQL. |
| `containerized` | Nightly + label `containerized` | Full containerized fixture suite. |

To trigger an opt-in job on a PR without waiting for nightly, add the corresponding label.

## Multi-dialect dialect-agnostic seed

The seed script at `backend/scripts/seed_e2e_unified.py` produces an identical fixture set across SQLite, PostgreSQL, MySQL, and MSSQL. Same plants, same characteristics, same sample distributions, same expected violation count. Run it manually from the backend directory (the script lives at `backend/scripts/`, not on the `cassini.scripts` import path):

```bash
cd backend
python scripts/seed_e2e_unified.py --db-url "sqlite+aiosqlite:///./test-e2e.db"
python scripts/seed_e2e_unified.py --db-url "postgresql+asyncpg://cassini:cassini@localhost:5432/cassini_test"
python scripts/seed_e2e_unified.py --db-url "mysql+aiomysql://cassini:cassini@localhost:3306/cassini_test"
```

This is the exact invocation `frontend/e2e/global-setup.ts` uses, so any test that passes locally against SQLite should pass against the others — and vice versa.

## OPC-UA simulator

The `cassini-opcua-sim` container exposes a small synthetic plant on `opc.tcp://localhost:4840`:

- `Plant1.LineA.Station1.Diameter` (BaseDataType: `Float`, sinusoidal)
- `Plant1.LineA.Station1.Temperature` (BaseDataType: `Float`, slow drift)
- `Plant1.LineA.Station1.PartCount` (BaseDataType: `Int32`, monotonic)

The simulator is built from `testing/harness/opcua_sim/`. Add nodes by editing the simulator script and rebuilding:

```bash
docker compose -f docker-compose.full.yml build cassini-opcua-sim
```

## MQTT broker (Mosquitto)

The Mosquitto container is configured with username/password auth using the credentials in `testing/harness/compose/passwd`. Topic structure follows the SparkplugB convention:

```text
spBv1.0/CassiniTest/NDATA/edge-1/<characteristic>
spBv1.0/CassiniTest/NCMD/edge-1/<characteristic>
```

Default test credentials: `cassini` / `cassini`. To add or rotate users, edit `passwd` (entries are bcrypt-hashed by `mosquitto_passwd`) and restart the container.

## Troubleshooting

**"healthcheck timing out for cassini-mssql"** — MSSQL takes 30-60 seconds on first start; the compose file already sets `start_period: 45s`. If it still fails, run `docker compose logs cassini-mssql` and check that `mssql-init.sh` ran successfully.

**"ports already allocated"** — Another Cassini instance or a postgres/mysql install on the host is bound to the same ports. Stop the conflicting service or change the host-side port mapping in the compose file.

**"healthcheck timing out for cassini-frontend"** — The first `npm ci` and `npm run build` inside the container can take 90-120 seconds. The compose file sets `start_period: 60s` and `retries: 20`, so be patient on first boot.

**Docker Desktop on Windows** — WSL2 backend recommended. The compose file uses Linux containers throughout.
