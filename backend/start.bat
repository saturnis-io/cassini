@echo off
chcp 65001 >nul 2>&1
REM Cassini Backend Startup Script (Windows)

REM Get ESC character for ANSI color support (Windows 10+)
set "ESC="
for /f %%e in ('powershell -noprofile -command "[char]27" 2^>nul') do set "ESC=%%e"

if defined ESC (
    set "GOLD=%ESC%[38;2;212;175;55m"
    set "NAVY=%ESC%[38;2;8;12;22m"
    set "CREAM=%ESC%[38;2;244;241;222m"
    set "DIM=%ESC%[2m"
    set "BOLD=%ESC%[1m"
    set "GREEN=%ESC%[32m"
    set "GRAY=%ESC%[90m"
    set "ORANGE=%ESC%[38;2;224;90;61m"
    set "R=%ESC%[0m"
) else (
    set "GOLD="
    set "NAVY="
    set "CREAM="
    set "DIM="
    set "BOLD="
    set "GREEN="
    set "GRAY="
    set "ORANGE="
    set "R="
)

echo.
echo %BOLD%%GOLD%  ██████╗  █████╗  ██████╗ ██████╗ ██╗███╗   ██╗██╗%R%
echo %BOLD%%GOLD% ██╔════╝ ██╔══██╗██╔════╝██╔════╝ ██║████╗  ██║██║%R%
echo %BOLD%%GOLD% ██║      ███████║╚█████╗ ╚█████╗  ██║██╔██╗ ██║██║%R%
echo %BOLD%%GOLD% ██║      ██╔══██║ ╚═══██╗ ╚═══██╗ ██║██║╚██╗██║██║%R%
echo %BOLD%%GOLD% ╚██████╗ ██║  ██║██████╔╝██████╔╝ ██║██║ ╚████║██║%R%
echo %BOLD%%GOLD%  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═════╝  ╚═╝╚═╝  ╚═══╝╚═╝%R%
echo.
echo %CREAM%         by %BOLD%Saturnis%R%%CREAM% LLC%R%
echo.
echo  %DIM%╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌%R% %ORANGE%UCL%R%
echo  %GOLD%       ●            ●                          ●%R%
echo  %GOLD% ● ╌╌╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌╌╌╌╌ ● ╌╌╌╌╌╌╌╌ ● ╌ ●%R%  %CREAM%CL%R%
echo  %GOLD%                 ●               ●%R%
echo  %DIM%╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌%R% %ORANGE%LCL%R%
echo.
echo  %GRAY%            .  *  .     .   *   .%R%
echo  %GRAY%              .  +%GOLD%_____%GRAY%         .%R%
echo  %GRAY%          *    %GOLD%,o8888888o⹁%GRAY%     *%R%
echo  %GRAY%              %GOLD%,o888888888o⹁%R%
echo  %GRAY%         %GOLD% ~~~~O88888888888O~~~~ %R%
echo  %GRAY%        %GOLD%===== O88888888888O =====%R%
echo  %GRAY%         %GOLD% ~~~~`o888888888o´~~~~ %R%
echo  %GRAY%               %GOLD%`o8888888o´%R%
echo  %GRAY%          *      %GOLD%`"""""'     %GRAY%*%R%
echo  %GRAY%              .               .%R%
echo.
echo  %DIM%SPC Platform %CREAM%// %DIM%Backend API Server%R%
echo  %DIM%"In-control, like the Cassini Division"%R%
echo.

REM Kill any existing process on port 8000
for /f "tokens=5" %%p in ('netstat -aon ^| findstr ":8000.*LISTENING" 2^>nul') do (
    echo Killing stale process %%p on port 8000...
    taskkill /PID %%p /F >nul 2>&1
)

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
set "CASSINI_SANDBOX=true"

REM Stable JWT secret for dev (sessions survive server restarts)
set "CASSINI_JWT_SECRET=cassini-dev-secret-do-not-use-in-production"

REM Admin credentials (change via CASSINI_ADMIN_USERNAME / CASSINI_ADMIN_PASSWORD)
set "CASSINI_ADMIN_USERNAME=admin"
set "CASSINI_ADMIN_PASSWORD=password"

REM License tier: pass --pro or --enterprise to simulate paid tiers
set "EDITION_LABEL=Open (Community)"
if "%1"=="--pro" (
    set "CASSINI_DEV_TIER=pro"
    set "EDITION_LABEL=Pro (dev)"
)
if "%1"=="--enterprise" (
    set "CASSINI_DEV_TIER=enterprise"
    set "EDITION_LABEL=Enterprise (dev)"
)

REM Start the server
echo.
echo  %GREEN%→%R% Backend:  %GREEN%http://localhost:8000%R%
echo  %GREEN%→%R% API Docs: %GREEN%http://localhost:8000/docs%R%
echo  %DIM%  Sandbox mode enabled (dev tools available)%R%
echo  %DIM%  Edition: %EDITION_LABEL%%R%
echo  %DIM%  Login: admin / password%R%
echo  %DIM%  Press Ctrl+C to stop%R%
echo.

uvicorn cassini.main:app --reload --host 0.0.0.0 --port 8000
