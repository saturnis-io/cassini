#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/backend && alembic upgrade head

echo "Starting Cassini..."
exec uvicorn cassini.main:app --host "${CASSINI_HOST:-0.0.0.0}" --port "${CASSINI_PORT:-8000}"
