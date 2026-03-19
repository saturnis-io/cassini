# stop-cluster.ps1 — Stop Cassini cluster nodes and optionally infrastructure
#
# Usage:
#   .\stop-cluster.ps1           # Stop nodes + infrastructure (preserve data)
#   .\stop-cluster.ps1 -Clean    # Stop everything and wipe volumes

param(
    [switch]$Clean  # Wipe PostgreSQL volumes
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== Stopping Cassini Cluster ===" -ForegroundColor Cyan

# --- Kill Cassini processes by port ---

$ports = @(8001, 8002, 8003)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Stopping Node on port ${port} (PID: $($proc.Id), Name: $($proc.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    if (-not $connections) {
        Write-Host "  Port ${port}: no process found" -ForegroundColor DarkGray
    }
}

# --- Stop infrastructure ---

Write-Host "`n  Stopping Docker infrastructure..." -ForegroundColor Yellow
Push-Location $ScriptDir
if ($Clean) {
    Write-Host "  Wiping volumes (--Clean)..." -ForegroundColor Red
    docker compose down -v
}
else {
    docker compose down
}
Pop-Location

Write-Host "`n=== Cluster Stopped ===" -ForegroundColor Cyan
if (-not $Clean) {
    Write-Host "  PostgreSQL data preserved. Use -Clean to wipe volumes.`n"
}
