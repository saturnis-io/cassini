# Cluster Test Environment — Step-by-Step

## Prerequisites

- Docker Desktop running
- Python 3.11+ with Cassini dev-installed (`pip install -e ".[all]"`)
- `asyncpg`, `httpx`, `redis` installed (`pip install asyncpg httpx redis`)

## Step 1: Verify dependencies

```powershell
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend
pip install -e ".[all]"
pip install asyncpg httpx redis
```

Verify:
```powershell
cassini version
python -c "import asyncpg; print('asyncpg OK')"
python -c "import httpx; print('httpx OK')"
```

## Step 2: Start Docker infrastructure

```powershell
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend\test-envs\cluster
docker compose up -d --wait
docker compose ps
```

You should see `valkey` and `postgres` both with status `healthy`.

## Step 3: Start Node 1 (Terminal 1)

**Copy-paste this entire block** into a PowerShell window:

```powershell
# --- Load cluster env ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend\test-envs\cluster
Get-Content .env.cluster | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
}

# --- Verify env loaded ---
echo "JWT_SECRET: $env:CASSINI_JWT_SECRET"
echo "DATABASE_URL: $env:CASSINI_DATABASE_URL"
echo "BROKER_URL: $env:CASSINI_BROKER_URL"

# --- Start Node 1 ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend
$env:CASSINI_ROLES = "api,ingestion"
cassini serve --port 8001
```

Wait until you see `Uvicorn running on http://127.0.0.1:8001`.

Verify in a separate terminal:
```powershell
curl http://localhost:8001/health
```

## Step 4: Start Node 2 (Terminal 2)

Open a **new PowerShell window**. **Copy-paste this entire block**:

```powershell
# --- Load cluster env ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend\test-envs\cluster
Get-Content .env.cluster | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
}

# --- Verify env loaded ---
echo "JWT_SECRET: $env:CASSINI_JWT_SECRET"
echo "DATABASE_URL: $env:CASSINI_DATABASE_URL"
echo "BROKER_URL: $env:CASSINI_BROKER_URL"

# --- Start Node 2 ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend
$env:CASSINI_ROLES = "api,spc"
cassini serve --no-migrate --port 8002
```

## Step 5: Start Node 3 (Terminal 3)

Open a **third PowerShell window**. **Copy-paste this entire block**:

```powershell
# --- Load cluster env ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend\test-envs\cluster
Get-Content .env.cluster | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
}

# --- Verify env loaded ---
echo "JWT_SECRET: $env:CASSINI_JWT_SECRET"
echo "DATABASE_URL: $env:CASSINI_DATABASE_URL"
echo "BROKER_URL: $env:CASSINI_BROKER_URL"

# --- Start Node 3 ---
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend
$env:CASSINI_ROLES = "spc,reports,erp,purge"
cassini serve --no-migrate --port 8003
```

## Step 6: Run the smoke test (Terminal 4)

Open a **fourth terminal**:

```powershell
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend
python test-envs\cluster\test-cluster.py
```

All 6 phases should PASS.

## Step 7: Manual inspection

### Login and get a token

```powershell
$body = '{"username":"admin","password":"admin123admin"}'
$resp = Invoke-RestMethod -Uri http://localhost:8001/api/v1/auth/login -Method POST -Body $body -ContentType "application/json"
$token = $resp.access_token
$headers = @{ Authorization = "Bearer $token" }
```

### Check cluster status

```powershell
Invoke-RestMethod -Uri http://localhost:8001/api/v1/cluster/status -Headers $headers | ConvertTo-Json -Depth 5
```

Look for: `mode: "cluster"`, `broker: "valkey"`, multiple nodes listed.

### Check health with admin detail

```powershell
Invoke-RestMethod -Uri http://localhost:8001/health -Headers $headers | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://localhost:8002/health -Headers $headers | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://localhost:8003/health -Headers $headers | ConvertTo-Json -Depth 5
```

Look for: `roles` array on each node matching the expected layout.

### Verify cross-node data visibility

```powershell
# List plants from Node 1
Invoke-RestMethod -Uri http://localhost:8001/api/v1/plants -Headers $headers | ConvertTo-Json

# Same plants visible from Node 2
Invoke-RestMethod -Uri http://localhost:8002/api/v1/plants -Headers $headers | ConvertTo-Json
```

### Submit a sample on Node 1, verify on Node 2

```powershell
# First, find a characteristic ID from the smoke test
$chars = Invoke-RestMethod -Uri "http://localhost:8001/api/v1/characteristics?limit=5" -Headers $headers
$charId = $chars[0].id  # or $chars.items[0].id depending on response shape
echo "Using characteristic ID: $charId"

# Submit sample on Node 1
$sample = '{"characteristic_id":' + $charId + ',"measurements":[10.1,10.0,9.9,10.2,10.0]}'
$result = Invoke-RestMethod -Uri http://localhost:8001/api/v1/samples -Method POST -Body $sample -ContentType "application/json" -Headers $headers
echo "Sample ID: $($result.sample_id), In Control: $($result.in_control)"

# Read it back from Node 2
Invoke-RestMethod -Uri "http://localhost:8002/api/v1/samples/$($result.sample_id)" -Headers $headers | ConvertTo-Json
```

### Try the CLI

```powershell
cassini login --server http://localhost:8001
cassini plants list
cassini cluster status
cassini health
```

### Connect the frontend (optional)

```powershell
cd C:\Users\djbra\Projects\saturnis\apps\cassini\frontend
$env:VITE_API_URL = "http://localhost:8001"
npm run dev
```

Open http://localhost:5173, login as `admin` / `admin123admin`.

## Step 8: Tear down

1. **Ctrl+C** in each of the 3 node terminals
2. Stop Docker infrastructure:

```powershell
cd C:\Users\djbra\Projects\saturnis\apps\cassini\backend\test-envs\cluster
docker compose down        # Keep data for next run
docker compose down -v     # Wipe everything (fresh start next time)
```

## What to look for

| Thing to verify | Where | Expected |
|----------------|-------|----------|
| All 3 nodes healthy | `curl localhost:800{1,2,3}/health` | `status: "healthy"` |
| Shared DB | Create on Node 1, read on Node 2 | Same data |
| Cross-node auth | Login on Node 1, use token on Node 2 | 200 OK |
| Cluster mode | `/api/v1/cluster/status` | `mode: "cluster"` |
| Broker connected | `/api/v1/cluster/status` | `broker: "valkey"` |
| Roles correct | `/health` (authenticated) | Node 1: api,ingestion; Node 2: api,spc; Node 3: spc,reports,erp,purge |
| SPC processing | Submit sample, check `in_control` | Boolean result returned |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `cassini` not found | `pip install -e ".[all]"` from backend dir |
| `ModuleNotFoundError: asyncpg` | `pip install asyncpg` |
| Port already in use | `taskkill /F /FI "IMAGENAME eq python.exe"` then retry |
| Docker containers unhealthy | `docker compose logs` to see errors |
| "table does not exist" on Node 2/3 | Node 1 must start first (runs migrations) |
| Auth fails cross-node (401) | Each terminal needs its own env load — verify `echo $env:CASSINI_JWT_SECRET` matches in all windows |
| Plant code conflict (409) | Test is idempotent with unique codes, but wipe DB if needed: `docker compose down -v && docker compose up -d --wait` |
| Sample submit 400 "Invalid input" | Expected on fresh characteristics with no control limits — the smoke test handles this |
| Admin has no permissions (403) | DB needs the Default Plant seed — wipe and re-run migrations |
