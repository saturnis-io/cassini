@echo off
chcp 65001 >nul 2>&1
REM OpenSPC Backend Startup Script (Windows)

REM Get ESC character for ANSI color support (Windows 10+)
set "ESC="
for /f %%e in ('powershell -noprofile -command "[char]27" 2^>nul') do set "ESC=%%e"

if defined ESC (
    set "BLUE=%ESC%[38;5;25m"
    set "TEAL=%ESC%[38;5;80m"
    set "DIM=%ESC%[2m"
    set "BOLD=%ESC%[1m"
    set "GREEN=%ESC%[32m"
    set "GRAY=%ESC%[90m"
    set "R=%ESC%[0m"
) else (
    set "BLUE="
    set "TEAL="
    set "DIM="
    set "BOLD="
    set "GREEN="
    set "GRAY="
    set "R="
)

echo.
echo %BOLD%%BLUE%  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██████╗  ██████╗%R%
echo %BOLD%%BLUE% ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔══██╗██╔════╝%R%
echo %BOLD%%BLUE% ██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗██████╔╝██║     %R%
echo %BOLD%%BLUE% ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║██╔═══╝ ██║     %R%
echo %BOLD%%BLUE% ╚██████╔╝██║     ███████╗██║ ╚████║███████║██║     ╚██████╗%R%
echo %BOLD%%BLUE%  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝      ╚═════╝%R%
echo.
echo  %DIM%─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─%R%%GRAY% UCL%R%
echo  %TEAL%      ●            ●                       ●%R%
echo  %TEAL%● ─ ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ●%R%%GRAY%  CL%R%
echo  %TEAL%                ●              ●%R%
echo  %DIM%─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─%R%%GRAY% LCL%R%
echo.
echo  %DIM%Statistical Process Control Platform%R%
echo  %DIM%Backend API Server%R%
echo.

REM Check if virtual environment exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Install dependencies
echo Checking dependencies...
pip install -e . -q

REM Run database migrations
echo.
echo Running database migrations...
alembic upgrade head
if errorlevel 1 (
    echo WARNING: Migration failed - database may need setup
    echo Run: alembic upgrade head
    echo.
)

REM Enable sandbox mode (dev tools: database reset, seed scripts)
set "OPENSPC_SANDBOX=true"

REM Stable JWT secret for dev (sessions survive server restarts)
set "OPENSPC_JWT_SECRET=openspc-dev-secret-do-not-use-in-production"

REM Admin credentials (change via OPENSPC_ADMIN_USERNAME / OPENSPC_ADMIN_PASSWORD)
set "OPENSPC_ADMIN_USERNAME=admin"
set "OPENSPC_ADMIN_PASSWORD=password"

REM Start the server
echo.
echo  %GREEN%→%R% Backend:  %GREEN%http://localhost:8000%R%
echo  %GREEN%→%R% API Docs: %GREEN%http://localhost:8000/docs%R%
echo  %DIM%  Sandbox mode enabled (dev tools available)%R%
echo  %DIM%  Login: admin / password%R%
echo  %DIM%  Press Ctrl+C to stop%R%
echo.

uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
