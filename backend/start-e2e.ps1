$env:OPENSPC_DATABASE_URL = "sqlite+aiosqlite:///./test-e2e.db"
$env:OPENSPC_SANDBOX = "true"
$env:OPENSPC_ADMIN_PASSWORD = "admin"
$env:OPENSPC_DEV_MODE = "true"
Set-Location "C:\Users\djbra\Projects\SPC-client\backend"

# Delete old test DB for clean state
if (Test-Path "test-e2e.db") { Remove-Item "test-e2e.db" -Force }

# Run migrations
& alembic upgrade head

# Start server
& python -m uvicorn openspc.main:app --host 0.0.0.0 --port 8000
