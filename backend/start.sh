#!/bin/bash
# OpenSPC Backend Startup Script (Unix/Mac/Git Bash)

echo "========================================"
echo "  OpenSPC Backend Startup"
echo "========================================"
echo

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate

# Install dependencies
echo "Checking dependencies..."
pip install -e . -q

# Run database migrations
echo
echo "Running database migrations..."
alembic upgrade head
if [ $? -ne 0 ]; then
    echo "WARNING: Migration failed - database may need setup"
    echo "Run: alembic upgrade head"
    echo
fi

# Start the server
echo
echo "Starting FastAPI server..."
echo "Backend will be available at http://localhost:8000"
echo "API docs at http://localhost:8000/docs"
echo "Press Ctrl+C to stop"
echo

uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
