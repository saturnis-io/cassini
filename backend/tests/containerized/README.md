# Containerized Integration Tests

Tests in this directory spin real Docker containers via testcontainers-python.
They are **opt-in**: the default `pytest` run (no `-m` flag) never touches them.

## Prerequisites

- Docker Desktop (Windows/Mac) or Docker Engine (Linux/WSL2) running
- `pip install -e ".[test-containerized]"` from `apps/cassini/backend/`
- For OPC UA tests: `cassini-opcua-sim:latest` image built locally
- For full backend tests: `cassini-backend:latest` image built locally

## Running

```bash
# All containerized tests (SQLite + PostgreSQL + MySQL + MSSQL parametrized)
pytest apps/cassini/backend/tests/containerized -m containerized

# Only MQTT ingestion tests (requires MQTT broker container)
pytest -m "containerized and live_broker"

# One dialect only
pytest apps/cassini/backend/tests/containerized -m containerized -k sqlite

# Verify collection without running (no Docker needed)
python -m pytest apps/cassini/backend/tests/containerized --collect-only -q
```

## Fixtures

| Fixture | Scope | Docker service |
|---|---|---|
| `cassini_db_url` | session, params=[sqlite, postgresql, mysql, mssql] | postgres / mysql / mssql |
| `mqtt_broker` | session | mosquitto |
| `mqtt_publisher` | function | (uses mqtt_broker) |
| `valkey_broker` | session | valkey |
| `opcua_simulator` | session | opcua_sim |
| `cassini_backend` | session | cassini-backend |
| `auth_token` | session | (uses cassini_backend) |

## Markers

- `containerized` — any test that starts a container
- `live_broker` — tests that also publish/subscribe to a live MQTT broker

## Skip behaviour

If Docker is not reachable at collection time, all fixtures call `pytest.skip()`
gracefully. No test failures, no import errors.
