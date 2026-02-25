@echo off
echo Testing structlog output...
set CASSINI_DATABASE_URL=sqlite+aiosqlite:///./test_structlog.db
set CASSINI_JWT_SECRET=test-key
set CASSINI_ADMIN_USERNAME=admin
set CASSINI_ADMIN_PASSWORD=password
set CASSINI_DEV_MODE=true
set CASSINI_LOG_FORMAT=json
echo Starting server with JSON logging...
echo Check stderr output for JSON-formatted log lines
python -m uvicorn cassini.main:app --host 127.0.0.1 --port 8000
