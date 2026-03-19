# Cassini Cluster Test Environment

Local 3-node cluster for validating cluster mode: Valkey broker, cross-node SPC evaluation, WebSocket fan-out, and role-based node specialization.

## Prerequisites

- **Docker Desktop** running (for Valkey + PostgreSQL)
- **Python 3.11+** with Cassini installed: `pip install -e ".[databases]"` (or `pip install asyncpg`)
- **Cassini CLI** available: `cassini --help`
- The `feat/cli-cluster-mcp` branch (or merged) — provides `--roles`, `broker_url`, and cluster endpoints

## Architecture

```
                    ┌─────────────────────────────┐
                    │      Docker Compose          │
                    │                              │
                    │  ┌─────────┐  ┌───────────┐  │
                    │  │ Valkey  │  │ PostgreSQL │  │
                    │  │  :6379  │  │   :5433    │  │
                    │  └────┬────┘  └─────┬──────┘  │
                    └───────┼─────────────┼─────────┘
                            │             │
              ┌─────────────┼─────────────┼─────────────┐
              │             │             │             │
        ┌─────┴─────┐ ┌────┴──────┐ ┌────┴──────┐
        │  Node 1   │ │  Node 2   │ │  Node 3   │
        │  :8001    │ │  :8002    │ │  :8003    │
        │           │ │           │ │           │
        │ api       │ │ api       │ │ spc       │
        │ ingestion │ │ spc       │ │ reports   │
        │           │ │           │ │ erp       │
        │           │ │           │ │ purge     │
        └───────────┘ └───────────┘ └───────────┘
```

- **Node 1** — API gateway + data ingestion (MQTT/OPC-UA connections)
- **Node 2** — API gateway + SPC processing (competing consumer)
- **Node 3** — Worker: SPC + singleton engines (reports, ERP sync, data purge)
- All nodes share the same PostgreSQL database and Valkey broker

## Quickstart

### PowerShell (Windows — recommended)

```powershell
# From apps/cassini/backend/
.\test-envs\cluster\start-cluster.ps1

# Run smoke test
python test-envs\cluster\test-cluster.py

# Stop
.\test-envs\cluster\stop-cluster.ps1
.\test-envs\cluster\stop-cluster.ps1 -Clean   # Also wipe DB volumes
```

### Bash (Linux / macOS / Git Bash)

```bash
# From apps/cassini/backend/
chmod +x test-envs/cluster/*.sh
./test-envs/cluster/start-cluster.sh

# In another terminal — run smoke test
python test-envs/cluster/test-cluster.py

# Stop (Ctrl+C kills nodes, then):
./test-envs/cluster/stop-cluster.sh
./test-envs/cluster/stop-cluster.sh --clean   # Also wipe DB volumes
```

## Configuration

All nodes share `.env.cluster`. Key variables:

| Variable | Value | Purpose |
|----------|-------|---------|
| `CASSINI_DATABASE_URL` | `postgresql+asyncpg://...localhost:5433/...` | Shared database |
| `CASSINI_BROKER_URL` | `valkey://localhost:6379` | Enables cluster mode |
| `CASSINI_JWT_SECRET` | Fixed test value | Cross-node token validation |
| `CASSINI_DB_ENCRYPTION_KEY` | Fixed test value | Cross-node credential decryption |
| `CASSINI_DEV_TIER` | `enterprise` | Bypass license for cluster features |
| `CASSINI_DEV_MODE` | `true` | Skip forced password change |

## Smoke Test Phases

| Phase | What it tests |
|-------|---------------|
| 1. Infrastructure | All 3 nodes respond to `/health` with database connected |
| 2. Auth | Login on Node 1, token validates on Node 2 (shared JWT secret) |
| 3. Seed Data | Create plant + char on Node 1, visible from Node 2 (shared DB) |
| 4. Cross-Node SPC | Submit sample on Node 1, SPC completes on Node 2/3 (Valkey queue) |
| 5. Cluster Status | `/api/v1/cluster/status` reports mode=cluster, broker=valkey |
| 6. Role Verification | Each node reports correct roles via `/health` |

## Troubleshooting

### Docker errors
```bash
# Check containers
docker compose -f test-envs/cluster/docker-compose.yml ps
docker compose -f test-envs/cluster/docker-compose.yml logs
```

### Port conflicts
- **5433** (PostgreSQL): Change in `docker-compose.yml` and `.env.cluster`
- **6379** (Valkey): Change in `docker-compose.yml` and `.env.cluster`
- **8001-8003** (Cassini): Change in start scripts

### Node won't start
- Verify `asyncpg` is installed: `python -c "import asyncpg"`
- Check that Node 1 completed migrations before starting Node 2/3
- Check Cassini CLI is installed: `cassini version`

### SPC not processing cross-node
- Verify Valkey is reachable: `docker exec -it cluster-valkey-1 valkey-cli ping`
- Check `CASSINI_BROKER_URL` is set for all nodes
- Check Node 2/3 logs for SPC consumer startup messages

### Database connection refused
- Verify PostgreSQL is healthy: `docker exec -it cluster-postgres-1 pg_isready -U cassini`
- Note: Port is **5433** (not default 5432) to avoid local PG collisions

## Manual Testing

```bash
# After cluster is running, use the CLI:
cassini login --server http://localhost:8001
cassini plants list
cassini cluster status
cassini health

# Or use curl:
TOKEN=$(curl -s -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:8001/api/v1/cluster/status -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
