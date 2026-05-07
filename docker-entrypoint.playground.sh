#!/bin/sh
# Playground entrypoint: migrate, seed (idempotent), then serve.
# Used by docker-compose.playground.yml — separate from the production
# entrypoint so seeding never runs against a real customer database.

set -e

cd /app/backend

echo "[playground] Running alembic migrations..."
alembic upgrade head

if [ "${CASSINI_PLAYGROUND_SEED:-0}" = "1" ]; then
  MANIFEST=/app/data/playground-manifest.json

  if [ -f "$MANIFEST" ]; then
    echo "[playground] Manifest found at $MANIFEST — skipping re-seed."
  else
    # The seed script needs a SYNC driver (psycopg2 for postgres). The
    # production image only ships asyncpg, so install psycopg2-binary
    # transiently for the seed step.
    echo "[playground] Installing psycopg2-binary for seed step..."
    pip install --no-cache-dir psycopg2-binary >/dev/null 2>&1 || true

    echo "[playground] Seeding Screenshot Tour Plant + commercial fixtures..."
    # The seed script converts async URLs to sync drivers internally,
    # so pass the original CASSINI_DATABASE_URL as-is.
    if python scripts/seed_e2e_unified.py --db-url "$CASSINI_DATABASE_URL" --manifest "$MANIFEST"; then
      echo "[playground] Seed complete. Manifest written to $MANIFEST."
    else
      echo "[playground] Seed FAILED — server will still start, but data is missing." >&2
    fi
  fi
fi

echo "[playground] Starting Cassini on ${CASSINI_HOST:-0.0.0.0}:${CASSINI_PORT:-8000}..."
exec uvicorn cassini.main:app --host "${CASSINI_HOST:-0.0.0.0}" --port "${CASSINI_PORT:-8000}"
