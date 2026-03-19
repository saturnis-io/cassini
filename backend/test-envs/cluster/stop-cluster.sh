#!/usr/bin/env bash
# stop-cluster.sh — Stop Cassini cluster nodes and optionally infrastructure
#
# Usage:
#   ./stop-cluster.sh           # Stop nodes + infrastructure (preserve data)
#   ./stop-cluster.sh --clean   # Stop everything and wipe volumes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEAN=false

if [ "${1:-}" = "--clean" ]; then
    CLEAN=true
fi

echo ""
echo "=== Stopping Cassini Cluster ==="

# --- Kill Cassini processes by port ---

for PORT in 8001 8002 8003; do
    # Find process(es) listening on port (works on Linux and macOS)
    PIDS=$(lsof -ti ":$PORT" 2>/dev/null || ss -tlnp "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K\d+' || true)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | while read -r PID; do
            [ -n "$PID" ] && echo "  Stopping Node on port $PORT (PID: $PID)..." && kill "$PID" 2>/dev/null || true
        done
    else
        echo "  Port $PORT: no process found"
    fi
done

# Give processes a moment to exit
sleep 2

# --- Stop infrastructure ---

echo ""
echo "  Stopping Docker infrastructure..."
cd "$SCRIPT_DIR"
if [ "$CLEAN" = true ]; then
    echo "  Wiping volumes (--clean)..."
    docker compose down -v
else
    docker compose down
fi

echo ""
echo "=== Cluster Stopped ==="
if [ "$CLEAN" != true ]; then
    echo "  PostgreSQL data preserved. Use --clean to wipe volumes."
fi
echo ""
