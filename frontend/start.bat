@echo off
REM OpenSPC Frontend Startup Script (Windows)

echo ========================================
echo   OpenSPC Frontend Startup
echo ========================================
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

echo Starting development server...
echo Frontend will be available at http://localhost:5173
echo Press Ctrl+C to stop
echo.

call npm run dev
