#!/usr/bin/env bash
# start-cluster.sh — Start a 3-node Cassini cluster for local testing
#
# Node layout:
#   Node 1 (port 8001): api,ingestion    — API + data ingestion
#   Node 2 (port 8002): api,spc          — API + SPC consumer
#   Node 3 (port 8003): spc,reports,erp,purge — Worker + singleton engines
#
# Prerequisites:
#   - Docker running
#   - pip install cassini[databases] (or pip install asyncpg)
#   - Run from apps/cassini/backend/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PIDS=()

cleanup() {
    echo ""
    echo "=== Shutting down cluster ==="
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Stopping PID $pid..."
            kill "$pid" 2>/dev/null || true
        fi
    done
    wait 2>/dev/null || true
    echo "  All nodes stopped."
    echo "  Infrastructure still running. Run stop-cluster.sh to tear down."
}
trap cleanup EXIT INT TERM

SKIP_INFRA="${1:-}"

echo ""
echo "=== Cassini Cluster Startup ==="

# --- Verify Docker ---

if [ "$SKIP_INFRA" != "--skip-infra" ]; then
    if ! docker info >/dev/null 2>&1; then
        echo "ERROR: Docker is not running. Start Docker Desktop first."
        exit 1
    fi

    echo ""
    echo "[1/5] Starting infrastructure (Valkey + PostgreSQL)..."
    (cd "$SCRIPT_DIR" && docker compose up -d --wait)
    echo "  Infrastructure ready."
else
    echo ""
    echo "[1/5] Skipping infrastructure (--skip-infra)"
fi

# --- Load shared environment ---

echo ""
echo "[2/5] Loading cluster environment..."
while IFS= read -r line; do
    # Skip comments and empty lines
    line="$(echo "$line" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')"
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    export "$line"
done < "$SCRIPT_DIR/.env.cluster"
echo "  Environment loaded."

# --- Start Node 1 (with migrations) ---

echo ""
echo "[3/5] Starting Node 1 (port 8001, roles: api,ingestion)..."
echo "  Running migrations on first start..."
cd "$BACKEND_DIR"
CASSINI_ROLES="api,ingestion" cassini serve --port 8001 &
PIDS+=($!)

# Wait for Node 1 health
echo "  Waiting for Node 1 health..."
MAX_WAIT=60
WAITED=0
HEALTHY=false
while [ $WAITED -lt $MAX_WAIT ]; do
    sleep 2
    WAITED=$((WAITED + 2))
    BODY=$(curl -sf http://localhost:8001/health 2>/dev/null || true)
    if [ -n "$BODY" ]; then
        STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
        if [ "$STATUS" = "healthy" ]; then
            HEALTHY=true
            break
        fi
    fi
done

if [ "$HEALTHY" != "true" ]; then
    echo "ERROR: Node 1 failed to become healthy after ${MAX_WAIT}s"
    exit 1
fi
echo "  Node 1 healthy."

# --- Start Node 2 ---

echo ""
echo "[4/5] Starting Node 2 (port 8002, roles: api,spc)..."
CASSINI_ROLES="api,spc" cassini serve --no-migrate --port 8002 &
PIDS+=($!)
echo "  Node 2 started (PID: ${PIDS[-1]})."

# --- Start Node 3 ---

echo ""
echo "[5/5] Starting Node 3 (port 8003, roles: spc,reports,erp,purge)..."
CASSINI_ROLES="spc,reports,erp,purge" cassini serve --no-migrate --port 8003 &
PIDS+=($!)
echo "  Node 3 started (PID: ${PIDS[-1]})."

# --- Summary ---

echo ""
echo "=== Cluster Running ==="
echo ""
echo "  Node 1: http://localhost:8001  (api, ingestion)   PID: ${PIDS[0]}"
echo "  Node 2: http://localhost:8002  (api, spc)         PID: ${PIDS[1]}"
echo "  Node 3: http://localhost:8003  (spc, reports, erp, purge)  PID: ${PIDS[2]}"
echo ""
echo "  Valkey:     localhost:6379"
echo "  PostgreSQL: localhost:5433  (user: cassini, db: cassini_cluster)"
echo ""
echo "  Frontend:   cd apps/cassini/frontend && VITE_API_URL=http://localhost:8001 npm run dev"
echo ""
echo "  Stop:       Ctrl+C (nodes) then ./test-envs/cluster/stop-cluster.sh (infra)"
echo "  Test:       python test-envs/cluster/test-cluster.py"
echo ""

# Keep script alive — Ctrl+C triggers cleanup trap
wait
