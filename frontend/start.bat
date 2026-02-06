@echo off
chcp 65001 >nul 2>&1
REM OpenSPC Frontend Startup Script (Windows)

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
echo  %DIM%Frontend Application%R%
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install failed
        pause
        exit /b 1
    )
    echo.
)

echo  %GREEN%→%R% Frontend: %GREEN%http://localhost:5173%R%
echo  %DIM%  Press Ctrl+C to stop%R%
echo.

call npm run dev
