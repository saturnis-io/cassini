@echo off
REM OpenSPC Backend Startup Script (Windows)

echo ========================================
echo   OpenSPC Backend Startup
echo ========================================
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

REM Start the server
echo.
echo Starting FastAPI server...
echo Backend will be available at http://localhost:8000
echo API docs at http://localhost:8000/docs
echo Press Ctrl+C to stop
echo.

uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
