@echo off
echo Testing structlog output...
set OPENSPC_DATABASE_URL=sqlite+aiosqlite:///./test_structlog.db
set OPENSPC_JWT_SECRET=test-key
set OPENSPC_ADMIN_USERNAME=admin
set OPENSPC_ADMIN_PASSWORD=password
set OPENSPC_DEV_MODE=true
set OPENSPC_LOG_FORMAT=json
echo Starting server with JSON logging...
echo Check stderr output for JSON-formatted log lines
python -m uvicorn openspc.main:app --host 127.0.0.1 --port 8000
