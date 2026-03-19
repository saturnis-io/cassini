# start-cluster.ps1 — Start a 3-node Cassini cluster for local testing
#
# Node layout:
#   Node 1 (port 8001): api,ingestion    — API + data ingestion
#   Node 2 (port 8002): api,spc          — API + SPC consumer
#   Node 3 (port 8003): spc,reports,erp,purge — Worker + singleton engines
#
# Prerequisites:
#   - Docker Desktop running
#   - pip install cassini[databases] (or pip install asyncpg)
#   - Run from apps/cassini/backend/

param(
    [switch]$SkipInfra  # Skip docker compose if infra is already running
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = (Resolve-Path "$ScriptDir\..\..").Path

# --- Verify prerequisites ---

Write-Host "`n=== Cassini Cluster Startup ===" -ForegroundColor Cyan

if (-not $SkipInfra) {
    # Check Docker is running
    try {
        docker info *>$null
    }
    catch {
        Write-Host "ERROR: Docker is not running. Start Docker Desktop first." -ForegroundColor Red
        exit 1
    }

    # Start infrastructure
    Write-Host "`n[1/5] Starting infrastructure (Valkey + PostgreSQL)..." -ForegroundColor Yellow
    Push-Location $ScriptDir
    docker compose up -d --wait
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: docker compose failed" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "  Infrastructure ready." -ForegroundColor Green
}
else {
    Write-Host "`n[1/5] Skipping infrastructure (--SkipInfra)" -ForegroundColor DarkGray
}

# --- Load shared environment ---

Write-Host "`n[2/5] Loading cluster environment..." -ForegroundColor Yellow
$envFile = Join-Path $ScriptDir ".env.cluster"
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            [Environment]::SetEnvironmentVariable($parts[0], $parts[1], "Process")
        }
    }
}
Write-Host "  Environment loaded." -ForegroundColor Green

# --- Start Node 1 (with migrations) ---

Write-Host "`n[3/5] Starting Node 1 (port 8001, roles: api,ingestion)..." -ForegroundColor Yellow
Write-Host "  Running migrations on first start..." -ForegroundColor DarkGray

$node1Cmd = "cd '$BackendDir'; `$env:CASSINI_ROLES='api,ingestion'; cassini serve --port 8001"
$node1 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $node1Cmd -PassThru

# Wait for Node 1 to become healthy
Write-Host "  Waiting for Node 1 health..." -ForegroundColor DarkGray
$maxWait = 60
$waited = 0
$healthy = $false
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:8001/health" -TimeoutSec 3 -ErrorAction Stop
        if ($response.status -eq "healthy") {
            $healthy = $true
            break
        }
    }
    catch {
        # Node not ready yet
    }
}

if (-not $healthy) {
    Write-Host "ERROR: Node 1 failed to become healthy after ${maxWait}s" -ForegroundColor Red
    Write-Host "  Check the Node 1 terminal for errors." -ForegroundColor Red
    exit 1
}
Write-Host "  Node 1 healthy." -ForegroundColor Green

# --- Start Node 2 ---

Write-Host "`n[4/5] Starting Node 2 (port 8002, roles: api,spc)..." -ForegroundColor Yellow
$node2Cmd = "cd '$BackendDir'; `$env:CASSINI_ROLES='api,spc'; cassini serve --no-migrate --port 8002"
$node2 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $node2Cmd -PassThru
Write-Host "  Node 2 started (PID: $($node2.Id))." -ForegroundColor Green

# --- Start Node 3 ---

Write-Host "`n[5/5] Starting Node 3 (port 8003, roles: spc,reports,erp,purge)..." -ForegroundColor Yellow
$node3Cmd = "cd '$BackendDir'; `$env:CASSINI_ROLES='spc,reports,erp,purge'; cassini serve --no-migrate --port 8003"
$node3 = Start-Process powershell -ArgumentList "-NoExit", "-Command", $node3Cmd -PassThru
Write-Host "  Node 3 started (PID: $($node3.Id))." -ForegroundColor Green

# --- Summary ---

Write-Host "`n=== Cluster Running ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Node 1: http://localhost:8001  (api, ingestion)   PID: $($node1.Id)"
Write-Host "  Node 2: http://localhost:8002  (api, spc)         PID: $($node2.Id)"
Write-Host "  Node 3: http://localhost:8003  (spc, reports, erp, purge)  PID: $($node3.Id)"
Write-Host ""
Write-Host "  Valkey:     localhost:6379"
Write-Host "  PostgreSQL: localhost:5433  (user: cassini, db: cassini_cluster)"
Write-Host ""
Write-Host "  Frontend:   cd apps/cassini/frontend && VITE_API_URL=http://localhost:8001 npm run dev"
Write-Host ""
Write-Host "  Stop:       .\test-envs\cluster\stop-cluster.ps1"
Write-Host "  Test:       python test-envs\cluster\test-cluster.py"
Write-Host ""
