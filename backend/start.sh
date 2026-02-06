#!/bin/bash
# OpenSPC Backend Startup Script (Unix/Mac/Git Bash)

# Colors
BLUE='\033[38;5;25m'
TEAL='\033[38;5;80m'
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
GRAY='\033[90m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}  ██████╗ ██████╗ ███████╗███╗   ██╗███████╗██████╗  ██████╗${RESET}"
echo -e "${BOLD}${BLUE} ██╔═══██╗██╔══██╗██╔════╝████╗  ██║██╔════╝██╔══██╗██╔════╝${RESET}"
echo -e "${BOLD}${BLUE} ██║   ██║██████╔╝█████╗  ██╔██╗ ██║███████╗██████╔╝██║     ${RESET}"
echo -e "${BOLD}${BLUE} ██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║╚════██║██╔═══╝ ██║     ${RESET}"
echo -e "${BOLD}${BLUE} ╚██████╔╝██║     ███████╗██║ ╚████║███████║██║     ╚██████╗${RESET}"
echo -e "${BOLD}${BLUE}  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚══════╝╚═╝      ╚═════╝${RESET}"
echo ""
echo -e " ${DIM}─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─${RESET}${GRAY} UCL${RESET}"
echo -e " ${TEAL}      ●            ●                       ●${RESET}"
echo -e " ${TEAL}● ─ ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ─ ─ ● ─ ─ ─ ─ ─ ● ─ ●${RESET}${GRAY}  CL${RESET}"
echo -e " ${TEAL}                ●              ●${RESET}"
echo -e " ${DIM}─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─${RESET}${GRAY} LCL${RESET}"
echo ""
echo -e " ${DIM}Statistical Process Control Platform${RESET}"
echo -e " ${DIM}Backend API Server${RESET}"
echo ""

# Check if virtual environment exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate

# Install dependencies
echo "Checking dependencies..."
pip install -e . -q

# Run database migrations
echo
echo "Running database migrations..."
alembic upgrade head
if [ $? -ne 0 ]; then
    echo "WARNING: Migration failed - database may need setup"
    echo "Run: alembic upgrade head"
    echo
fi

# Start the server
echo
echo -e " ${GREEN}→${RESET} Backend:  ${GREEN}http://localhost:8000${RESET}"
echo -e " ${GREEN}→${RESET} API Docs: ${GREEN}http://localhost:8000/docs${RESET}"
echo -e " ${DIM}  Press Ctrl+C to stop${RESET}"
echo

uvicorn openspc.main:app --reload --host 0.0.0.0 --port 8000
