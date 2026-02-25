@echo off
chcp 65001 >nul 2>&1
REM Cassini Frontend Startup Script (Windows)

REM Get ESC character for ANSI color support (Windows 10+)
set "ESC="
for /f %%e in ('powershell -noprofile -command "[char]27" 2^>nul') do set "ESC=%%e"

if defined ESC (
    set "GOLD=%ESC%[38;2;212;175;55m"
    set "CREAM=%ESC%[38;2;244;241;222m"
    set "DIM=%ESC%[2m"
    set "BOLD=%ESC%[1m"
    set "GREEN=%ESC%[32m"
    set "GRAY=%ESC%[90m"
    set "ORANGE=%ESC%[38;2;224;90;61m"
    set "R=%ESC%[0m"
) else (
    set "GOLD="
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
echo  %DIM%SPC Platform %CREAM%// %DIM%Frontend Application%R%
echo  %DIM%"In-control, like the Cassini Division"%R%
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
